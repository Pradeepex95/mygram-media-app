import { requireAuth } from "@/lib/auth/session";
import { assertSameOrigin } from "@/lib/csrf";
import { handleRouteError, jsonCreated, jsonError, jsonOk } from "@/lib/api";
import { createStorySchema } from "@/lib/validations";
import { canUpload } from "@/server/posts/service";
import { createStory, listActiveStories } from "@/server/stories/service";
import { validateUploadConstraints } from "@/lib/storage";

export async function GET() {
  try {
    const user = await requireAuth();
    const stories = await listActiveStories(user.id);
    return jsonOk(stories);
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const user = await requireAuth();
    if (!(await canUpload(user))) {
      return jsonError("Uploads are disabled for subscribers", 403);
    }
    const body = createStorySchema.parse(await request.json());
    const check = validateUploadConstraints({
      mimeType: body.mimeType,
      sizeBytes: body.sizeBytes,
    });
    if (!check.ok) return jsonError(check.error, 400);
    const story = await createStory({
      user,
      storageKey: body.storageKey,
      mimeType: body.mimeType,
    });
    return jsonCreated({ story });
  } catch (error) {
    if (error instanceof Error && error.message === "Invalid storage key") {
      return jsonError(error.message, 400);
    }
    return handleRouteError(error);
  }
}
