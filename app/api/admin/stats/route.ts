import { SubscriptionStatus } from "@prisma/client";
import { requireAdmin } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { handleRouteError, jsonOk } from "@/lib/api";

export async function GET() {
  try {
    await requireAdmin();
    const now = new Date();

    const [totalUsers, activeSubscriptions, expiredSubscriptions, suspendedUsers, totalPosts] =
      await Promise.all([
        prisma.user.count({ where: { role: "SUBSCRIBER" } }),
        prisma.user.count({
          where: {
            role: "SUBSCRIBER",
            status: SubscriptionStatus.ACTIVE,
            subscriptionEnd: { gt: now },
          },
        }),
        prisma.user.count({
          where: {
            role: "SUBSCRIBER",
            OR: [
              { status: SubscriptionStatus.EXPIRED },
              {
                status: SubscriptionStatus.ACTIVE,
                subscriptionEnd: { lte: now },
              },
            ],
          },
        }),
        prisma.user.count({
          where: { role: "SUBSCRIBER", status: SubscriptionStatus.SUSPENDED },
        }),
        prisma.post.count(),
      ]);

    return jsonOk({
      totalUsers,
      activeSubscriptions,
      expiredSubscriptions,
      suspendedUsers,
      totalPosts,
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
