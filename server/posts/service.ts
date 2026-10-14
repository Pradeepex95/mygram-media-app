import { AuditAction, MediaType, Prisma, Role } from "@prisma/client";
import { prisma } from "@/lib/db";
import { getEnv } from "@/lib/env";
import { sanitizeText } from "@/lib/sanitize";
import { createPresignedViewUrl, deleteObject } from "@/lib/storage";
import { writeAuditLog } from "@/server/admin/audit";
import type { AuthUser } from "@/lib/auth/session";
import { clampPageSize, decodeTimeCursor, encodeTimeCursor } from "@/lib/pagination";

export async function canUpload(user: AuthUser): Promise<boolean> {
  if (user.role === Role.ADMIN) return true;
  return getEnv().ALLOW_SUBSCRIBER_UPLOADS;
}

export async function createPost(params: {
  authorId: string;
  caption?: string;
  media: Array<{
    type: MediaType;
    storageKey: string;
    thumbnailKey?: string | null;
    mimeType: string;
    sizeBytes: number;
    width?: number | null;
    height?: number | null;
    durationSec?: number | null;
  }>;
}) {
  if (!params.media.length) {
    throw new Error("At least one media item is required");
  }

  return prisma.$transaction(async (tx) => {
    const post = await tx.post.create({
      data: {
        authorId: params.authorId,
        caption: params.caption ? sanitizeText(params.caption) : null,
        media: {
          create: params.media.map((m) => ({
            type: m.type,
            storageKey: m.storageKey,
            thumbnailKey: m.thumbnailKey ?? undefined,
            mimeType: m.mimeType,
            sizeBytes: m.sizeBytes,
            width: m.width ?? undefined,
            height: m.height ?? undefined,
            durationSec: m.durationSec ?? undefined,
          })),
        },
      },
      include: {
        media: true,
        author: {
          select: { id: true, username: true, avatarKey: true },
        },
      },
    });

    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
    await tx.story.createMany({
      data: params.media.map((m) => ({
        authorId: params.authorId,
        storageKey: m.storageKey,
        mimeType: m.mimeType,
        type: m.type,
        expiresAt,
      })),
    });

    return {
      ...post,
      likeCount: 0,
      commentCount: 0,
    };
  });
}

export async function listFeed(params: {
  viewerId: string;
  cursor?: string;
  take?: number;
}) {
  const take = clampPageSize(params.take, 12);
  const cursor = decodeTimeCursor(params.cursor);
  const posts = await prisma.post.findMany({
    take: take + 1,
    where: cursor
      ? {
          OR: [
            { createdAt: { lt: cursor.createdAt } },
            { createdAt: cursor.createdAt, id: { lt: cursor.id } },
          ],
        }
      : undefined,
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    select: {
      id: true,
      caption: true,
      createdAt: true,
      likeCount: true,
      commentCount: true,
      media: {
        select: {
          id: true,
          type: true,
          mimeType: true,
          storageKey: true,
          thumbnailKey: true,
          width: true,
          height: true,
          durationSec: true,
        },
      },
      author: {
        select: { id: true, username: true, avatarKey: true },
      },
      likes: {
        where: { userId: params.viewerId },
        select: { id: true },
      },
    },
  });

  const hasMore = posts.length > take;
  const items = hasMore ? posts.slice(0, take) : posts;

  const withUrls = await Promise.all(
    items.map(async (post) => ({
      id: post.id,
      caption: post.caption,
      createdAt: post.createdAt,
      author: {
        ...post.author,
        avatarUrl: post.author.avatarKey
          ? await createPresignedViewUrl(post.author.avatarKey)
          : null,
      },
      likeCount: post.likeCount,
      commentCount: post.commentCount,
      likedByMe: post.likes.length > 0,
      media: await Promise.all(
        post.media.map(async (m) => ({
          id: m.id,
          type: m.type,
          mimeType: m.mimeType,
          width: m.width,
          height: m.height,
          durationSec: m.durationSec,
          url: await createPresignedViewUrl(m.storageKey),
          thumbnailUrl: m.thumbnailKey
            ? await createPresignedViewUrl(m.thumbnailKey)
            : null,
        })),
      ),
    })),
  );

  return {
    items: withUrls,
    nextCursor:
      hasMore && items.length
        ? encodeTimeCursor({
            createdAt: items[items.length - 1].createdAt,
            id: items[items.length - 1].id,
          })
        : null,
  };
}

