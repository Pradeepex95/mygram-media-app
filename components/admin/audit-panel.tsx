"use client";

import { useEffect, useRef, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { formatDistanceToNow } from "date-fns";
import { Button } from "@/components/ui/button";

type AuditItem = {
  id: string;
  action: string;
  createdAt: string;
  actor?: { username: string } | null;
  target?: { username: string } | null;
};

export function AuditPanel() {
  const [items, setItems] = useState<AuditItem[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const booted = useRef(false);

  async function load(nextCursor?: string | null) {
    const params = new URLSearchParams();
    if (nextCursor) params.set("cursor", nextCursor);
    const response = await fetch(`/api/admin/audit?${params}`);
    const data = await response.json();
    setItems((current) =>
      nextCursor ? [...current, ...(data.items || [])] : data.items || [],
    );
    setCursor(data.nextCursor ?? null);
  }

  useEffect(() => {
    if (booted.current) return;
    booted.current = true;
    queueMicrotask(() => {
      void load(null);
    });
  }, []);

  return (
    <div className="space-y-3">
      {items.map((item) => (
        <Card key={item.id}>
          <CardContent className="pt-4 text-sm">
            <p className="font-medium">
              {item.action} by @{item.actor?.username}
              {item.target ? ` → @${item.target.username}` : ""}
            </p>
            <p className="text-xs text-zinc-500">
              {formatDistanceToNow(new Date(item.createdAt), { addSuffix: true })}
            </p>
          </CardContent>
        </Card>
      ))}
      {!items.length && <p className="text-sm text-zinc-500">No admin actions yet.</p>}
      {cursor && (
        <Button
          type="button"
          variant="secondary"
          className="w-full"
          disabled={loading}
          onClick={async () => {
            setLoading(true);
            try {
              await load(cursor);
            } finally {
              setLoading(false);
            }
          }}
        >
          {loading ? "Loading..." : "Load more audit entries"}
        </Button>
      )}
    </div>
  );
}
