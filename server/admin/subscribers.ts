import { addMonths } from "date-fns";
import { AuditAction, Role, SubscriptionStatus } from "@prisma/client";
import { prisma } from "@/lib/db";
import {
  generateStrongPassword,
  generateUsername,
  hashPassword,
} from "@/lib/password";
import { forceLogoutUser } from "@/lib/auth/session";
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

  const user = await prisma.user.create({
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
    targetId: user.id,
    action: AuditAction.CREATE_SUBSCRIBER,
    metadata: {
      username: user.username,
      subscriptionEnd: end.toISOString(),
    },
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

  const updated = await prisma.user.update({
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
  });

  return updated;
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

  const updated = await prisma.user.update({
    where: { id: user.id },
    data: { status: params.status },
  });

  if (params.status === "SUSPENDED") {
    await forceLogoutUser(user.id);
  }

  await writeAuditLog({
    actorId: params.actorId,
    targetId: user.id,
    action:
      params.status === "SUSPENDED"
        ? AuditAction.SUSPEND_USER
        : AuditAction.REACTIVATE_USER,
  });

  return updated;
}

export async function resetUserPassword(params: {
  actorId: string;
  userId: string;
}) {
  const password = generateStrongPassword();
  const passwordHash = await hashPassword(password);
  const user = await prisma.user.update({
    where: { id: params.userId },
    data: { passwordHash },
  });
  await forceLogoutUser(user.id);
  await writeAuditLog({
    actorId: params.actorId,
    targetId: user.id,
    action: AuditAction.RESET_PASSWORD,
  });
  return { username: user.username, password };
}

export async function forceLogoutSubscriber(params: {
  actorId: string;
  userId: string;
}) {
  await forceLogoutUser(params.userId);
  await writeAuditLog({
    actorId: params.actorId,
    targetId: params.userId,
    action: AuditAction.FORCE_LOGOUT,
  });
}

export async function deleteSubscriber(params: {
  actorId: string;
  userId: string;
}) {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: params.userId } });
  if (user.role === Role.ADMIN) {
    throw new Error("Cannot delete admin");
  }

  await writeAuditLog({
    actorId: params.actorId,
    targetId: user.id,
    action: AuditAction.DELETE_USER,
    metadata: { username: user.username },
  });

  await prisma.user.delete({ where: { id: user.id } });
}