export async function getPost(params: { postId: string; viewerId: string }) {
  const commentTake = 20;
  const post = await prisma.post.findUnique({
    where: { id: params.postId },
    select: {
      id: true,
      caption: true,
      createdAt: true,
      likeCount: true,
      commentCount: true,
      media: {
        select: {
          id: true,
          type: true,
          mimeType: true,
          storageKey: true,
          thumbnailKey: true,
          width: true,
          height: true,
          durationSec: true,
        },
      },
      author: {
        select: { id: true, username: true, avatarKey: true, bio: true },
      },
      likes: {
        where: { userId: params.viewerId },
        select: { id: true },
      },
      comments: {
        take: commentTake + 1,
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        select: {
          id: true,
          body: true,
          createdAt: true,
          user: { select: { id: true, username: true, avatarKey: true } },
        },
      },
    },
  });

  if (!post) return null;
  const hasMoreComments = post.comments.length > commentTake;
  const comments = hasMoreComments ? post.comments.slice(0, commentTake) : post.comments;

  return {
    id: post.id,
    caption: post.caption,
    createdAt: post.createdAt,
    author: post.author,
    likeCount: post.likeCount,
    commentCount: post.commentCount,
    likedByMe: post.likes.length > 0,
    comments: comments.map((c) => ({
      id: c.id,
      body: c.body,
      createdAt: c.createdAt,
      user: c.user,
    })),
    commentNextCursor:
      hasMoreComments && comments.length
        ? encodeTimeCursor({
            createdAt: comments[comments.length - 1].createdAt,
            id: comments[comments.length - 1].id,
          })
        : null,
    media: await Promise.all(
      post.media.map(async (m) => ({
        id: m.id,
        type: m.type,
        mimeType: m.mimeType,
        width: m.width,
        height: m.height,
        durationSec: m.durationSec,
        url: await createPresignedViewUrl(m.storageKey),
        thumbnailUrl: m.thumbnailKey
          ? await createPresignedViewUrl(m.thumbnailKey)
          : null,
      })),
    ),
  };
}

export async function listComments(params: {
  postId: string;
  cursor?: string;
  take?: number;
}) {
  const take = clampPageSize(params.take);
  const cursor = decodeTimeCursor(params.cursor);
  const rows = await prisma.comment.findMany({
    where: {
      postId: params.postId,
      ...(cursor
        ? {
            OR: [
              { createdAt: { gt: cursor.createdAt } },
              { createdAt: cursor.createdAt, id: { gt: cursor.id } },
            ],
          }
        : {}),
    },
    take: take + 1,
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    select: {
      id: true,
      body: true,
      createdAt: true,
      user: { select: { id: true, username: true } },
    },
  });
  const hasMore = rows.length > take;
  const items = hasMore ? rows.slice(0, take) : rows;
  return {
    items,
    nextCursor:
      hasMore && items.length
        ? encodeTimeCursor({
            createdAt: items[items.length - 1].createdAt,
            id: items[items.length - 1].id,
          })
        : null,
  };
}

