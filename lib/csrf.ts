import { getEnv } from "@/lib/env";

export function assertSameOrigin(request: Request) {
  if (request.method === "GET" || request.method === "HEAD" || request.method === "OPTIONS") {
    return;
  }

  const origin = request.headers.get("origin");
  if (!origin) {
    // Non-browser clients (curl, cron) may omit Origin
    return;
  }

  const appOrigin = new URL(getEnv().NEXT_PUBLIC_APP_URL).origin;
  // Host is set by the browser. X-Forwarded-Host is client-settable and must not authorize a foreign Origin.
  const requestHost = (request.headers.get("host") ?? "").split(",")[0]?.trim();
  let originHost = "";
  try {
    originHost = new URL(origin).host;
  } catch {
    throw new Error("Invalid origin");
  }

  if (origin !== appOrigin && originHost !== requestHost) {
    throw new Error("Invalid origin");
  }
}
