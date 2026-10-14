import { existsSync } from "fs";
import { readFile } from "fs/promises";
import { NextResponse } from "next/server";
import {
  localObjectPath,
  verifyLocalToken,
  writeLocalObject,
} from "@/lib/storage";
import { jsonError } from "@/lib/api";

/**
 * Local-dev object storage endpoint.
 * Production should use STORAGE_DRIVER=s3 (R2/S3) so media never touches the app filesystem.
 */
export async function PUT(request: Request) {
  if (process.env.STORAGE_DRIVER !== "local") {
    return jsonError("Local storage disabled", 404);
  }
  const { searchParams } = new URL(request.url);
  const token = searchParams.get("token");
  if (!token) return jsonError("Missing token", 400);
  const verified = verifyLocalToken(token);
  if (!verified) return jsonError("Invalid or expired token", 403);

  const buffer = Buffer.from(await request.arrayBuffer());
  await writeLocalObject(verified.key, buffer);
  return NextResponse.json({ ok: true });
}

export async function GET(request: Request) {
  if (process.env.STORAGE_DRIVER !== "local") {
    return jsonError("Local storage disabled", 404);
  }
  const { searchParams } = new URL(request.url);
  const token = searchParams.get("token");
  if (!token) return jsonError("Missing token", 400);
  const verified = verifyLocalToken(token);
  if (!verified) return jsonError("Invalid or expired token", 403);

  const full = localObjectPath(verified.key);
  if (!existsSync(full)) return jsonError("Not found", 404);
  const data = await readFile(full);
  const ext = verified.key.split(".").pop()?.toLowerCase();
  const type =
    ext === "png"
      ? "image/png"
      : ext === "webp"
        ? "image/webp"
        : ext === "mp4"
          ? "video/mp4"
          : ext === "webm"
            ? "video/webm"
            : ext === "mov"
              ? "video/quicktime"
              : "image/jpeg";

  return new NextResponse(data, {
    headers: {
      "Content-Type": type,
      "Content-Length": String(data.byteLength),
      "Cache-Control": "private, max-age=60",
    },
  });
}
