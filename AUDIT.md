# MyGram Performance, Reliability, and Security Audit

Date: 2026-10-14  
Scope: the complete current working tree, including the uncommitted stories/avatar work  
Target: stable operation for 1,000 concurrent authenticated users, with headroom to 5,000

## Executive summary

The application has a sound functional foundation: passwords are hashed, authorization is checked in route handlers, sessions are versioned, production S3/R2 uploads and views use signed direct URLs, feed pagination is already bounded, and the main write paths use Zod and CSRF checks.

It is **not ready for 1,000–5,000 concurrent users yet**. The dominant limit is database pressure caused by repeated authentication queries and two Prisma pools. The next limits are unbounded profile/comment/story/admin reads, live aggregate counts, per-request URL signing, and per-instance rate limiting. Production must never use the local storage driver because it proxies and buffers media through Next.js.

The default `newest_wins` session policy still leaves exactly one valid session after concurrent logins. The optional `block_if_active` policy has a check-then-write race: two simultaneous logins can both pass its pre-transaction check, although the final `activeSessionId` still leaves only one valid session.

### Highest-priority sequence

1. Use one Prisma client/pool and one auth resolution per request.
2. Make production require pooled PostgreSQL and Redis.
3. Fix keyset pagination and bound all list/detail queries.
4. Add transactional denormalized counters.
5. Keep all production media bytes on R2/S3/CDN and validate completed uploads.
6. Make login/session transitions atomic and add concurrency integration tests.

## Existing strengths

- `User.activeSessionId` plus `sessionVersion` invalidates old JWTs.
- Session creation, logout, and force logout already use Prisma transactions.
- Subscription status is checked at login, in the proxy, and in `requireAuth`.
- Passwords use bcrypt cost 12 and auth cookies are HTTP-only and SameSite.
- Most mutating routes use Zod, authorization, CSRF checks, and centralized errors.
- Captions and comments are stripped of HTML.
- Production S3/R2 upload and viewing URLs are direct; Next.js only signs them.
- Feed page size is bounded and likes have a database uniqueness constraint.
- Video playback already uses `IntersectionObserver`, muted in-view autoplay, a poster, and `preload="metadata"`.
- Security headers and an admin audit trail are present.

---

## Critical

### C1. Authentication multiplies database work on every navigation

- **Files:** `proxy.ts` (`resolveAuth`, local `PrismaClient`), `lib/auth/session.ts` (`validateTokenAgainstDb`, `requireAuth`), `app/(app)/layout.tsx`, authenticated pages and every protected API route.
- **Problem:** The proxy queries `User` and `Session`, then layouts/pages/routes repeat the same queries. A feed load can authenticate in the proxy, layout, page, `/api/posts`, and `/api/stories`, producing roughly 10–14 auth round trips before feed data. The five-minute heartbeat can add writes.
- **Impact:** PostgreSQL connection saturation and high p95 latency will occur well before 1,000 active users.
- **Proposed fix:** Resolve auth once per request. Reuse a shared server-only request context or cryptographically trusted proxy headers after stripping client-supplied equivalents. Cache validation for 30–60 seconds in Redis, with immediate invalidation on every session/status change. Sample or queue heartbeat writes.

### C2. A second Prisma pool is created in the proxy

- **Files:** `proxy.ts` (`new PrismaClient()`), `lib/db.ts`.
- **Problem:** The proxy and application each create their own Prisma client and connection pool per process.
- **Impact:** Connection usage can double per replica, causing `max_connections` failures under burst traffic or serverless scaling.
- **Proposed fix:** Use the singleton from `lib/db.ts` everywhere. Use a pooled `DATABASE_URL` (Neon/Supabase/PgBouncer) with a small per-instance `connection_limit`; add `DIRECT_URL` for migrations.

### C3. Local storage mode proxies and buffers media through Next.js

