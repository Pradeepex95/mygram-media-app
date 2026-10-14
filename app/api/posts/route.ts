import { requireAuth } from "@/lib/auth/session";
import { handleRouteError, jsonOk } from "@/lib/api";
import { feedQuerySchema } from "@/lib/validations";
import { listFeed } from "@/server/posts/service";

export async function GET(request: Request) {
  try {
    const user = await requireAuth();
    const { searchParams } = new URL(request.url);
    const query = feedQuerySchema.parse({
      cursor: searchParams.get("cursor") ?? undefined,
      take: searchParams.get("take") ?? undefined,
    });
    const feed = await listFeed({
      viewerId: user.id,
      cursor: query.cursor,
      take: query.take,
    });
    return jsonOk(feed);
  } catch (error) {
    return handleRouteError(error);
  }
}
