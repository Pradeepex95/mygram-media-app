import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { getEnv } from "@/lib/env";

export const SESSION_COOKIE = "mygram_session";

export type SessionTokenPayload = {
  sub: string;
  sid: string;
  role: "ADMIN" | "SUBSCRIBER";
  username: string;
  sv: number;
};

function secretKey() {
  return new TextEncoder().encode(getEnv().AUTH_SECRET);
}

export async function signSessionToken(
  payload: SessionTokenPayload,
  expiresAt: Date,
): Promise<string> {
  return new SignJWT({
    sid: payload.sid,
    role: payload.role,
    username: payload.username,
    sv: payload.sv,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(payload.sub)
    .setIssuedAt()
    .setExpirationTime(expiresAt)
    .sign(secretKey());
}

export async function verifySessionToken(
  token: string,
): Promise<SessionTokenPayload | null> {
  try {
    const { payload } = await jwtVerify(token, secretKey());
    if (
      typeof payload.sub !== "string" ||
      typeof payload.sid !== "string" ||
      typeof payload.role !== "string" ||
      typeof payload.username !== "string" ||
      typeof payload.sv !== "number"
    ) {
      return null;
    }
    if (payload.role !== "ADMIN" && payload.role !== "SUBSCRIBER") {
      return null;
    }
    return {
      sub: payload.sub,
      sid: payload.sid,
      role: payload.role,
      username: payload.username,
      sv: payload.sv,
    };
  } catch {
    return null;
  }
}

export async function setSessionCookie(token: string, expiresAt: Date) {
  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });
}

export async function clearSessionCookie() {
  const jar = await cookies();
  jar.set(SESSION_COOKIE, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
}

export async function readSessionCookie(): Promise<string | undefined> {
  const jar = await cookies();
  return jar.get(SESSION_COOKIE)?.value;
}
