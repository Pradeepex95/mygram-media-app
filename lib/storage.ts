import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { createHmac, randomUUID, timingSafeEqual } from "crypto";
import { mkdir, unlink, writeFile } from "fs/promises";
import path from "path";
import { getEnv } from "@/lib/env";

let client: S3Client | null = null;

function getS3(): S3Client {
  if (client) return client;
  const env = getEnv();
  client = new S3Client({
    region: env.S3_REGION,
    endpoint: env.S3_ENDPOINT || undefined,
    forcePathStyle: env.S3_FORCE_PATH_STYLE,
    credentials: {
      accessKeyId: env.S3_ACCESS_KEY_ID,
      secretAccessKey: env.S3_SECRET_ACCESS_KEY,
    },
  });
  return client;
}

function storageDriver(): "s3" | "local" {
  return process.env.STORAGE_DRIVER === "local" ? "local" : "s3";
}

function localRoot() {
  return path.join(process.cwd(), ".storage");
}

export const ALLOWED_IMAGE_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
] as const;

export const ALLOWED_VIDEO_TYPES = [
  "video/mp4",
  "video/quicktime",
  "video/webm",
] as const;

export function isImageMime(mime: string): mime is (typeof ALLOWED_IMAGE_TYPES)[number] {
  return (ALLOWED_IMAGE_TYPES as readonly string[]).includes(mime);
}

export function isVideoMime(mime: string): mime is (typeof ALLOWED_VIDEO_TYPES)[number] {
  return (ALLOWED_VIDEO_TYPES as readonly string[]).includes(mime);
}

export function validateUploadConstraints(params: {
  mimeType: string;
  sizeBytes: number;
}): { ok: true; kind: "IMAGE" | "VIDEO" } | { ok: false; error: string } {
  const env = getEnv();
  if (isImageMime(params.mimeType)) {
    if (params.sizeBytes > env.MAX_IMAGE_BYTES) {
      return {
        ok: false,
        error: `Image exceeds max size of ${Math.floor(env.MAX_IMAGE_BYTES / (1024 * 1024))} MB`,
      };
    }
    return { ok: true, kind: "IMAGE" };
  }
  if (isVideoMime(params.mimeType)) {
    if (params.sizeBytes > env.MAX_VIDEO_BYTES) {
      return {
        ok: false,
        error: `Video exceeds max size of ${Math.floor(env.MAX_VIDEO_BYTES / (1024 * 1024))} MB`,
      };
    }
    return { ok: true, kind: "VIDEO" };
  }
  return { ok: false, error: "Unsupported file type" };
}

function extensionForMime(mime: string): string {
  switch (mime) {
    case "image/jpeg":
      return "jpg";
    case "image/png":
      return "png";
    case "image/webp":
      return "webp";
    case "video/mp4":
      return "mp4";
    case "video/quicktime":
      return "mov";
    case "video/webm":
      return "webm";
    default:
      return "bin";
  }
}

export function buildObjectKey(params: {
  userId: string;
  mimeType: string;
  kind: "media" | "thumb" | "avatar";
}): string {
  const ext = extensionForMime(params.mimeType);
  const id = randomUUID();
  return `${params.kind}/${params.userId}/${id}.${ext}`;
}

export function signLocalTokenWithSecret(
  payload: string,
  expiresAt: number,
  secret: string,
): string {
  const body = `${payload}.${expiresAt}`;
  const sig = createHmac("sha256", secret).update(body).digest("base64url");
  return `${Buffer.from(body).toString("base64url")}.${sig}`;
}

function signLocalToken(payload: string, expiresAt: number): string {
  return signLocalTokenWithSecret(payload, expiresAt, getEnv().AUTH_SECRET);
}

export function verifyLocalTokenWithSecret(
  token: string,
  secret: string,
  now = Date.now(),
): { key: string; expiresAt: number } | null {
  try {
    const separator = token.indexOf(".");
    if (separator <= 0) return null;
    const bodyB64 = token.slice(0, separator);
    const sig = token.slice(separator + 1);
    if (!bodyB64 || !sig) return null;
    const body = Buffer.from(bodyB64, "base64url").toString("utf8");
    const expected = createHmac("sha256", secret).update(body).digest("base64url");
    const a = Buffer.from(sig);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
    const dot = body.lastIndexOf(".");
    if (dot <= 0) return null;
    const key = body.slice(0, dot);
    const expiresAt = Number(body.slice(dot + 1));
    if (!key || !Number.isFinite(expiresAt) || expiresAt < now) return null;
    return { key, expiresAt };
  } catch {
    return null;
  }
}

export function verifyLocalToken(token: string): { key: string; expiresAt: number } | null {
  return verifyLocalTokenWithSecret(token, getEnv().AUTH_SECRET);
}

export async function createPresignedUploadUrl(params: {
  key: string;
  mimeType: string;
  sizeBytes: number;
}): Promise<{ uploadUrl: string; key: string; expiresIn: number }> {
  const env = getEnv();
  const expiresIn = Math.min(env.SIGNED_URL_TTL_SECONDS * 4, 3600);

  if (storageDriver() === "local") {
    const token = signLocalToken(params.key, Date.now() + expiresIn * 1000);
    return {
      uploadUrl: `/api/storage/local?token=${encodeURIComponent(token)}&mode=put`,
      key: params.key,
      expiresIn,
    };
  }

  const command = new PutObjectCommand({
    Bucket: env.S3_BUCKET,
    Key: params.key,
    ContentType: params.mimeType,
    ContentLength: params.sizeBytes,
  });
  const uploadUrl = await getSignedUrl(getS3(), command, { expiresIn });
  return { uploadUrl, key: params.key, expiresIn };
}

export async function createPresignedViewUrl(key: string): Promise<string> {
  const env = getEnv();

  if (storageDriver() === "local") {
    const expiresIn = env.SIGNED_URL_TTL_SECONDS;
    const token = signLocalToken(key, Date.now() + expiresIn * 1000);
    return `/api/storage/local?token=${encodeURIComponent(token)}&mode=get`;
  }

  const command = new GetObjectCommand({
    Bucket: env.S3_BUCKET,
    Key: key,
  });
  return getSignedUrl(getS3(), command, {
    expiresIn: env.SIGNED_URL_TTL_SECONDS,
  });
}

export async function deleteObject(key: string): Promise<void> {
  if (storageDriver() === "local") {
    const full = path.join(localRoot(), key);
    await unlink(full).catch(() => undefined);
    return;
  }
  const env = getEnv();
  await getS3().send(
    new DeleteObjectCommand({
      Bucket: env.S3_BUCKET,
      Key: key,
    }),
  );
}

export async function writeLocalObject(key: string, data: Buffer) {
  const full = path.join(localRoot(), key);
  await mkdir(path.dirname(full), { recursive: true });
  await writeFile(full, data);
}

export function localObjectPath(key: string) {
  return path.join(localRoot(), key);
}
