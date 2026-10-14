import { requireAuth } from "@/lib/auth/session";
import { assertSameOrigin } from "@/lib/csrf";
import { handleRouteError, jsonError, jsonOk } from "@/lib/api";
import { deletePost, getPost } from "@/server/posts/service";

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Params) {
  try {
    const user = await requireAuth();
    const { id } = await params;
    const post = await getPost({ postId: id, viewerId: user.id });
    if (!post) return jsonError("Post not found", 404);
    return jsonOk({ post });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function DELETE(request: Request, { params }: Params) {
  try {
    assertSameOrigin(request);
    const user = await requireAuth();
    const { id } = await params;
    await deletePost({ postId: id, actor: user });
    return jsonOk({ ok: true });
  } catch (error) {
    if (error instanceof Error && error.message === "Forbidden") {
      return jsonError("Forbidden", 403);
    }
    if (error instanceof Error && error.message === "Post not found") {
      return jsonError("Post not found", 404);
    }
    return handleRouteError(error);
  }
}
