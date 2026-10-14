import { requireAdmin } from "@/lib/auth/session";
import { assertSameOrigin } from "@/lib/csrf";
import { handleRouteError, jsonError, jsonOk } from "@/lib/api";
import { extendSubscriptionSchema } from "@/lib/validations";
import { extendSubscription } from "@/server/admin/subscribers";

type Params = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: Params) {
  try {
    assertSameOrigin(request);
    const admin = await requireAdmin();
    const { id } = await params;
    const body = extendSubscriptionSchema.parse(await request.json());
    const user = await extendSubscription({
      actorId: admin.id,
      userId: id,
      months: body.months,
      customEndDate: body.customEndDate
        ? new Date(body.customEndDate)
        : undefined,
    });
    return jsonOk({ user });
  } catch (error) {
    if (error instanceof Error && error.message.includes("admin")) {
      return jsonError(error.message, 400);
    }
    return handleRouteError(error);
  }
}
