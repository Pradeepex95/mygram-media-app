# MyGram

Private, Instagram-style media sharing for invited subscribers. The display name is configurable via `NEXT_PUBLIC_APP_NAME` (default: **MyGram**).

Built with **Next.js 16 (App Router)**, **TypeScript**, **Tailwind CSS**, **Prisma + PostgreSQL**, **JWT HTTP-only cookies**, and **S3-compatible object storage** (Cloudflare R2 / AWS S3). Local development can use `STORAGE_DRIVER=local` when MinIO/R2 is unavailable.

## Features

- Admin-provisioned subscribers (no public self-registration)
- Subscription lifecycle: `ACTIVE` / `EXPIRED` / `SUSPENDED` with middleware (Next.js `proxy`) enforcement on every protected request
- **Single active session per user** (configurable policy)
- Login rate limiting + temporary lockout after failed attempts
- Feed with infinite scroll, image/video mix, likes, comments
- Direct-to-storage uploads via presigned URLs (files never land on the app server)
- Custom video player: autoplay muted when in view, tap to unmute, `controlsList="nodownload"`
- Admin dashboard, subscriber management, content moderation, audit log
- Daily Vercel Cron to mark expired subscriptions (+ reminder hook 3 days before expiry)
- Dark / light mode, mobile bottom nav + desktop sidebar
- Phase 2 payment provider stubs (`server/payments`)

## Architecture decisions

| Topic | Choice |
| --- | --- |
| Auth | Custom JWT in HTTP-only `SameSite=Lax` cookie (`mygram_session`) |
| Password hashing | bcrypt (cost 12) |
| Single-session | `User.activeSessionId` + `User.sessionVersion` + `Session` rows |
| Session policy | `SESSION_POLICY=newest_wins` (default) or `block_if_active` |
| Storage | Private S3-compatible bucket + short-lived signed view URLs |
| Edge auth gate | `proxy.ts` (Next.js 16 Node proxy; replaces deprecated `middleware`) |
| Payments | Stubbed Stripe/Razorpay interfaces for Phase 2 |

**Newest login wins (default):** a successful login creates a new session ID, increments `sessionVersion`, and revokes previous sessions. The old device is redirected to `/login?reason=SESSION_REPLACED` with the message: *You were logged out because your account was used on another device.*

## Prerequisites

- Node.js 20.9+ (22 recommended)
- Docker (for local Postgres + MinIO) **or** hosted Neon/Supabase + R2/S3
- npm 10+

## Local setup

```bash
# 1) Install
npm install

# 2) Copy env and edit secrets
cp .env.example .env

# 3) Start Postgres
docker compose up -d

# 4) Migrate + seed
npx prisma migrate dev
npm run seed

# 5) Develop
npm run dev
```

> **Storage note:** `.env.example` defaults to `STORAGE_DRIVER=local` so you can develop without MinIO/R2. Media is written under `./.storage` via signed tokens (still never accepted as multipart body on post APIs). For production, set `STORAGE_DRIVER=s3` and configure R2 or S3.

