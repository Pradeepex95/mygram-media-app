"use client";

import { useEffect, useRef, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { formatDistanceToNow } from "date-fns";

type AuditItem = {
  id: string;
  action: string;
  createdAt: string;
  actor?: { username: string } | null;
  target?: { username: string } | null;
};

export function AuditPanel() {
  const [items, setItems] = useState<AuditItem[]>([]);
  const booted = useRef(false);

  useEffect(() => {
    if (booted.current) return;
    booted.current = true;
    queueMicrotask(() => {
      void fetch("/api/admin/audit")
        .then((r) => r.json())
        .then((d) => setItems(d.items || []));
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
      {!items.length && (
        <p className="text-sm text-zinc-500">No admin actions yet.</p>
      )}
    </div>
  );
}