- **Files:** `app/api/storage/local/route.ts`, `lib/storage.ts`, `.env.example`.
- **Problem:** Local PUT uses `request.arrayBuffer()` and local GET uses `readFile()`, buffering complete uploads/videos in Node memory. The route is publicly reachable with its HMAC token. `.env.example` defaults to local mode, increasing deployment-misconfiguration risk.
- **Impact:** Concurrent 500 MB videos can exhaust RAM, disk, and event-loop capacity immediately.
- **Proposed fix:** Reject `STORAGE_DRIVER=local` when `NODE_ENV=production`. Production must use direct R2/S3 upload and CDN/object-storage delivery. If retained for development, stream with hard byte limits encoded into the signed token.

---

## High

### H1. Profile posts, post comments, stories, and subscriber lists are unbounded

- **Files:** `server/posts/service.ts` (`getProfile`, `getPost`), `server/stories/service.ts` (`listActiveStories`), `app/api/admin/subscribers/route.ts`.
- **Problem:** These paths call `findMany` or include all comments without `take`/cursor limits. Profile/story responses also sign every media item.
- **Impact:** A large profile, viral post, or active story set creates unbounded DB work, memory, payload size, and signing CPU per request.
- **Proposed fix:** Add stable cursor pagination with maximum page sizes: profile grid 30, comments 20–50, stories bounded per user/page, subscribers 20–100.

### H2. Feed and audit cursor ordering is not stable

- **Files:** `server/posts/service.ts` (`listFeed`), `server/admin/audit.ts` (`listAuditLogs`).
- **Problem:** Queries order by `createdAt` but use only `id` as the Prisma cursor.
- **Impact:** Concurrent inserts or equal timestamps can cause skipped or duplicated rows during infinite scroll.
- **Proposed fix:** Order by `[createdAt desc, id desc]` and use an opaque cursor containing both values, backed by the appropriate composite unique/index.

### H3. Like writes race and run a live `COUNT(*)`

- **Files:** `server/posts/service.ts` (`toggleLike`), `prisma/schema.prisma` (`Post`, `Like`).
- **Problem:** Like toggling is read-modify-write outside a transaction, then executes `like.count`. Concurrent requests can throw unique/not-found errors and return 500.
- **Impact:** Popular posts amplify DB reads and produce user-visible failures.
- **Proposed fix:** Add `Post.likeCount` and update it atomically in the same transaction as Like create/delete. Make operations idempotent and handle Prisma `P2002`/`P2025`.

### H4. Comments have no denormalized counter or paginated write/read contract

- **Files:** `server/posts/service.ts` (`addComment`, `getPost`, `deleteComment`), `prisma/schema.prisma`.
- **Problem:** Feed/detail/admin use relationship counts, while detail loads all comments. Create/delete does not update a stored counter transactionally.
- **Impact:** Aggregate scans and unbounded response work increase with engagement.
- **Proposed fix:** Add `Post.commentCount`, maintain it transactionally, reconcile periodically, and paginate comment reads.

### H5. Redis is optional and the fallback is per-process and unbounded

- **Files:** `lib/rate-limit.ts`, `.env.example`.
- **Problem:** Without Upstash, each replica has an independent `Map`; expired keys are only replaced when revisited and never globally swept. The Redis `INCR` and `EXPIRE` calls are also not atomic.
- **Impact:** Limits can be multiplied by the number of instances and memory grows under high-cardinality attacks.
- **Proposed fix:** Require Redis in production. Use an atomic sliding-window implementation (`@upstash/ratelimit` or Lua), explicit timeouts, graceful fallback policy, and bounded local cleanup for development.

### H6. Login limiting counts successful logins and lockout increments can be lost

- **Files:** `server/auth/login.ts`.
- **Problem:** `login:user:*` increments before password verification, so successful logins consume the “failed” budget. `failedLoginCount` is calculated from a stale read and overwritten, so simultaneous failures can lose increments.
- **Impact:** Legitimate users are locked out while distributed attacks can make lockout behavior inconsistent.
- **Proposed fix:** Separate total/IP and failed/user windows. Increment failures atomically with a conditional update or serializable transaction; reset only after a successful session commit.

