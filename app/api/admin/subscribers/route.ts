import { requireAdmin } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { assertSameOrigin } from "@/lib/csrf";
import { handleRouteError, jsonCreated, jsonOk } from "@/lib/api";
import { createSubscriberSchema, subscriberQuerySchema } from "@/lib/validations";
import { createSubscriber } from "@/server/admin/subscribers";
import { generateStrongPassword, generateUsername } from "@/lib/password";
import { clampPageSize, decodeTimeCursor, encodeTimeCursor } from "@/lib/pagination";

export async function GET(request: Request) {
  try {
    await requireAdmin();
    const { searchParams } = new URL(request.url);
    const query = subscriberQuerySchema.parse({
      q: searchParams.get("q") || undefined,
      status: searchParams.get("status") || undefined,
      cursor: searchParams.get("cursor") || undefined,
      take: searchParams.get("take") || undefined,
    });
    const q = query.q?.toLowerCase() ?? "";
    const cursor = decodeTimeCursor(query.cursor);
    const take = clampPageSize(query.take);

    const users = await prisma.user.findMany({
      where: {
        role: "SUBSCRIBER",
        ...(query.status ? { status: query.status } : {}),
        AND: [
          ...(q
            ? [
                {
                  OR: [{ username: { contains: q } }, { email: { contains: q } }],
                },
              ]
            : []),
          ...(cursor
            ? [
                {
                  OR: [
                    { createdAt: { lt: cursor.createdAt } },
                    { createdAt: cursor.createdAt, id: { lt: cursor.id } },
                  ],
                },
              ]
            : []),
        ],
      },
      take: take + 1,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
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
    const hasMore = users.length > take;
    const items = hasMore ? users.slice(0, take) : users;

    return jsonOk({
      users: items,
      nextCursor:
        hasMore && items.length
          ? encodeTimeCursor({
              createdAt: items[items.length - 1].createdAt,
              id: items[items.length - 1].id,
            })
          : null,
    });
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
      customEndDate: body.customEndDate ? new Date(body.customEndDate) : undefined,
      username: body.username,
      password: body.password,
    });

    return jsonCreated(result);
  } catch (error) {
    return handleRouteError(error);
  }
}
