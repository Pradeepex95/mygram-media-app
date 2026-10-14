"use client";

import { useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Clapperboard } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

const REASON_MESSAGES: Record<string, string> = {
  SESSION_REPLACED:
    "You were logged out because your account was used on another device.",
  SUBSCRIPTION_EXPIRED: "Your subscription has expired. Contact admin.",
  SUSPENDED: "Your account has been suspended. Contact admin.",
  SESSION_EXPIRED: "Your session has expired. Please log in again.",
  UNAUTHENTICATED: "Please log in to continue.",
};

export function LoginForm({ appName }: { appName: string }) {
  const router = useRouter();
  const search = useSearchParams();
  const reason = search.get("reason");
  const banner = useMemo(
    () => (reason ? REASON_MESSAGES[reason] || null : null),
    [reason],
  );

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(banner);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || "Login failed");
        return;
      }
      toast.success("Welcome back");
      router.replace(data.user.role === "ADMIN" ? "/admin" : "/feed");
      router.refresh();
    } catch {
      setError("Network error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-50 px-4 dark:bg-black">
      <Card className="w-full max-w-md">
        <CardHeader className="items-center text-center">
          <Clapperboard className="mb-2 h-10 w-10 text-pink-500" />
          <CardTitle className="bg-gradient-to-r from-pink-500 to-orange-400 bg-clip-text text-2xl text-transparent">
            {appName}
          </CardTitle>
          <p className="text-sm text-zinc-500">Private media sharing for subscribers</p>
        </CardHeader>
        <CardContent>
          {error && (
            <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">
              {error}
            </div>
          )}
          <form className="space-y-3" onSubmit={onSubmit}>
            <Input
              placeholder="Username"
              autoComplete="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
            />
            <Input
              type="password"
              placeholder="Password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "Signing in..." : "Log in"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
