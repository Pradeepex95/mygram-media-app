import { requireAuth } from "@/lib/auth/session";
import { handleRouteError, jsonError, jsonOk } from "@/lib/api";
import { paginatedQuerySchema } from "@/lib/validations";
import { getProfile } from "@/server/posts/service";

type Params = { params: Promise<{ username: string }> };

export async function GET(request: Request, { params }: Params) {
  try {
    const user = await requireAuth();
    const { username } = await params;
    const { searchParams } = new URL(request.url);
    const query = paginatedQuerySchema.parse({
      cursor: searchParams.get("cursor") ?? undefined,
      take: searchParams.get("take") ?? undefined,
    });
    const profile = await getProfile({
      username: username.toLowerCase(),
      viewerId: user.id,
      cursor: query.cursor,
      take: query.take,
    });
    if (!profile) return jsonError("User not found", 404);
    return jsonOk({ profile });
  } catch (error) {
    return handleRouteError(error);
  }
}
