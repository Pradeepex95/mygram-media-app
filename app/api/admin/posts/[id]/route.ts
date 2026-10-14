import { requireAdmin } from "@/lib/auth/session";
import { assertSameOrigin } from "@/lib/csrf";
import { handleRouteError, jsonError, jsonOk } from "@/lib/api";
import { deletePost } from "@/server/posts/service";

type Params = { params: Promise<{ id: string }> };

export async function DELETE(request: Request, { params }: Params) {
  try {
    assertSameOrigin(request);
    const admin = await requireAdmin();
    const { id } = await params;
    await deletePost({ postId: id, actor: admin, asAdmin: true });
    return jsonOk({ ok: true });
  } catch (error) {
    if (error instanceof Error && error.message === "Post not found") {
      return jsonError("Post not found", 404);
    }
    return handleRouteError(error);
  }
}
