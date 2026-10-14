import { MediaType, Role } from "@prisma/client";
import { prisma } from "@/lib/db";
import { getEnv } from "@/lib/env";
import { sanitizeText } from "@/lib/sanitize";
import { createPresignedViewUrl, deleteObject } from "@/lib/storage";
import { writeAuditLog } from "@/server/admin/audit";
import { AuditAction } from "@prisma/client";
import type { AuthUser } from "@/lib/auth/session";

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

  return prisma.post.create({
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
      _count: { select: { likes: true, comments: true } },
    },
  });
}

export async function listFeed(params: {
  viewerId: string;
  cursor?: string;
  take?: number;
}) {
  const take = params.take ?? 12;
  const posts = await prisma.post.findMany({
    take: take + 1,
    ...(params.cursor ? { cursor: { id: params.cursor }, skip: 1 } : {}),
    orderBy: { createdAt: "desc" },
    include: {
      media: true,
      author: {
        select: { id: true, username: true, avatarKey: true },
      },
      likes: {
        where: { userId: params.viewerId },
        select: { id: true },
      },
      _count: { select: { likes: true, comments: true } },
    },
  });

  const hasMore = posts.length > take;
  const items = hasMore ? posts.slice(0, take) : posts;

  const withUrls = await Promise.all(
    items.map(async (post) => ({
      id: post.id,
      caption: post.caption,
      createdAt: post.createdAt,
      author: post.author,
      likeCount: post._count.likes,
      commentCount: post._count.comments,
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
    nextCursor: hasMore ? items[items.length - 1]?.id : null,
  };
}

export async function getPost(params: { postId: string; viewerId: string }) {
  const post = await prisma.post.findUnique({
    where: { id: params.postId },
    include: {
      media: true,
      author: {
        select: { id: true, username: true, avatarKey: true, bio: true },
      },
      likes: {
        where: { userId: params.viewerId },
        select: { id: true },
      },
      comments: {
        orderBy: { createdAt: "asc" },
        include: {
          user: { select: { id: true, username: true, avatarKey: true } },
        },
      },
      _count: { select: { likes: true, comments: true } },
    },
  });

  if (!post) return null;

  return {
    id: post.id,
    caption: post.caption,
    createdAt: post.createdAt,
    author: post.author,
    likeCount: post._count.likes,
    commentCount: post._count.comments,
    likedByMe: post.likes.length > 0,
    comments: post.comments.map((c) => ({
      id: c.id,
      body: c.body,
      createdAt: c.createdAt,
      user: c.user,
    })),
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

export async function toggleLike(params: { postId: string; userId: string }) {
  const existing = await prisma.like.findUnique({
    where: {
      postId_userId: { postId: params.postId, userId: params.userId },
    },
  });

  if (existing) {
    await prisma.like.delete({ where: { id: existing.id } });
    const count = await prisma.like.count({ where: { postId: params.postId } });
    return { liked: false, likeCount: count };
  }

  await prisma.like.create({
    data: { postId: params.postId, userId: params.userId },
  });
  const count = await prisma.like.count({ where: { postId: params.postId } });
  return { liked: true, likeCount: count };
}

export async function addComment(params: {
  postId: string;
  userId: string;
  body: string;
}) {
  const body = sanitizeText(params.body, 1000);
  if (!body) throw new Error("Comment cannot be empty");

  return prisma.comment.create({
    data: {
      postId: params.postId,
      userId: params.userId,
      body,
    },
    include: {
      user: { select: { id: true, username: true, avatarKey: true } },
    },
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

  await prisma.post.delete({ where: { id: post.id } });

  if (params.asAdmin) {
    await writeAuditLog({
      actorId: params.actor.id,
      targetId: post.authorId,
      action: AuditAction.DELETE_POST,
      metadata: { postId: post.id },
    });
  }
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

  if (
    !params.asAdmin &&
    comment.userId !== params.actor.id
  ) {
    throw new Error("Forbidden");
  }

  await prisma.comment.delete({ where: { id: comment.id } });

  if (params.asAdmin) {
    await writeAuditLog({
      actorId: params.actor.id,
      targetId: comment.userId,
      action: AuditAction.DELETE_COMMENT,
      metadata: { commentId: comment.id, postId: comment.postId },
    });
  }
}

export async function getProfile(params: {
  username: string;
  viewerId: string;
}) {
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
    where: { authorId: user.id },
    orderBy: { createdAt: "desc" },
    include: {
      media: true,
      _count: { select: { likes: true, comments: true } },
    },
  });

  return {
    id: user.id,
    username: user.username,
    bio: user.bio,
    postCount: user._count.posts,
    avatarUrl: user.avatarKey
      ? await createPresignedViewUrl(user.avatarKey)
      : null,
    posts: await Promise.all(
      posts.map(async (post) => ({
        id: post.id,
        likeCount: post._count.likes,
        commentCount: post._count.comments,
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
  };
}
