import { requireAuth } from "@/lib/auth/session";
import { assertSameOrigin } from "@/lib/csrf";
import { handleRouteError, jsonError, jsonOk } from "@/lib/api";
import { rateLimit } from "@/lib/rate-limit";
import {
  buildObjectKey,
  createPresignedUploadUrl,
  validateUploadConstraints,
} from "@/lib/storage";
import { presignSchema } from "@/lib/validations";
import { canUpload } from "@/server/posts/service";

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const user = await requireAuth();
    if (!(await canUpload(user))) {
      return jsonError("Uploads are disabled for subscribers", 403);
    }

    const limit = await rateLimit({
      key: `upload:${user.id}`,
      limit: 60,
      windowMs: 60 * 60 * 1000,
    });
    if (!limit.success) {
      return jsonError("Upload rate limit exceeded", 429);
    }

    const body = presignSchema.parse(await request.json());
    if (body.kind === "avatar" && user.role !== "ADMIN") {
      return jsonError("Only the admin can change this profile photo", 403);
    }
    const check = validateUploadConstraints({
      mimeType: body.mimeType,
      sizeBytes: body.sizeBytes,
    });
    if (!check.ok || (body.kind === "avatar" && check.kind !== "IMAGE")) {
      return jsonError(
        check.ok ? "Profile photos must be images" : check.error,
        400,
      );
    }

    const key = buildObjectKey({
      userId: user.id,
      mimeType: body.mimeType,
      kind: body.kind === "thumb" ? "thumb" : body.kind === "avatar" ? "avatar" : "media",
    });

    const signed = await createPresignedUploadUrl({
      key,
      mimeType: body.mimeType,
      sizeBytes: body.sizeBytes,
    });

    return jsonOk({
      ...signed,
      mediaType: check.kind,
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
