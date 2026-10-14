import { addMonths } from "date-fns";
import { AuditAction, Role, SubscriptionStatus } from "@prisma/client";
import { prisma } from "@/lib/db";
import { generateStrongPassword, generateUsername, hashPassword } from "@/lib/password";
import { writeAuditLog } from "@/server/admin/audit";

export async function createSubscriber(params: {
  actorId: string;
  months?: 1 | 3 | 6 | 12;
  customEndDate?: Date;
  username?: string;
  password?: string;
}) {
  let username = (params.username || generateUsername()).toLowerCase();
  for (let i = 0; i < 5; i += 1) {
    const exists = await prisma.user.findUnique({ where: { username } });
    if (!exists) break;
    username = generateUsername();
  }

  const password = params.password || generateStrongPassword();
  const passwordHash = await hashPassword(password);
  const start = new Date();
  const end = params.customEndDate
    ? params.customEndDate
    : addMonths(start, params.months ?? 1);

  const user = await prisma.$transaction(async (tx) => {
    const created = await tx.user.create({
      data: {
        username,
        passwordHash,
        role: Role.SUBSCRIBER,
        status: SubscriptionStatus.ACTIVE,
        subscriptionStart: start,
        subscriptionEnd: end,
      },
    });
    await writeAuditLog({
      actorId: params.actorId,
      targetId: created.id,
      action: AuditAction.CREATE_SUBSCRIBER,
      metadata: {
        username: created.username,
        subscriptionEnd: end.toISOString(),
      },
      client: tx,
    });
    return created;
  });

  return {
    user: {
      id: user.id,
      username: user.username,
      status: user.status,
      subscriptionStart: user.subscriptionStart,
      subscriptionEnd: user.subscriptionEnd,
    },
    credentials: {
      username: user.username,
      password,
    },
  };
}

export async function extendSubscription(params: {
  actorId: string;
  userId: string;
  months?: 1 | 3 | 6 | 12;
  customEndDate?: Date;
}) {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: params.userId } });
  if (user.role === Role.ADMIN) {
    throw new Error("Cannot modify admin subscription");
  }

  const base =
    user.subscriptionEnd && user.subscriptionEnd.getTime() > Date.now()
      ? user.subscriptionEnd
      : new Date();

  const end = params.customEndDate
    ? params.customEndDate
    : addMonths(base, params.months ?? 1);

  return prisma.$transaction(async (tx) => {
    const updated = await tx.user.update({
      where: { id: user.id },
      data: {
        subscriptionEnd: end,
        status: SubscriptionStatus.ACTIVE,
        subscriptionStart: user.subscriptionStart ?? new Date(),
      },
    });
    await writeAuditLog({
      actorId: params.actorId,
      targetId: user.id,
      action: AuditAction.EXTEND_SUBSCRIPTION,
      metadata: { subscriptionEnd: end.toISOString() },
      client: tx,
    });
    return updated;
  });
}

export async function setUserStatus(params: {
  actorId: string;
  userId: string;
  status: Extract<SubscriptionStatus, "ACTIVE" | "SUSPENDED">;
}) {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: params.userId } });
  if (user.role === Role.ADMIN) {
    throw new Error("Cannot suspend admin");
  }

  return prisma.$transaction(async (tx) => {
    if (params.status === "SUSPENDED") {
      await tx.session.updateMany({
        where: { userId: user.id, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    }
    const updated = await tx.user.update({
      where: { id: user.id },
      data: {
        status: params.status,
        ...(params.status === "SUSPENDED"
          ? {
              activeSessionId: null,
              sessionVersion: { increment: 1 },
            }
          : {}),
      },
    });
    await writeAuditLog({
      actorId: params.actorId,
      targetId: user.id,
      action:
        params.status === "SUSPENDED"
          ? AuditAction.SUSPEND_USER
          : AuditAction.REACTIVATE_USER,
      client: tx,
    });
    return updated;
  });
}

export async function resetUserPassword(params: { actorId: string; userId: string }) {
  const password = generateStrongPassword();
  const passwordHash = await hashPassword(password);
  const user = await prisma.$transaction(async (tx) => {
    await tx.session.updateMany({
      where: { userId: params.userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    const updated = await tx.user.update({
      where: { id: params.userId },
      data: {
        passwordHash,
        activeSessionId: null,
        sessionVersion: { increment: 1 },
      },
    });
    await writeAuditLog({
      actorId: params.actorId,
      targetId: updated.id,
      action: AuditAction.RESET_PASSWORD,
      client: tx,
    });
    return updated;
  });
  return { username: user.username, password };
}

export async function forceLogoutSubscriber(params: { actorId: string; userId: string }) {
  await prisma.$transaction(async (tx) => {
    await tx.session.updateMany({
      where: { userId: params.userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    await tx.user.update({
      where: { id: params.userId },
      data: {
        activeSessionId: null,
        sessionVersion: { increment: 1 },
      },
    });
    await writeAuditLog({
      actorId: params.actorId,
      targetId: params.userId,
      action: AuditAction.FORCE_LOGOUT,
      client: tx,
    });
  });
}

export async function deleteSubscriber(params: { actorId: string; userId: string }) {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: params.userId } });
  if (user.role === Role.ADMIN) {
    throw new Error("Cannot delete admin");
  }

  const [likes, comments] = await Promise.all([
    prisma.like.groupBy({
      by: ["postId"],
      where: {
        userId: user.id,
        post: { authorId: { not: user.id } },
      },
      _count: { _all: true },
    }),
    prisma.comment.groupBy({
      by: ["postId"],
      where: {
        userId: user.id,
        post: { authorId: { not: user.id } },
      },
      _count: { _all: true },
    }),
  ]);

  await prisma.$transaction(async (tx) => {
    for (const like of likes) {
      await tx.post.update({
        where: { id: like.postId },
        data: { likeCount: { decrement: like._count._all } },
        select: { id: true },
      });
    }
    for (const comment of comments) {
      await tx.post.update({
        where: { id: comment.postId },
        data: { commentCount: { decrement: comment._count._all } },
        select: { id: true },
      });
    }
    await writeAuditLog({
      actorId: params.actorId,
      targetId: user.id,
      action: AuditAction.DELETE_USER,
      metadata: { username: user.username },
      client: tx,
    });
    await tx.user.delete({ where: { id: user.id } });
  });
}
