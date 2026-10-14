import { Role, SubscriptionStatus, type User } from "@prisma/client";
import { prisma } from "@/lib/db";
import { getEnv } from "@/lib/env";
import {
  clearSessionCookie,
  readSessionCookie,
  signSessionToken,
  verifySessionToken,
  type SessionTokenPayload,
} from "@/lib/auth/tokens";

export type AuthUser = {
  id: string;
  username: string;
  email: string | null;
  role: Role;
  status: SubscriptionStatus;
  bio: string | null;
  avatarKey: string | null;
  subscriptionStart: Date | null;
  subscriptionEnd: Date | null;
  sessionId: string;
  sessionVersion: number;
};

export type AuthFailureReason =
  | "UNAUTHENTICATED"
  | "SESSION_REPLACED"
  | "SESSION_EXPIRED"
  | "SUBSCRIPTION_EXPIRED"
  | "SUSPENDED"
  | "USER_NOT_FOUND";

export class AuthError extends Error {
  reason: AuthFailureReason;

  constructor(reason: AuthFailureReason, message: string) {
    super(message);
    this.reason = reason;
  }
}

export function isSubscriptionActive(user: Pick<User, "role" | "status" | "subscriptionEnd">) {
  if (user.role === Role.ADMIN) return true;
  if (user.status === SubscriptionStatus.SUSPENDED) return false;
  if (user.status === SubscriptionStatus.EXPIRED) return false;
  if (user.subscriptionEnd && user.subscriptionEnd.getTime() < Date.now()) {
    return false;
  }
  return user.status === SubscriptionStatus.ACTIVE;
}

export function subscriptionBlockMessage(
  user: Pick<User, "status" | "subscriptionEnd">,
): string {
  if (user.status === SubscriptionStatus.SUSPENDED) {
    return "Your account has been suspended. Contact admin.";
  }
  return "Your subscription has expired. Contact admin.";
}

export async function createUserSession(params: {
  user: User;
  userAgent?: string | null;
  ipAddress?: string | null;
}) {
  const env = getEnv();
  const expiresAt = new Date(Date.now() + env.SESSION_MAX_AGE_SECONDS * 1000);

  if (
    env.SESSION_POLICY === "block_if_active" &&
    params.user.activeSessionId
  ) {
    const existing = await prisma.session.findUnique({
      where: { id: params.user.activeSessionId },
    });
    if (
      existing &&
      !existing.revokedAt &&
      existing.expiresAt.getTime() > Date.now()
    ) {
      throw new AuthError(
        "SESSION_REPLACED",
        "Another device is already logged in with this account.",
      );
    }
  }

  const session = await prisma.$transaction(async (tx) => {
    if (params.user.activeSessionId) {
      await tx.session.updateMany({
        where: {
          userId: params.user.id,
          revokedAt: null,
        },
        data: { revokedAt: new Date() },
      });
    }

    const created = await tx.session.create({
      data: {
        userId: params.user.id,
        userAgent: params.userAgent ?? undefined,
        ipAddress: params.ipAddress ?? undefined,
        expiresAt,
      },
    });

    await tx.user.update({
      where: { id: params.user.id },
      data: {
        activeSessionId: created.id,
        sessionVersion: { increment: 1 },
        failedLoginCount: 0,
        lockedUntil: null,
      },
    });

    return created;
  });

  const refreshed = await prisma.user.findUniqueOrThrow({
    where: { id: params.user.id },
  });

  const token = await signSessionToken(
    {
      sub: refreshed.id,
      sid: session.id,
      role: refreshed.role,
      username: refreshed.username,
      sv: refreshed.sessionVersion,
    },
    expiresAt,
  );

  return { token, expiresAt, sessionId: session.id, user: refreshed };
}

export async function revokeSession(sessionId: string, userId: string) {
  await prisma.$transaction([
    prisma.session.updateMany({
      where: { id: sessionId, userId },
      data: { revokedAt: new Date() },
    }),
    prisma.user.update({
      where: { id: userId },
      data: {
        activeSessionId: null,
        sessionVersion: { increment: 1 },
      },
    }),
  ]);
}

export async function forceLogoutUser(userId: string) {
  await prisma.$transaction([
    prisma.session.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    }),
    prisma.user.update({
      where: { id: userId },
      data: {
        activeSessionId: null,
        sessionVersion: { increment: 1 },
      },
    }),
  ]);
}

export async function validateTokenAgainstDb(
  payload: SessionTokenPayload,
): Promise<{ user: AuthUser } | { error: AuthError }> {
  const user = await prisma.user.findUnique({
    where: { id: payload.sub },
  });

  if (!user) {
    return {
      error: new AuthError("USER_NOT_FOUND", "Account not found."),
    };
  }

  if (
    !user.activeSessionId ||
    user.activeSessionId !== payload.sid ||
    user.sessionVersion !== payload.sv
  ) {
    return {
      error: new AuthError(
        "SESSION_REPLACED",
        "You were logged out because your account was used on another device.",
      ),
    };
  }

  const session = await prisma.session.findUnique({
    where: { id: payload.sid },
  });

  if (!session || session.revokedAt || session.expiresAt.getTime() < Date.now()) {
    return {
      error: new AuthError("SESSION_EXPIRED", "Your session has expired. Please log in again."),
    };
  }

  if (!isSubscriptionActive(user)) {
    return {
      error: new AuthError(
        user.status === SubscriptionStatus.SUSPENDED ? "SUSPENDED" : "SUBSCRIPTION_EXPIRED",
        subscriptionBlockMessage(user),
      ),
    };
  }

  // Lightweight heartbeat: refresh lastSeenAt occasionally
  if (Date.now() - session.lastSeenAt.getTime() > 5 * 60 * 1000) {
    await prisma.session.update({
      where: { id: session.id },
      data: { lastSeenAt: new Date() },
    });
  }

  return {
    user: {
      id: user.id,
      username: user.username,
      email: user.email,
      role: user.role,
      status: user.status,
      bio: user.bio,
      avatarKey: user.avatarKey,
      subscriptionStart: user.subscriptionStart,
      subscriptionEnd: user.subscriptionEnd,
      sessionId: session.id,
      sessionVersion: user.sessionVersion,
    },
  };
}

export async function requireAuth(): Promise<AuthUser> {
  const token = await readSessionCookie();
  if (!token) {
    throw new AuthError("UNAUTHENTICATED", "Please log in.");
  }

  const payload = await verifySessionToken(token);
  if (!payload) {
    await clearSessionCookie();
    throw new AuthError("UNAUTHENTICATED", "Please log in.");
  }

  const result = await validateTokenAgainstDb(payload);
  if ("error" in result) {
    if (result.error.reason === "SESSION_REPLACED" || result.error.reason === "SESSION_EXPIRED") {
      await clearSessionCookie();
    }
    throw result.error;
  }

  return result.user;
}

export async function requireAdmin(): Promise<AuthUser> {
  const user = await requireAuth();
  if (user.role !== Role.ADMIN) {
    throw new AuthError("UNAUTHENTICATED", "Admin access required.");
  }
  return user;
}

export async function getOptionalAuth(): Promise<AuthUser | null> {
  try {
    return await requireAuth();
  } catch {
    return null;
  }
}
