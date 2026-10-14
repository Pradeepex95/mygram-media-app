import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { AuthError } from "@/lib/auth/session";
import { InvalidCursorError } from "@/lib/pagination";

export function jsonOk<T>(data: T, init?: ResponseInit) {
  return NextResponse.json(data, { status: 200, ...init });
}

export function jsonCreated<T>(data: T) {
  return NextResponse.json(data, { status: 201 });
}

export function jsonError(
  message: string,
  status = 400,
  extra?: Record<string, unknown>,
) {
  return NextResponse.json({ error: message, ...extra }, { status });
}

export function handleRouteError(error: unknown) {
  if (error instanceof AuthError) {
    const status =
      error.reason === "UNAUTHENTICATED"
        ? 401
        : error.reason === "SESSION_REPLACED"
          ? 401
          : error.reason === "SUBSCRIPTION_EXPIRED" || error.reason === "SUSPENDED"
            ? 403
            : 401;
    return jsonError(error.message, status, { reason: error.reason });
  }

  if (error instanceof ZodError) {
    return jsonError("Validation failed", 400, {
      issues: error.issues.map((i) => ({
        path: i.path.join("."),
        message: i.message,
      })),
    });
  }

  if (error instanceof InvalidCursorError) {
    return jsonError(error.message, 400);
  }

  console.error("Unhandled API error");
  return jsonError("Internal server error", 500);
}

export function clientIp(request: Request): string | null {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]?.trim() || null;
  return request.headers.get("x-real-ip");
}
