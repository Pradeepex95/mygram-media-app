import { requireAdmin } from "@/lib/auth/session";
import { assertSameOrigin } from "@/lib/csrf";
import { handleRouteError, jsonError, jsonOk } from "@/lib/api";
import { deleteComment } from "@/server/posts/service";

type Params = { params: Promise<{ id: string }> };

export async function DELETE(request: Request, { params }: Params) {
  try {
    assertSameOrigin(request);
    const admin = await requireAdmin();
    const { id } = await params;
    await deleteComment({ commentId: id, actor: admin, asAdmin: true });
    return jsonOk({ ok: true });
  } catch (error) {
    if (error instanceof Error && error.message === "Comment not found") {
      return jsonError("Comment not found", 404);
    }
    return handleRouteError(error);
  }
}
