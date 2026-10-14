import { z } from "zod";

export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 20;

const cursorPayloadSchema = z.object({
  createdAt: z.string().datetime(),
  id: z.string().min(1).max(128),
});

export type TimeCursor = {
  createdAt: Date;
  id: string;
};

export class InvalidCursorError extends Error {
  constructor() {
    super("Invalid pagination cursor");
  }
}

export function encodeTimeCursor(value: TimeCursor): string {
  return Buffer.from(
    JSON.stringify({
      createdAt: value.createdAt.toISOString(),
      id: value.id,
    }),
  ).toString("base64url");
}

export function decodeTimeCursor(value?: string | null): TimeCursor | null {
  if (!value) return null;
  try {
    const payload = cursorPayloadSchema.parse(
      JSON.parse(Buffer.from(value, "base64url").toString("utf8")),
    );
    return {
      createdAt: new Date(payload.createdAt),
      id: payload.id,
    };
  } catch {
    throw new InvalidCursorError();
  }
}

export function clampPageSize(value?: number, fallback = DEFAULT_PAGE_SIZE): number {
  if (!value || !Number.isFinite(value)) return fallback;
  return Math.min(MAX_PAGE_SIZE, Math.max(1, Math.floor(value)));
}
