import { MediaType, Role } from "@prisma/client";
import { prisma } from "@/lib/db";
import type { AuthUser } from "@/lib/auth/session";
import { assertOwnedObjectKey, createPresignedViewUrl, isImageMime, isVideoMime } from "@/lib/storage";

const DAY_MS = 24 * 60 * 60 * 1000;

export async function listActiveStories(viewerId: string) {
  const now = new Date();
  const stories = await prisma.story.findMany({
    where: { expiresAt: { gt: now } },
    orderBy: { createdAt: "asc" },
    include: {
      author: {
        select: { id: true, username: true, avatarKey: true, role: true },
      },
    },
  });

  const groups = new Map<
    string,
    {
      user: {
        id: string;
        username: string;
        avatarUrl: string | null;
        role: Role;
      };
      items: Array<{
        id: string;
        type: MediaType;
        url: string;
        createdAt: Date;
        expiresAt: Date;
      }>;
    }
  >();

  for (const story of stories) {
    const existing = groups.get(story.authorId);
    const item = {
      id: story.id,
      type: story.type,
      url: await createPresignedViewUrl(story.storageKey),
      createdAt: story.createdAt,
      expiresAt: story.expiresAt,
    };
    if (existing) {
      existing.items.push(item);
      continue;
    }
    groups.set(story.authorId, {
      user: {
        id: story.author.id,
        username: story.author.username,
        role: story.author.role,
        avatarUrl: story.author.avatarKey
          ? await createPresignedViewUrl(story.author.avatarKey)
          : null,
      },
      items: [item],
    });
  }

  const all = [...groups.values()];
  const mine = all.find((g) => g.user.id === viewerId) ?? null;
  const others = all.filter((g) => g.user.id !== viewerId);
  return { mine, others };
}

export async function listAuthorStories(authorId: string) {
  const stories = await prisma.story.findMany({
    where: { authorId, expiresAt: { gt: new Date() } },
    orderBy: { createdAt: "asc" },
    include: {
      author: { select: { id: true, username: true, avatarKey: true } },
    },
  });
  const first = stories[0];
  if (!first) return null;

  const [avatarUrl, items] = await Promise.all([
    first.author.avatarKey
      ? createPresignedViewUrl(first.author.avatarKey)
      : Promise.resolve(null),
    Promise.all(
      stories.map(async (story) => ({
        id: story.id,
        type: story.type,
        url: await createPresignedViewUrl(story.storageKey),
        createdAt: story.createdAt,
        expiresAt: story.expiresAt,
      })),
    ),
  ]);

  return {
    user: {
      id: first.author.id,
      username: first.author.username,
      avatarUrl,
    },
    items,
  };
}

export async function createStory(params: {
  user: AuthUser;
  storageKey: string;
  mimeType: string;
}) {
  assertOwnedObjectKey(params.storageKey, params.user.id, "media");
  const type = isVideoMime(params.mimeType)
    ? MediaType.VIDEO
    : isImageMime(params.mimeType)
      ? MediaType.IMAGE
      : null;
  if (!type) throw new Error("Unsupported file type");

  return prisma.story.create({
    data: {
      authorId: params.user.id,
      storageKey: params.storageKey,
      mimeType: params.mimeType,
      type,
      expiresAt: new Date(Date.now() + DAY_MS),
    },
  });
}

export async function updateAdminAvatar(params: {
  user: AuthUser;
  storageKey: string;
}) {
  if (params.user.role !== Role.ADMIN) {
    throw new Error("Only the admin can change this profile photo");
  }
  assertOwnedObjectKey(params.storageKey, params.user.id, "avatar");
  const user = await prisma.user.update({
    where: { id: params.user.id },
    data: { avatarKey: params.storageKey },
  });
  return {
    avatarUrl: await createPresignedViewUrl(user.avatarKey!),
  };
}
