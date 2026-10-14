import { SubscriptionStatus } from "@prisma/client";
import { requireAdmin } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { assertSameOrigin } from "@/lib/csrf";
import { handleRouteError, jsonCreated, jsonOk } from "@/lib/api";
import { createSubscriberSchema } from "@/lib/validations";
import { createSubscriber } from "@/server/admin/subscribers";
import { generateStrongPassword, generateUsername } from "@/lib/password";

export async function GET(request: Request) {
  try {
    await requireAdmin();
    const { searchParams } = new URL(request.url);
    const q = searchParams.get("q")?.trim().toLowerCase() || "";
    const status = searchParams.get("status");

    const users = await prisma.user.findMany({
      where: {
        role: "SUBSCRIBER",
        ...(q
          ? {
              OR: [
                { username: { contains: q } },
                { email: { contains: q } },
              ],
            }
          : {}),
        ...(status &&
        ["ACTIVE", "EXPIRED", "SUSPENDED"].includes(status)
          ? { status: status as SubscriptionStatus }
          : {}),
      },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        username: true,
        email: true,
        status: true,
        subscriptionStart: true,
        subscriptionEnd: true,
        createdAt: true,
        activeSessionId: true,
        _count: { select: { posts: true } },
      },
    });

    return jsonOk({ users });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const admin = await requireAdmin();
    const url = new URL(request.url);

    if (url.searchParams.get("generate") === "1") {
      return jsonOk({
        username: generateUsername(),
        password: generateStrongPassword(),
      });
    }

    const body = createSubscriberSchema.parse(await request.json());
    const result = await createSubscriber({
      actorId: admin.id,
      months: body.months,
      customEndDate: body.customEndDate
        ? new Date(body.customEndDate)
        : undefined,
      username: body.username,
      password: body.password,
    });

    return jsonCreated(result);
  } catch (error) {
    return handleRouteError(error);
  }
}
