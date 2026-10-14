import { requireAuth } from "@/lib/auth/session";
import { assertSameOrigin } from "@/lib/csrf";
import { handleRouteError, jsonCreated, jsonError } from "@/lib/api";
import { commentSchema } from "@/lib/validations";
import { addComment } from "@/server/posts/service";

type Params = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: Params) {
  try {
    assertSameOrigin(request);
    const user = await requireAuth();
    const { id } = await params;
    const body = commentSchema.parse(await request.json());
    const comment = await addComment({
      postId: id,
      userId: user.id,
      body: body.body,
    });
    return jsonCreated({ comment });
  } catch (error) {
    if (error instanceof Error && error.message === "Comment cannot be empty") {
      return jsonError(error.message, 400);
    }
    return handleRouteError(error);
  }
}
