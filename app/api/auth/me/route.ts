import { requireAuth } from "@/lib/auth/session";
import { handleRouteError, jsonOk } from "@/lib/api";
import { getEnv } from "@/lib/env";

export async function GET() {
  try {
    const user = await requireAuth();
    return jsonOk({
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        role: user.role,
        status: user.status,
        bio: user.bio,
        subscriptionEnd: user.subscriptionEnd,
      },
      flags: {
        allowSubscriberUploads: getEnv().ALLOW_SUBSCRIBER_UPLOADS,
        appName: getEnv().NEXT_PUBLIC_APP_NAME,
      },
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
