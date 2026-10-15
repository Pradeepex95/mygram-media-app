import { MediaType } from "@prisma/client";
import { requireAuth } from "@/lib/auth/session";
import { assertSameOrigin } from "@/lib/csrf";
import { handleRouteError, jsonCreated, jsonError } from "@/lib/api";
import { assertOwnedObjectKey, isImageMime, isVideoMime, validateUploadConstraints } from "@/lib/storage";
import { completeUploadSchema } from "@/lib/validations";
import { canUpload, createPost } from "@/server/posts/service";

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const user = await requireAuth();
    if (!(await canUpload(user))) {
      return jsonError("Uploads are disabled for subscribers", 403);
    }

    const body = completeUploadSchema.parse(await request.json());

    for (const item of body.media) {
      const check = validateUploadConstraints({
        mimeType: item.mimeType,
        sizeBytes: item.sizeBytes,
      });
      if (!check.ok) return jsonError(check.error, 400);
      try {
        assertOwnedObjectKey(item.storageKey, user.id, "media");
        if (item.thumbnailKey) assertOwnedObjectKey(item.thumbnailKey, user.id, "thumb");
      } catch (error) {
        return jsonError(error instanceof Error ? error.message : "Invalid storage key", 400);
      }
    }

    const post = await createPost({
      authorId: user.id,
      caption: body.caption,
      media: body.media.map((m) => ({
        type: isVideoMime(m.mimeType)
          ? MediaType.VIDEO
          : isImageMime(m.mimeType)
            ? MediaType.IMAGE
            : MediaType.IMAGE,
        storageKey: m.storageKey,
        thumbnailKey: m.thumbnailKey,
        mimeType: m.mimeType,
        sizeBytes: m.sizeBytes,
        width: m.width,
        height: m.height,
        durationSec: m.durationSec,
      })),
    });

    return jsonCreated({ post });
  } catch (error) {
    return handleRouteError(error);
  }
}