### H7. `block_if_active` session policy has a TOCTOU race

- **Files:** `lib/auth/session.ts` (`createUserSession`).
- **Problem:** The active-session check occurs before the transaction. Two simultaneous logins can both observe no active session and both proceed.
- **Impact:** The configured “block new login” behavior is bypassed during simultaneous requests. `newest_wins` still leaves one final valid session, but behavior is nondeterministic.
- **Proposed fix:** Lock the user row (`SELECT ... FOR UPDATE`) or perform a conditional atomic update inside the transaction. Add a real integration test firing simultaneous logins and asserting exactly one surviving session and correct policy behavior.

### H8. Multi-step post creation and moderation writes are not atomic

- **Files:** `server/posts/service.ts` (`createPost`, `deletePost`, `deleteComment`), `server/admin/subscribers.ts`.
- **Problem:** Post/media creation and story creation are separate writes. DB deletion, object deletion, and audit writes can partially succeed. Subscriber creation/status/reset and audit entries are split across operations.
- **Impact:** Partial data, missing audits, orphan media, or inconsistent state after transient failures.
- **Proposed fix:** Put related DB writes in transactions and use an outbox/cleanup job for object-storage side effects. Add idempotency keys to upload completion.

### H9. Upload completion trusts client metadata and does not validate all keys

- **Files:** `app/api/upload/complete/route.ts`, `server/stories/service.ts`, `lib/validations.ts`.
- **Problem:** No S3 `HeadObject` verifies existence, size, or content type. `thumbnailKey` ownership is not validated. The `storageKey.includes()` test is weaker than a strict generated prefix.
- **Impact:** Ghost posts, cross-key attachment if a key is known, and orphaned or inconsistent storage records.
- **Proposed fix:** Require exact `media/{userId}/` and `thumb/{userId}/` prefixes, verify every object with `HeadObject`, and use a server-issued upload intent persisted before completion.

### H10. Social write/read endpoints lack distributed per-user and per-IP limits

- **Files:** post like/comment routes, `app/api/stories/route.ts`, `app/api/upload/complete/route.ts`, profile/feed/story GET routes.
- **Problem:** Only login and upload presign are rate limited.
- **Impact:** Automated likes/comments/stories and signed-URL endpoints can create DB and CPU write/read amplification.
- **Proposed fix:** Add Redis sliding windows by authenticated user and trusted client IP, with route-specific budgets and global abuse protection.

### H11. Signed URL generation is repeated for every response and URLs expire in active clients

- **Files:** `server/posts/service.ts`, `server/stories/service.ts`, `app/api/admin/content/route.ts`, `lib/storage.ts`.
- **Problem:** Feed/profile/story/admin requests sign every media/avatar repeatedly. Default URLs expire after 300 seconds, while mounted clients have no refresh path.
- **Impact:** CPU overhead and broken images/videos during long sessions.
- **Proposed fix:** Cache signed results by storage key until shortly before expiry, use a CDN with tokenized URLs/cookies, and provide a batched refresh path for visible media.

### H12. Storage cleanup is incomplete

- **Files:** `components/feed/upload-form.tsx`, `server/admin/subscribers.ts`, `server/stories/service.ts`, cron routes.
- **Problem:** Failed PUT/complete flows leave objects, user deletion cascades DB rows without deleting objects, avatar replacement leaves the old avatar, and expired stories/login attempts/sessions are never purged.
- **Impact:** Unbounded storage and database growth.
- **Proposed fix:** Upload into a temporary prefix with lifecycle expiry, move/mark complete idempotently, add orphan cleanup and retention cron jobs, and delete referenced user/avatar objects through an outbox worker.

### H13. Dependency audit reports critical and high advisories