Open [http://localhost:3000](http://localhost:3000).

### Seeded accounts

| Role | Username | Password | Notes |
| --- | --- | --- | --- |
| Admin | `admin` (or `ADMIN_USERNAME`) | `ADMIN_PASSWORD` | Full access |
| Subscriber | `demo_active` | `DemoActive!123` | Can log in |
| Subscriber | `demo_expired` | `DemoExpired!123` | Login blocked |
| Subscriber | `demo_suspended` | `DemoSuspended!123` | Login blocked |

## Environment variables

See [`.env.example`](./.env.example) for the full list.

### How to obtain key values

1. **`DATABASE_URL`**
   - **Neon:** create a project → Connection string (pooled or direct).
   - **Supabase:** Project Settings → Database → URI.
   - **Local:** `postgresql://postgres:postgres@localhost:5432/mygram?schema=public`

2. **`AUTH_SECRET`**
   - Generate: `openssl rand -base64 48`
   - Must be at least 32 characters.

3. **Object storage (R2)**
   - Cloudflare dashboard → R2 → Create bucket (keep private).
   - Manage R2 API Tokens → create token with Object Read & Write.
   - Set `S3_ENDPOINT` to `https://<ACCOUNT_ID>.r2.cloudflarestorage.com`
   - Set `S3_FORCE_PATH_STYLE=false` for R2 (or follow Cloudflare docs).
   - `S3_ACCESS_KEY_ID` / `S3_SECRET_ACCESS_KEY` from the token.

4. **Object storage (AWS S3)**
   - Create a private bucket + IAM user with `s3:PutObject`, `s3:GetObject`, `s3:DeleteObject`.
   - Leave `S3_ENDPOINT` empty; set `S3_REGION` and credentials.

5. **Local MinIO**
   - Provided by `docker compose` on `localhost:9000` (console `9001`).
   - Defaults match `.env.example`.

6. **`CRON_SECRET`**
   - Random string; Vercel Cron sends `Authorization: Bearer <CRON_SECRET>`.

7. **Upstash Redis (optional)**
   - Create a Redis database → copy REST URL + token for distributed rate limits.
   - Without it, an in-memory limiter is used (fine for single instance / local).

## Migrations and seed

```bash
npx prisma migrate dev
npm run seed
# or
npx prisma db push && npm run seed
```

## Deploy to Vercel

1. Push this repo to GitHub.
2. Import the project in Vercel.
3. Add all env vars from `.env.example` (production values).
4. Attach Neon/Supabase as `DATABASE_URL`.
5. Point storage at R2 or S3.
6. Deploy. Run migrations against production once:

   ```bash
   npx prisma migrate deploy
   npm run seed   # once, to create admin
   ```

7. Custom domain: Vercel → Project → Settings → Domains → add domain and follow DNS instructions.
8. Cron: `vercel.json` schedules `/api/cron/expire-subscriptions` daily. Ensure `CRON_SECRET` is set; Vercel will call with the bearer token you configure via header in your cron auth (this app expects `Authorization: Bearer $CRON_SECRET`). For Vercel Cron, add a middleware-compatible secret check — configure the cron to include the header via a Route Handler secret query alternative if needed, or use Vercel’s `CRON_SECRET` automatic header support:

   This app accepts:

   ```http
   Authorization: Bearer <CRON_SECRET>
   ```

### Optional Docker deploy

```bash
docker compose up -d
docker build -t mygram .
docker run --env-file .env -p 3000:3000 mygram
```

## Admin: create a subscriber

1. Log in as admin → **Admin** → **Subscribers**.
2. Click **Generate** for a unique username + strong password (or type your own).
3. Choose plan duration (1 / 3 / 6 / 12 months) or a custom end date.
4. Click **Create subscriber**.
5. **Copy credentials immediately** — the plaintext password is shown once and only the bcrypt hash is stored.

Other actions: extend subscription, suspend/reactivate, reset password, force logout, delete user.

## Testing the single-login rule

1. Ensure `SESSION_POLICY=newest_wins`.
2. Log in as `demo_active` in Browser A → open `/feed`.
3. Log in as the same user in Browser B (or a private window).
4. Refresh Browser A (or navigate) → you should land on `/login` with:
   *You were logged out because your account was used on another device.*
5. Optionally set `SESSION_POLICY=block_if_active`, keep Browser A logged in, and attempt login in Browser B → login is rejected while the other session is active.

Automated tests:

```bash
npm test
```

Covers subscription expiry/suspend rules, session policy decisions, and lockout thresholds.

## Content protection (best effort)

- Private bucket; media fetched only via short-lived signed URLs after auth.
- Right-click disabled on media; video uses `controlsList="nodownload"`.
- **This cannot prevent screen recording or determined scraping.** Document that expectation to subscribers.
- Optional username watermark on videos is on the roadmap.

## Scripts

| Command | Description |
| --- | --- |
| `npm run dev` | Next.js dev server |
| `npm run build` / `start` | Production build / serve |
| `npm run lint` | ESLint |
| `npm run typecheck` | TypeScript |
| `npm test` | Vitest |
| `npm run seed` | Seed admin + demo users |
| `npx prisma migrate dev` | Create/apply migrations |

## Project structure

```
app/            App Router pages + API routes
components/     UI, feed, admin, media player
lib/            env, db, auth, storage, rate-limit, validation
server/         domain services (auth, admin, posts, payments stubs)
prisma/         schema + seed
proxy.ts        Auth / subscription / admin gate (Next.js 16)
tests/          Unit tests
```

## Roadmap

- [ ] Stripe / Razorpay subscription checkout + webhooks
- [ ] Username watermark burned into videos
- [ ] Stories (architecture reserved; not implemented)
- [ ] Email reminders 3 days before expiry (cron already queues the query)
- [ ] Avatar upload on profile
- [ ] Chunked multipart upload for very large videos

## License

Private / unlicensed unless you add one.
