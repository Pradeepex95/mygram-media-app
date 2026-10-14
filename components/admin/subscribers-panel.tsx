"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";

type UserRow = {
  id: string;
  username: string;
  status: "ACTIVE" | "EXPIRED" | "SUSPENDED";
  subscriptionEnd: string | null;
  createdAt: string;
  _count: { posts: number };
};

export function SubscribersPanel() {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [months, setMonths] = useState<1 | 3 | 6 | 12>(1);
  const [customEndDate, setCustomEndDate] = useState("");
  const [createdCreds, setCreatedCreds] = useState<{
    username: string;
    password: string;
  } | null>(null);
  const booted = useRef(false);

  const load = useCallback(
    async (nextCursor?: string | null) => {
      const params = new URLSearchParams();
      if (q) params.set("q", q);
      if (status) params.set("status", status);
      if (nextCursor) params.set("cursor", nextCursor);
      const res = await fetch(`/api/admin/subscribers?${params}`);
      if (!res.ok) return toast.error("Failed to load subscribers");
      const data = await res.json();
      setUsers((current) => (nextCursor ? [...current, ...data.users] : data.users));
      setCursor(data.nextCursor);
    },
    [q, status],
  );

  useEffect(() => {
    if (booted.current && !q && !status) return;
    booted.current = true;
    queueMicrotask(() => {
      void load(null);
    });
  }, [load, q, status]);

  async function generate() {
    const res = await fetch("/api/admin/generate-credentials");
    if (!res.ok) return toast.error("Generate failed");
    const data = await res.json();
    setUsername(data.username);
    setPassword(data.password);
  }

  async function createSubscriber(e: React.FormEvent) {
    e.preventDefault();
    const res = await fetch("/api/admin/subscribers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username: username || undefined,
        password: password || undefined,
        months: customEndDate ? undefined : months,
        customEndDate: customEndDate ? new Date(customEndDate).toISOString() : undefined,
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return toast.error(data.error || "Create failed");
    setCreatedCreds(data.credentials);
    setUsername("");
    setPassword("");
    toast.success("Subscriber created — copy credentials now");
    await load(null);
  }

  async function act(path: string, init?: RequestInit, success = "Done") {
    const res = await fetch(path, init);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      toast.error(data.error || "Action failed");
      return null;
    }
    toast.success(success);
    await load(null);
    return data;
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Create subscriber</CardTitle>
        </CardHeader>
        <CardContent>
          <form className="grid gap-3 md:grid-cols-2" onSubmit={createSubscriber}>
            <Input
              placeholder="Username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
            />
            <Input
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <select
              className="h-10 rounded-lg border border-zinc-200 bg-white px-3 text-sm dark:border-zinc-700 dark:bg-zinc-950"
              value={months}
              onChange={(e) => setMonths(Number(e.target.value) as 1 | 3 | 6 | 12)}
              disabled={!!customEndDate}
            >
              <option value={1}>1 month</option>
              <option value={3}>3 months</option>
              <option value={6}>6 months</option>
              <option value={12}>12 months</option>
            </select>
            <Input
              type="date"
              value={customEndDate}
              onChange={(e) => setCustomEndDate(e.target.value)}
            />
            <Button type="button" variant="secondary" onClick={generate}>
              Generate
            </Button>
            <Button type="submit">Create subscriber</Button>
          </form>

          {createdCreds && (
            <div className="mt-4 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm dark:border-amber-800 dark:bg-amber-950/30">
              <p className="font-semibold">Show once — copy now</p>
              <p className="mt-1 font-mono">
                {createdCreds.username} / {createdCreds.password}
              </p>
              <Button
                className="mt-2"
                size="sm"
                variant="outline"
                onClick={async () => {
                  await navigator.clipboard.writeText(
                    `${createdCreds.username}\n${createdCreds.password}`,
                  );
                  toast.success("Credentials copied");
                }}
              >
                Copy credentials
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Subscribers</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-col gap-2 md:flex-row">
            <Input
              placeholder="Search username"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
            <select
              className="h-10 rounded-lg border border-zinc-200 bg-white px-3 text-sm dark:border-zinc-700 dark:bg-zinc-950"
              value={status}
              onChange={(e) => setStatus(e.target.value)}
            >
              <option value="">All statuses</option>
              <option value="ACTIVE">Active</option>
              <option value="EXPIRED">Expired</option>
              <option value="SUSPENDED">Suspended</option>
            </select>
            <Button type="button" variant="secondary" onClick={() => void load(null)}>
              Refresh
            </Button>
          </div>

          <div className="space-y-3">
            {users.map((user) => (
              <div key={user.id} className="rounded-lg border p-3 dark:border-zinc-800">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="font-semibold">{user.username}</p>
                    <p className="text-xs text-zinc-500">
                      Ends{" "}
                      {user.subscriptionEnd
                        ? new Date(user.subscriptionEnd).toLocaleDateString()
                        : "—"}{" "}
                      · {user._count.posts} posts
                    </p>
                  </div>
                  <Badge
                    className={
                      user.status === "ACTIVE"
                        ? "bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300"
                        : user.status === "EXPIRED"
                          ? "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300"
                          : "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300"
                    }
                  >
                    {user.status}
                  </Badge>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() =>
                      void act(
                        `/api/admin/subscribers/${user.id}/extend`,
                        {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ months: 1 }),
                        },
                        "Extended +1 month",
                      )
                    }
                  >
                    Extend +1m
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      void act(
                        `/api/admin/subscribers/${user.id}`,
                        {
                          method: "PATCH",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({
                            status: user.status === "SUSPENDED" ? "ACTIVE" : "SUSPENDED",
                          }),
                        },
                        user.status === "SUSPENDED" ? "Reactivated" : "Suspended",
                      )
                    }
                  >
                    {user.status === "SUSPENDED" ? "Reactivate" : "Suspend"}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={async () => {
                      const data = await act(
                        `/api/admin/subscribers/${user.id}/reset-password`,
                        { method: "POST" },
                        "Password reset",
                      );
                      if (data?.credentials) {
                        setCreatedCreds(data.credentials);
                      }
                    }}
                  >
                    Reset password
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      void act(
                        `/api/admin/subscribers/${user.id}/force-logout`,
                        { method: "POST" },
                        "Session killed",
                      )
                    }
                  >
                    Force logout
                  </Button>
                  <Button
                    size="sm"
                    variant="destructive"
                    onClick={() => {
                      if (!confirm(`Delete ${user.username}?`)) return;
                      void act(
                        `/api/admin/subscribers/${user.id}`,
                        { method: "DELETE" },
                        "Deleted",
                      );
                    }}
                  >
                    Delete
                  </Button>
                </div>
              </div>
            ))}
          </div>
          {cursor && (
            <Button
              type="button"
              variant="secondary"
              className="w-full"
              disabled={loadingMore}
              onClick={async () => {
                setLoadingMore(true);
                try {
                  await load(cursor);
                } finally {
                  setLoadingMore(false);
                }
              }}
            >
              {loadingMore ? "Loading..." : "Load more subscribers"}
            </Button>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
