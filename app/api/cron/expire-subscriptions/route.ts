import { addDays, startOfDay } from "date-fns";
import { SubscriptionStatus } from "@prisma/client";
import { prisma } from "@/lib/db";
import { jsonError, jsonOk } from "@/lib/api";

export async function GET(request: Request) {
  const auth = request.headers.get("authorization");
  const secret = process.env.CRON_SECRET;
  if (!secret || auth !== `Bearer ${secret}`) {
    return jsonError("Unauthorized", 401);
  }

  const now = new Date();

  const expired = await prisma.user.updateMany({
    where: {
      role: "SUBSCRIBER",
      status: SubscriptionStatus.ACTIVE,
      subscriptionEnd: { lte: now },
    },
    data: { status: SubscriptionStatus.EXPIRED },
  });

  // Reminder window: users expiring in ~3 days (Phase 2 can send email)
  const reminderStart = startOfDay(addDays(now, 3));
  const reminderEnd = addDays(reminderStart, 1);
  const reminding = await prisma.user.findMany({
    where: {
      role: "SUBSCRIBER",
      status: SubscriptionStatus.ACTIVE,
      subscriptionEnd: {
        gte: reminderStart,
        lt: reminderEnd,
      },
    },
    select: { id: true, username: true, email: true, subscriptionEnd: true },
  });

  // Placeholder for email provider integration
  if (reminding.length > 0) {
    console.info(
      JSON.stringify({
        event: "subscription_expiry_reminder",
        count: reminding.length,
        // Do not log emails/PII in production logs beyond counts
      }),
    );
  }

  return jsonOk({
    markedExpired: expired.count,
    remindersQueued: reminding.length,
  });
}
