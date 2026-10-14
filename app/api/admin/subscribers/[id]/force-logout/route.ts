import { requireAdmin } from "@/lib/auth/session";
import { assertSameOrigin } from "@/lib/csrf";
import { handleRouteError, jsonOk } from "@/lib/api";
import { forceLogoutSubscriber } from "@/server/admin/subscribers";

type Params = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: Params) {
  try {
    assertSameOrigin(request);
    const admin = await requireAdmin();
    const { id } = await params;
    await forceLogoutSubscriber({ actorId: admin.id, userId: id });
    return jsonOk({ ok: true });
  } catch (error) {
    return handleRouteError(error);
  }
}
