import { requireAuth } from "@/lib/auth/session";
import { assertSameOrigin } from "@/lib/csrf";
import { handleRouteError, jsonOk } from "@/lib/api";
import { toggleLike } from "@/server/posts/service";

type Params = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: Params) {
  try {
    assertSameOrigin(request);
    const user = await requireAuth();
    const { id } = await params;
    const result = await toggleLike({ postId: id, userId: user.id });
    return jsonOk(result);
  } catch (error) {
    return handleRouteError(error);
  }
}
