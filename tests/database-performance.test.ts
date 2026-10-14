import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Role, SubscriptionStatus } from "@prisma/client";
import { prisma } from "@/lib/db";
import type { AuthUser } from "@/lib/auth/session";
import { addComment, deleteComment, listFeed, toggleLike } from "@/server/posts/service";

const suffix = `${Date.now()}_${Math.random().toString(36).slice(2)}`;
let user: AuthUser;
let postId: string;

describe.sequential("database counters and keyset pagination", () => {
  beforeAll(async () => {
    const created = await prisma.user.create({
      data: {
        username: `phase1_${suffix}`,
        passwordHash: "integration-test-only",
        role: Role.SUBSCRIBER,
        status: SubscriptionStatus.ACTIVE,
        subscriptionStart: new Date(),
        subscriptionEnd: new Date(Date.now() + 86_400_000),
      },
    });
    user = {
      id: created.id,
      username: created.username,
      email: created.email,
      role: created.role,
      status: created.status,
      bio: created.bio,
      avatarKey: created.avatarKey,
      subscriptionStart: created.subscriptionStart,
      subscriptionEnd: created.subscriptionEnd,
      sessionId: "integration-test",
      sessionVersion: created.sessionVersion,
    };
    const post = await prisma.post.create({
      data: {
        authorId: created.id,
        caption: "counter test",
      },
    });
    postId = post.id;
  });

  afterAll(async () => {
    if (user?.id) {
      await prisma.user.delete({ where: { id: user.id } }).catch(() => undefined);
    }
  });

  it("maintains like and comment counters transactionally", async () => {
    const liked = await toggleLike({ postId, userId: user.id });
    expect(liked).toEqual({ liked: true, likeCount: 1 });

    const comment = await addComment({
      postId,
      userId: user.id,
      body: "hello",
    });
    let post = await prisma.post.findUniqueOrThrow({ where: { id: postId } });
    expect(post.commentCount).toBe(1);

    await deleteComment({ commentId: comment.id, actor: user });
    const unliked = await toggleLike({ postId, userId: user.id });
    post = await prisma.post.findUniqueOrThrow({ where: { id: postId } });
    expect(unliked).toEqual({ liked: false, likeCount: 0 });
    expect(post.likeCount).toBe(0);
    expect(post.commentCount).toBe(0);
  });

  it("returns non-overlapping feed pages with opaque cursors", async () => {
    await prisma.post.createMany({
      data: [
        { authorId: user.id, caption: "page two" },
        { authorId: user.id, caption: "page three" },
      ],
    });

    const first = await listFeed({ viewerId: user.id, take: 2 });
    expect(first.items).toHaveLength(2);
    expect(first.nextCursor).toBeTypeOf("string");

    const second = await listFeed({
      viewerId: user.id,
      take: 2,
      cursor: first.nextCursor ?? undefined,
    });
    const firstIds = new Set(first.items.map((item) => item.id));
    expect(second.items.every((item) => !firstIds.has(item.id))).toBe(true);
  });
});
