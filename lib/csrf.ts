import { getEnv } from "@/lib/env";

export function assertSameOrigin(request: Request) {
  if (request.method === "GET" || request.method === "HEAD" || request.method === "OPTIONS") {
    return;
  }

  const origin = request.headers.get("origin");
  const appUrl = getEnv().NEXT_PUBLIC_APP_URL;
  if (!origin) {
    // Non-browser clients (curl, cron) may omit Origin
    return;
  }

  const allowed = new URL(appUrl).origin;
  if (origin !== allowed) {
    throw new Error("Invalid origin");
  }
}
