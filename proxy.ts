import { NextResponse, type NextRequest } from "next/server";
import { jwtVerify } from "jose";
import { Role, SubscriptionStatus } from "@prisma/client";
import { prisma } from "@/lib/db";

const SESSION_COOKIE = "mygram_session";

function isStaticAsset(pathname: string) {
  return (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon") ||
    /\.(?:svg|png|jpg|jpeg|gif|webp|ico)$/.test(pathname)
  );
}

function externalUrl(request: NextRequest, pathname: string) {
  const host = (
    request.headers.get("x-forwarded-host") ??
    request.headers.get("host") ??
    request.nextUrl.host
  )
    .split(",")[0]
    .trim();
  const proto =
    request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim() ||
    request.nextUrl.protocol.replace(":", "");
  return new URL(pathname, `${proto}://${host}`);
}

function redirectToLogin(request: NextRequest, reason: string) {
  const url = externalUrl(request, "/login");
  url.searchParams.set("reason", reason);
  const res = NextResponse.redirect(url);
  res.cookies.set(SESSION_COOKIE, "", {
    httpOnly: true,
    secure:
      request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim() === "https" ||
      process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
  return res;
}

async function resolveAuth(token: string) {
  const secret = process.env.AUTH_SECRET;
  if (!secret || secret.length < 32) {
    return { error: "CONFIG" as const };
  }

  let payload: { sub: string; sid: string; role: string; sv: number };
  try {
    const verified = await jwtVerify(token, new TextEncoder().encode(secret));
    const p = verified.payload;
    if (
      typeof p.sub !== "string" ||
      typeof p.sid !== "string" ||
      typeof p.role !== "string" ||
      typeof p.sv !== "number"
    ) {
      return { error: "UNAUTHENTICATED" as const };
    }
    payload = { sub: p.sub, sid: p.sid, role: p.role, sv: p.sv };
  } catch {
    return { error: "UNAUTHENTICATED" as const };
  }

  const user = await prisma.user.findUnique({ where: { id: payload.sub } });
  if (!user) return { error: "UNAUTHENTICATED" as const };

  if (
    !user.activeSessionId ||
    user.activeSessionId !== payload.sid ||
    user.sessionVersion !== payload.sv
  ) {
    return { error: "SESSION_REPLACED" as const };
  }

  const session = await prisma.session.findUnique({
    where: { id: payload.sid },
  });
  if (!session || session.revokedAt || session.expiresAt.getTime() < Date.now()) {
    return { error: "SESSION_EXPIRED" as const };
  }

  if (user.role !== Role.ADMIN) {
    if (user.status === SubscriptionStatus.SUSPENDED) {
      return { error: "SUSPENDED" as const };
    }
    if (
      user.status === SubscriptionStatus.EXPIRED ||
      (user.subscriptionEnd && user.subscriptionEnd.getTime() < Date.now())
    ) {
      return { error: "SUBSCRIPTION_EXPIRED" as const };
    }
  }

  return { user, session };
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (isStaticAsset(pathname)) {
    return NextResponse.next();
  }

  if (
    pathname === "/api/auth/login" ||
    pathname === "/api/cron/expire-subscriptions" ||
    pathname === "/api/storage/local"
  ) {
    // Local storage GET/PUT uses short-lived HMAC tokens (still gated by token).
    return NextResponse.next();
  }

  const token = request.cookies.get(SESSION_COOKIE)?.value;

  if (pathname === "/login") {
    if (!token) return NextResponse.next();
    const auth = await resolveAuth(token);
    if ("user" in auth) {
      return NextResponse.redirect(externalUrl(request, "/feed"));
    }
    return NextResponse.next();
  }

  if (!token) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json(
        { error: "Please log in.", reason: "UNAUTHENTICATED" },
        { status: 401 },
      );
    }
    return redirectToLogin(request, "UNAUTHENTICATED");
  }

  const auth = await resolveAuth(token);
  if ("error" in auth) {
    if (auth.error === "CONFIG") {
      return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });
    }
    if (pathname.startsWith("/api/")) {
      return NextResponse.json(
        {
          error:
            auth.error === "SESSION_REPLACED"
              ? "You were logged out because your account was used on another device."
              : auth.error === "SUBSCRIPTION_EXPIRED"
                ? "Your subscription has expired. Contact admin."
                : auth.error === "SUSPENDED"
                  ? "Your account has been suspended. Contact admin."
                  : "Please log in.",
          reason: auth.error,
        },
        {
          status:
            auth.error === "SUBSCRIPTION_EXPIRED" || auth.error === "SUSPENDED"
              ? 403
              : 401,
        },
      );
    }
    return redirectToLogin(request, auth.error ?? "UNAUTHENTICATED");
  }

  if (pathname.startsWith("/admin") || pathname.startsWith("/api/admin")) {
    if (auth.user.role !== Role.ADMIN) {
      if (pathname.startsWith("/api/")) {
        return NextResponse.json({ error: "Admin access required" }, { status: 403 });
      }
      return NextResponse.redirect(externalUrl(request, "/feed"));
    }
  }

  if (pathname === "/") {
    return NextResponse.redirect(externalUrl(request, "/feed"));
  }

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-user-id", auth.user.id);
  requestHeaders.set("x-user-role", auth.user.role);
  requestHeaders.set("x-session-id", auth.session.id);

  return NextResponse.next({
    request: { headers: requestHeaders },
  });
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
