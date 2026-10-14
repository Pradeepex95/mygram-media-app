import { Role } from "@prisma/client";
import { requireAuth } from "@/lib/auth/session";
import { assertSameOrigin } from "@/lib/csrf";
import { handleRouteError, jsonError, jsonOk } from "@/lib/api";
import { avatarSchema } from "@/lib/validations";
import { updateAdminAvatar } from "@/server/stories/service";

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const user = await requireAuth();
    if (user.role !== Role.ADMIN) {
      return jsonError("Only the admin can change this profile photo", 403);
    }
    const body = avatarSchema.parse(await request.json());
    const result = await updateAdminAvatar({
      user,
      storageKey: body.storageKey,
    });
    return jsonOk(result);
  } catch (error) {
    if (error instanceof Error && error.message === "Invalid storage key") {
      return jsonError(error.message, 400);
    }
    return handleRouteError(error);
  }
}