- **Files:** `package.json`, `package-lock.json`.
- **Problem:** `npm audit` reports 11 advisories: 2 critical, 8 high, and 1 moderate. The critical chain is in the Vitest/tinypool development toolchain; high findings include Prisma configuration and ESLint glob dependencies.
- **Impact:** Most findings are build/test-time rather than application runtime, but compromised CI or developer tooling remains material. Blind `npm audit fix --force` would propose incompatible downgrades/upgrades.
- **Proposed fix:** Upgrade Vitest/tinypool first and verify tests; then address Prisma and lint dependency chains with version-compatible upgrades/overrides. Re-run audit and document accepted dev-only residual risk.

---

## Medium

### M1. Missing DB timeouts, slow-query telemetry, and pooling documentation

- **Files:** `lib/db.ts`, `prisma/schema.prisma`, `.env.example`, `README.md`.
- **Problem:** There is no statement timeout, transaction timeout policy, slow-query logging over 200 ms, `DIRECT_URL`, or documented serverless pool size.
- **Proposed fix:** Configure pooled/direct URLs, statement/transaction timeouts, Prisma query event timing in development, and production metrics without parameter values.

### M2. External Redis and storage operations have no explicit timeout/retry policy

- **Files:** `lib/rate-limit.ts`, `lib/storage.ts`.
- **Problem:** Upstash fetches and S3 commands can wait on dependency/network failures.
- **Proposed fix:** Add short abort/connect/socket timeouts and bounded exponential backoff only for idempotent operations. Define fail-safe behavior per endpoint.

### M3. Admin content uses a hard cap but no pagination

- **Files:** `app/api/admin/content/route.ts`, `components/admin/content-panel.tsx`.
- **Problem:** The API returns only the latest 100 posts/comments with no next cursor, making older moderation records inaccessible.
- **Proposed fix:** Add stable cursor pagination and a bounded client list.

### M4. Username/email search does not scale

- **Files:** `app/api/admin/subscribers/route.ts`.
- **Problem:** `contains` searches can scan the subscriber table; the result is unbounded.
- **Proposed fix:** Paginate and use prefix search or PostgreSQL `pg_trgm` GIN indexes.

### M5. Feed client retains every loaded post and video

- **Files:** `components/feed/feed-list.tsx`, `components/media/video-player.tsx`.
- **Problem:** Infinite scroll appends forever. Each video retains a DOM node, observer, and `src`; off-screen videos pause but remain loaded.
- **Proposed fix:** Virtualize/window the list, use a shared/near-viewport observer, remove `src` far off-screen, call `video.load()` when unloading, and cap retained pages.

### M6. Upload preview object URLs leak

- **Files:** `components/feed/upload-form.tsx`.
- **Problem:** Re-selecting a file creates a new object URL without revoking the previous preview; cleanup only occurs in the thumbnail helper.
- **Proposed fix:** Revoke the old URL on replacement and on component unmount.

### M7. Images are raw originals without responsive variants

- **Files:** `components/feed/post-card.tsx`, profile/story components, upload pipeline.
- **Problem:** Raw `<img>` tags load original objects; no 320/640/1080 WebP/AVIF variants, reliable dimensions, blur placeholders, or stable CDN URLs for `next/image`.
- **Proposed fix:** Generate variants asynchronously or use Cloudflare Images/R2 image transforms, then use `next/image` with accurate `sizes` and placeholders.

### M8. Video is progressive-only and not resumable

- **Files:** `components/feed/upload-form.tsx`, `components/media/video-player.tsx`, `lib/storage.ts`.
- **Problem:** A single PUT has no multipart retry/resume; large MP4/MOV files have no adaptive bitrate.
- **Proposed fix:** Add S3 multipart upload intents and retry/resume. For scale, evaluate Cloudflare Stream or Mux HLS; this is a paid/architecture decision requiring approval.

### M9. Broad client boundaries increase first-load JavaScript

