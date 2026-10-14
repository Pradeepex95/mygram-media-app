import { requireAuth } from "@/lib/auth/session";
import { handleRouteError, jsonError, jsonOk } from "@/lib/api";
import { getProfile } from "@/server/posts/service";

type Params = { params: Promise<{ username: string }> };

export async function GET(_request: Request, { params }: Params) {
  try {
    const user = await requireAuth();
    const { username } = await params;
    const profile = await getProfile({
      username: username.toLowerCase(),
      viewerId: user.id,
    });
    if (!profile) return jsonError("User not found", 404);
    return jsonOk({ profile });
  } catch (error) {
    return handleRouteError(error);
  }
}
