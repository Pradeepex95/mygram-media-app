import { requireAuth } from "@/lib/auth/session";
import { assertSameOrigin } from "@/lib/csrf";
import { handleRouteError, jsonCreated, jsonError, jsonOk } from "@/lib/api";
import { commentSchema, paginatedQuerySchema } from "@/lib/validations";
import { addComment, listComments } from "@/server/posts/service";

type Params = { params: Promise<{ id: string }> };

export async function GET(request: Request, { params }: Params) {
  try {
    await requireAuth();
    const { id } = await params;
    const { searchParams } = new URL(request.url);
    const query = paginatedQuerySchema.parse({
      cursor: searchParams.get("cursor") ?? undefined,
      take: searchParams.get("take") ?? undefined,
    });
    return jsonOk(
      await listComments({
        postId: id,
        cursor: query.cursor,
        take: query.take,
      }),
    );
  } catch (error) {
    return handleRouteError(error);
  }
}

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
