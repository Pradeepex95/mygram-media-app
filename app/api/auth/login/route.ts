import { loginWithCredentials } from "@/server/auth/login";
import { setSessionCookie } from "@/lib/auth/tokens";
import { clientIp, handleRouteError, jsonError, jsonOk } from "@/lib/api";
import { assertSameOrigin } from "@/lib/csrf";
import { AuthError } from "@/lib/auth/session";
import { loginSchema } from "@/lib/validations";

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const body = loginSchema.parse(await request.json());
    const result = await loginWithCredentials({
      username: body.username,
      password: body.password,
      userAgent: request.headers.get("user-agent"),
      ipAddress: clientIp(request),
    });

    await setSessionCookie(result.token, result.expiresAt);

    return jsonOk({
      user: {
        id: result.user.id,
        username: result.user.username,
        role: result.user.role,
        status: result.user.status,
        subscriptionEnd: result.user.subscriptionEnd,
      },
    });
  } catch (error) {
    if (error instanceof AuthError) {
      const status =
        error.reason === "SUBSCRIPTION_EXPIRED" || error.reason === "SUSPENDED"
          ? 403
          : 401;
      return jsonError(error.message, status, { reason: error.reason });
    }
    if (error instanceof Error && error.message === "Invalid origin") {
      return jsonError("Invalid origin", 403);
    }
    return handleRouteError(error);
  }
}
