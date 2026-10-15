import { createReadStream, existsSync, statSync } from "fs";
import { Readable } from "stream";
import { NextResponse } from "next/server";
import { getEnv } from "@/lib/env";
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

  const maxBytes = getEnv().MAX_VIDEO_BYTES;
  const declared = Number(request.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > maxBytes) {
    return jsonError("File exceeds max size", 413);
  }
  const buffer = Buffer.from(await request.arrayBuffer());
  if (buffer.byteLength > maxBytes) {
    return jsonError("File exceeds max size", 413);
  }
  if (Number.isFinite(declared) && declared > buffer.byteLength) {
    return jsonError("Upload was truncated before it finished", 400);
  }
  try {
    await writeLocalObject(verified.key, buffer);
  } catch (error) {
    if (error instanceof Error && error.message === "Invalid storage key") {
      return jsonError(error.message, 400);
    }
    throw error;
  }
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

  let full: string;
  try {
    full = localObjectPath(verified.key);
  } catch (error) {
    if (error instanceof Error && error.message === "Invalid storage key") {
      return jsonError(error.message, 400);
    }
    throw error;
  }
  if (!existsSync(full)) return jsonError("Not found", 404);
  const size = statSync(full).size;
  const type = contentTypeForKey(verified.key);
  const range = request.headers.get("range");
  const baseHeaders = {
    "Content-Type": type,
    "Accept-Ranges": "bytes",
    "Cache-Control": "private, max-age=60",
  };

  if (!range) {
    return new NextResponse(openFileStream(full), {
      headers: { ...baseHeaders, "Content-Length": String(size) },
    });
  }

  const parsed = parseByteRange(range, size);
  if (!parsed) {
    return new NextResponse(null, {
      status: 416,
      headers: { "Content-Range": `bytes */${size}` },
    });
  }

  return new NextResponse(openFileStream(full, { start: parsed.start, end: parsed.end }), {
    status: 206,
    headers: {
      ...baseHeaders,
      "Content-Range": `bytes ${parsed.start}-${parsed.end}/${size}`,
      "Content-Length": String(parsed.end - parsed.start + 1),
    },
  });
}

function openFileStream(full: string, options?: { start: number; end: number }) {
  const node = createReadStream(full, options);
  // A missing file emits 'error' with no listener and can crash the process.
  node.on("error", () => node.destroy());
  return Readable.toWeb(node) as ReadableStream;
}

function contentTypeForKey(key: string) {
  const ext = key.split(".").pop()?.toLowerCase();
  if (ext === "png") return "image/png";
  if (ext === "webp") return "image/webp";
  if (ext === "mp4") return "video/mp4";
  if (ext === "webm") return "video/webm";
  if (ext === "mov") return "video/quicktime";
  return "image/jpeg";
}

function parseByteRange(header: string, size: number): { start: number; end: number } | null {
  const first = header.trim().split(",")[0]?.trim() ?? "";
  const match = /^bytes=(\d*)-(\d*)$/i.exec(first);
  if (!match || size <= 0) return null;
  const [, startText, endText] = match;
  if (!startText && !endText) return null;

  let start: number;
  let end: number;
  if (!startText) {
    const suffix = Number(endText);
    if (!Number.isFinite(suffix) || suffix <= 0) return null;
    start = Math.max(0, size - suffix);
    end = size - 1;
  } else {
    start = Number(startText);
    end = endText ? Number(endText) : size - 1;
  }
  if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || start >= size || end < start) {
    return null;
  }
  return { start, end: Math.min(end, size - 1) };
}
