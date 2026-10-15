import { requireAuth } from "@/lib/auth/session";
import { assertSameOrigin } from "@/lib/csrf";
import { handleRouteError, jsonError, jsonOk } from "@/lib/api";
import { getEnv } from "@/lib/env";
import { updateProfileSchema } from "@/lib/validations";
import { updateOwnBio } from "@/server/posts/service";

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

export async function PATCH(request: Request) {
  try {
    assertSameOrigin(request);
    const user = await requireAuth();
    const body = updateProfileSchema.parse(await request.json());
    const updated = await updateOwnBio({ userId: user.id, bio: body.bio });
    return jsonOk({ bio: updated.bio });
  } catch (error) {
    if (error instanceof Error && error.message === "Invalid origin") {
      return jsonError("Invalid origin", 403);
    }
    return handleRouteError(error);
  }
}