- **Files:** `components/feed/feed-list.tsx`, `post-card.tsx`, `layout/app-shell.tsx`, uploader, story and admin panels.
- **Problem:** Large route sections are client components and pull icons, toasts, themes, and interaction code into initial bundles.
- **Proposed fix:** Server-render feed/profile shells and first pages, isolate like/comment/nav controls, and dynamically import video/uploader/admin-only code. Confirm with bundle analyzer.

### M10. Missing route-level reliability UI

- **Files:** `app/` (no `error.tsx`, `global-error.tsx`, `not-found.tsx`, or segment loading boundaries).
- **Problem:** RSC/data failures can surface generic framework errors rather than recoverable messages.
- **Proposed fix:** Add global and segment error boundaries, not-found, loading skeletons, reset actions, and dependency-specific friendly errors.

### M11. API error handling is duplicated and incomplete

- **Files:** all `app/api/**/route.ts`, `lib/api.ts`, storage/cron routes.
- **Problem:** Most routes manually repeat try/catch/auth/validation; storage and cron paths do not consistently use the wrapper. Prisma known errors become generic 500s and logging lacks correlation IDs.
- **Proposed fix:** Standardize a typed route wrapper for auth, role, Zod input, CSRF, rate limiting, request IDs, safe structured logs, and Prisma error mapping.

### M12. CSRF permits missing Origin and IP trust is spoofable

- **Files:** `lib/csrf.ts`, `lib/api.ts` (`clientIp`).
- **Problem:** Mutating requests without Origin pass. The first `X-Forwarded-For` value is trusted without validating a known proxy.
- **Proposed fix:** Require valid Origin/`Sec-Fetch-Site` for browser routes and explicitly exempt bearer-auth cron. Trust only platform-provided IP headers after the edge strips user input.

### M13. No health endpoint or dependency readiness signal

- **Files:** `app/api` (missing `/api/health`).
- **Problem:** Load balancers and monitors cannot distinguish process health from DB/Redis failure.
- **Proposed fix:** Add shallow liveness and authenticated/deployment-safe readiness checks for DB and Redis with tight timeouts.

### M14. Data-retention tables grow indefinitely

- **Files:** `prisma/schema.prisma` (`Session`, `Story`, `LoginAttempt`), cron routes.
- **Problem:** Expired/revoked sessions, expired stories, and historical login attempts are not deleted or archived.
- **Proposed fix:** Define retention periods and a batched indexed cleanup job.

### M15. Some frequent indexes need refinement

- **Files:** `prisma/schema.prisma`.
- **Problem:** `Post` lacks the requested stable `(createdAt, id)` index; Story deletion by `storageKey` has no index. `User.username` has both a unique index and redundant explicit index.
- **Proposed fix:** Add `Post(createdAt, id)` and `Story(storageKey)` indexes; retain Like unique and Comment/Post/Session/LoginAttempt indexes; remove redundant username index after query-plan verification.

### M16. Signed URL and CDN cache policy is undeveloped

- **Files:** `lib/storage.ts`, media components, deployment docs.
- **Problem:** Private object URLs are signed directly without a documented CDN origin/access policy, cache key strategy, or token refresh model.
- **Proposed fix:** Put Cloudflare CDN in front of R2, use signed cookies/tokens or cache-compatible URLs, and document expiry and invalidation.

### M17. Observability baseline is missing

- **Files:** `package.json`, `package-lock.json`.
- **Problem:** No Sentry, pino, metrics, coverage target, or service-level objective is enforced.
- **Proposed fix:** Add redacted pino logs/Sentry behind env flags, request correlation IDs, latency/error metrics, and measured critical-path coverage.

---

## Low

### L1. Redundant and unused data increases payloads

- **Files:** `server/posts/service.ts`.
- **Problem:** `getProfile.viewerId` is unused; comment author `avatarKey` is selected but not converted or consumed in the current detail UI.
- **Proposed fix:** Remove unused fields/parameters or implement the intended behavior.

### L2. Admin stats run several independent counts

