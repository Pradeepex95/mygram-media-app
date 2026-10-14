import { requireAdmin } from "@/lib/auth/session";
import { assertSameOrigin } from "@/lib/csrf";
import { handleRouteError, jsonError, jsonOk } from "@/lib/api";
import { statusSchema } from "@/lib/validations";
import {
  deleteSubscriber,
  setUserStatus,
} from "@/server/admin/subscribers";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, { params }: Params) {
  try {
    assertSameOrigin(request);
    const admin = await requireAdmin();
    const { id } = await params;
    const body = statusSchema.parse(await request.json());
    const user = await setUserStatus({
      actorId: admin.id,
      userId: id,
      status: body.status,
    });
    return jsonOk({ user });
  } catch (error) {
    if (error instanceof Error && error.message.includes("admin")) {
      return jsonError(error.message, 400);
    }
    return handleRouteError(error);
  }
}

export async function DELETE(request: Request, { params }: Params) {
  try {
    assertSameOrigin(request);
    const admin = await requireAdmin();
    const { id } = await params;
    await deleteSubscriber({ actorId: admin.id, userId: id });
    return jsonOk({ ok: true });
  } catch (error) {
    if (error instanceof Error && error.message.includes("admin")) {
      return jsonError(error.message, 400);
    }
    return handleRouteError(error);
  }
}
