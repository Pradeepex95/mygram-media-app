import { prisma } from "@/lib/db";
import { getEnv } from "@/lib/env";
import { verifyPassword } from "@/lib/password";
import {
  AuthError,
  createUserSession,
  isSubscriptionActive,
  subscriptionBlockMessage,
} from "@/lib/auth/session";
import { rateLimit } from "@/lib/rate-limit";

export async function loginWithCredentials(params: {
  username: string;
  password: string;
  userAgent?: string | null;
  ipAddress?: string | null;
}) {
  const env = getEnv();
  const username = params.username.trim().toLowerCase();
  const ip = params.ipAddress ?? "unknown";

  const ipLimit = await rateLimit({
    key: `login:ip:${ip}`,
    limit: 30,
    windowMs: 15 * 60 * 1000,
  });
  if (!ipLimit.success) {
    throw new AuthError("UNAUTHENTICATED", "Too many login attempts. Try again later.");
  }

  const userLimit = await rateLimit({
    key: `login:user:${username}`,
    limit: env.LOGIN_MAX_ATTEMPTS,
    windowMs: env.LOGIN_LOCKOUT_MINUTES * 60 * 1000,
  });
  if (!userLimit.success) {
    throw new AuthError(
      "UNAUTHENTICATED",
      `Too many failed attempts. Try again in ${env.LOGIN_LOCKOUT_MINUTES} minutes.`,
    );
  }

  const user = await prisma.user.findFirst({
    where: {
      OR: [{ username }, { email: username }],
    },
  });

  if (!user) {
    await prisma.loginAttempt.create({
      data: {
        username,
        ipAddress: params.ipAddress ?? undefined,
        success: false,
        reason: "USER_NOT_FOUND",
      },
    });
    throw new AuthError("UNAUTHENTICATED", "Invalid username or password.");
  }

  if (user.lockedUntil && user.lockedUntil.getTime() > Date.now()) {
    await prisma.loginAttempt.create({
      data: {
        userId: user.id,
        username,
        ipAddress: params.ipAddress ?? undefined,
        success: false,
        reason: "LOCKED",
      },
    });
    throw new AuthError(
      "UNAUTHENTICATED",
      `Account temporarily locked. Try again in ${env.LOGIN_LOCKOUT_MINUTES} minutes.`,
    );
  }

  const valid = await verifyPassword(params.password, user.passwordHash);
  if (!valid) {
    const lockState = await prisma.$transaction(async (tx) => {
      const updated = await tx.user.update({
        where: { id: user.id },
        data: { failedLoginCount: { increment: 1 } },
        select: { failedLoginCount: true },
      });
      const lockedUntil =
        updated.failedLoginCount >= env.LOGIN_MAX_ATTEMPTS
          ? new Date(Date.now() + env.LOGIN_LOCKOUT_MINUTES * 60 * 1000)
          : null;
      if (lockedUntil) {
        await tx.user.update({
          where: { id: user.id },
          data: { lockedUntil },
          select: { id: true },
        });
      }
      await tx.loginAttempt.create({
        data: {
          userId: user.id,
          username,
          ipAddress: params.ipAddress ?? undefined,
          success: false,
          reason: "BAD_PASSWORD",
        },
      });
      return { failedLoginCount: updated.failedLoginCount, lockedUntil };
    });

    if (lockState.lockedUntil) {
      throw new AuthError(
        "UNAUTHENTICATED",
        `Too many failed attempts. Account locked for ${env.LOGIN_LOCKOUT_MINUTES} minutes.`,
      );
    }

    throw new AuthError("UNAUTHENTICATED", "Invalid username or password.");
  }

  if (!isSubscriptionActive(user)) {
    await prisma.loginAttempt.create({
      data: {
        userId: user.id,
        username,
        ipAddress: params.ipAddress ?? undefined,
        success: false,
        reason: user.status,
      },
    });
    throw new AuthError(
      user.status === "SUSPENDED" ? "SUSPENDED" : "SUBSCRIPTION_EXPIRED",
      subscriptionBlockMessage(user),
    );
  }

  try {
    const session = await createUserSession({
      user,
      userAgent: params.userAgent,
      ipAddress: params.ipAddress,
    });

    await prisma.loginAttempt.create({
      data: {
        userId: user.id,
        username,
        ipAddress: params.ipAddress ?? undefined,
        success: true,
      },
    });

    return session;
  } catch (error) {
    if (error instanceof AuthError && error.reason === "SESSION_REPLACED") {
      throw error;
    }
    throw error;
  }
}