- **Files:** `app/api/admin/stats/route.ts`.
- **Problem:** Five counts run in parallel and are admin-only, so current risk is low, but frequent refreshes scan growing tables.
- **Proposed fix:** Cache briefly or maintain a materialized/summary view if the dashboard becomes hot.

### L3. Post delete performs serial object deletes

- **Files:** `server/posts/service.ts` (`deletePost`).
- **Problem:** Objects are deleted one by one and errors are silently ignored.
- **Proposed fix:** Queue bounded-concurrency deletion, log failures safely, and retry from an outbox.

### L4. CSP remains permissive

- **Files:** `next.config.ts`.
- **Problem:** `unsafe-inline`, `unsafe-eval`, and broad HTTP/HTTPS media origins reduce XSS/CSP protection.
- **Proposed fix:** Use nonces in production and restrict media/image origins to the configured CDN.

### L5. Story viewer accessibility needs hardening

- **Files:** `components/feed/story-viewer.tsx`, `story-bar.tsx`.
- **Problem:** Custom modal/focus behavior is weaker than an accessible dialog primitive.
- **Proposed fix:** Use Radix Dialog, focus trapping/restoration, keyboard semantics, and announced progress.

### L6. Existing tests are mostly pure unit tests

- **Files:** `tests/`.
- **Problem:** They do not exercise the database-backed session race, API auth, cursor pagination, Redis degradation, or subscription transitions.
- **Proposed fix:** Add Postgres integration tests and concurrency tests before claiming load readiness.

---

## Media path verification

| Mode | Upload bytes | View bytes | Verdict |
|---|---|---|---|
| `STORAGE_DRIVER=s3` | Browser → R2/S3 presigned PUT | Browser → signed R2/S3/CDN URL | Correct production design; Next signs only |
| `STORAGE_DRIVER=local` | Browser → Next route → disk | Disk → Next route → browser | Development only; unsafe at target load |

Production readiness requires enforcing the first row.

## Single-login race assessment

- **`newest_wins`:** concurrent transactions can both create sessions, but the final atomic `User.activeSessionId` and `sessionVersion` make only the last token valid. Strict one-session survival is preserved.
- **`block_if_active`:** the pre-transaction active-session check can race. Both requests may be accepted before one ultimately invalidates the other. The final state still has one valid session, but the configured “block” contract is violated.
- **Required proof:** an integration test should issue many simultaneous logins, collect every cookie, and assert exactly one passes a protected request. A second test must assert only one login response succeeds under `block_if_active`.

## Proposed phase mapping

- **Phase 1:** C1, C2, H1–H4, H8, M1, M3–M4, M15.
- **Phase 2:** H5, H10–H11, M2, M12, M16.
- **Phase 3:** C3, H9, H12, M5–M8, orphan cleanup.
- **Phase 4:** H6–H8, M10–M14, standard API wrapper and concurrency tests.
- **Phase 5:** M5–M9 plus measured bundle/Lighthouse work.
- **Phase 6:** prove capacity with k6 and report real bottlenecks.
- **Phase 7:** M17, structured logs, Sentry, metrics, audit remediation, coverage.
- **Phase 8:** production topology, costs, backups, rollback, capacity thresholds.

## Paid or major architecture decisions requiring approval

1. **Video transcoding/HLS:** Cloudflare Stream or Mux versus self-managed transcoding.
2. **Image variants:** Cloudflare Images versus an application-owned worker/pipeline.
3. **Database acceleration:** managed pooler only versus Prisma Accelerate.
4. **Hosting target:** Vercel Pro/serverless versus long-lived containers behind a load balancer.

No feature rewrite or UI redesign is required to address the findings.

## Phase 0 verification baseline

- `npm run lint`: passed.
- `npm run build`: passed; all application and API routes compiled.
- `npm test`: passed, 4 files / 12 tests.
- `npm run typecheck`: passed on the authoritative rerun after the build generated route types (the initial parallel run raced with `.next/types` regeneration).
- `npm audit`: 11 advisories (2 critical, 8 high, 1 moderate), tracked in H13.
