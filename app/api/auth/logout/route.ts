import { clearSessionCookie } from "@/lib/auth/tokens";
import { requireAuth, revokeSession } from "@/lib/auth/session";
import { assertSameOrigin } from "@/lib/csrf";
import { handleRouteError, jsonOk } from "@/lib/api";

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const user = await requireAuth();
    await revokeSession(user.sessionId, user.id);
    await clearSessionCookie();
    return jsonOk({ ok: true });
  } catch (error) {
    await clearSessionCookie();
    return handleRouteError(error);
  }
}