export async function toggleLike(params: { postId: string; userId: string }) {
  return prisma.$transaction(
    async (tx) => {
      const existing = await tx.like.findUnique({
        where: {
          postId_userId: { postId: params.postId, userId: params.userId },
        },
        select: { id: true },
      });

      if (existing) {
        await tx.like.delete({ where: { id: existing.id } });
        const post = await tx.post.update({
          where: { id: params.postId },
          data: { likeCount: { decrement: 1 } },
          select: { likeCount: true },
        });
        return { liked: false, likeCount: Math.max(0, post.likeCount) };
      }

      await tx.like.create({
        data: { postId: params.postId, userId: params.userId },
      });
      const post = await tx.post.update({
        where: { id: params.postId },
        data: { likeCount: { increment: 1 } },
        select: { likeCount: true },
      });
      return { liked: true, likeCount: post.likeCount };
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  );
}

export async function addComment(params: {
  postId: string;
  userId: string;
  body: string;
}) {
  const body = sanitizeText(params.body, 1000);
  if (!body) throw new Error("Comment cannot be empty");

  return prisma.$transaction(async (tx) => {
    const comment = await tx.comment.create({
      data: {
        postId: params.postId,
        userId: params.userId,
        body,
      },
      include: {
        user: { select: { id: true, username: true, avatarKey: true } },
      },
    });
    await tx.post.update({
      where: { id: params.postId },
      data: { commentCount: { increment: 1 } },
      select: { id: true },
    });
    return comment;
  });
}

export async function deletePost(params: {
  postId: string;
  actor: AuthUser;
  asAdmin?: boolean;
}) {
  const post = await prisma.post.findUnique({
    where: { id: params.postId },
    include: { media: true },
  });
  if (!post) throw new Error("Post not found");

  if (!params.asAdmin && post.authorId !== params.actor.id) {
    throw new Error("Forbidden");
  }

  for (const media of post.media) {
    try {
      await deleteObject(media.storageKey);
      if (media.thumbnailKey) await deleteObject(media.thumbnailKey);
    } catch {
      // Best-effort cleanup; continue deleting DB rows
    }
  }

  await prisma.$transaction(async (tx) => {
    await tx.story.deleteMany({
      where: { storageKey: { in: post.media.map((m) => m.storageKey) } },
    });
    await tx.post.delete({ where: { id: post.id } });
    if (params.asAdmin) {
      await writeAuditLog({
        actorId: params.actor.id,
        targetId: post.authorId,
        action: AuditAction.DELETE_POST,
        metadata: { postId: post.id },
        client: tx,
      });
    }
  });
}

export async function deleteComment(params: {
  commentId: string;
  actor: AuthUser;
  asAdmin?: boolean;
}) {
  const comment = await prisma.comment.findUnique({
    where: { id: params.commentId },
  });
  if (!comment) throw new Error("Comment not found");

  if (!params.asAdmin && comment.userId !== params.actor.id) {
    throw new Error("Forbidden");
  }

  await prisma.$transaction(async (tx) => {
    await tx.comment.delete({ where: { id: comment.id } });
    await tx.post.update({
      where: { id: comment.postId },
      data: { commentCount: { decrement: 1 } },
      select: { id: true },
    });
    if (params.asAdmin) {
      await writeAuditLog({
        actorId: params.actor.id,
        targetId: comment.userId,
        action: AuditAction.DELETE_COMMENT,
        metadata: { commentId: comment.id, postId: comment.postId },
        client: tx,
      });
    }
  });
}

export async function getProfile(params: {
  username: string;
  viewerId: string;
  cursor?: string;
  take?: number;
}) {
  const take = clampPageSize(params.take);
  const cursor = decodeTimeCursor(params.cursor);
  const user = await prisma.user.findUnique({
    where: { username: params.username },
    select: {
      id: true,
      username: true,
      bio: true,
      avatarKey: true,
      createdAt: true,
      _count: { select: { posts: true } },
    },
  });
  if (!user) return null;

  const posts = await prisma.post.findMany({
    where: {
      authorId: user.id,
      ...(cursor
        ? {
            OR: [
              { createdAt: { lt: cursor.createdAt } },
              { createdAt: cursor.createdAt, id: { lt: cursor.id } },
            ],
          }
        : {}),
    },
    take: take + 1,
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    select: {
      id: true,
      createdAt: true,
      likeCount: true,
      commentCount: true,
      media: {
        take: 1,
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          type: true,
          storageKey: true,
          thumbnailKey: true,
        },
      },
    },
  });
  const hasMore = posts.length > take;
  const items = hasMore ? posts.slice(0, take) : posts;

  return {
    id: user.id,
    username: user.username,
    bio: user.bio,
    postCount: user._count.posts,
    avatarUrl: user.avatarKey ? await createPresignedViewUrl(user.avatarKey) : null,
    posts: await Promise.all(
      items.map(async (post) => ({
        id: post.id,
        likeCount: post.likeCount,
        commentCount: post.commentCount,
        media: await Promise.all(
          post.media.map(async (m) => ({
            id: m.id,
            type: m.type,
            url: await createPresignedViewUrl(m.storageKey),
            thumbnailUrl: m.thumbnailKey
              ? await createPresignedViewUrl(m.thumbnailKey)
              : null,
          })),
        ),
      })),
    ),
    nextCursor:
      hasMore && items.length
        ? encodeTimeCursor({
            createdAt: items[items.length - 1].createdAt,
            id: items[items.length - 1].id,
          })
        : null,
  };
}
