"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

type Stats = {
  totalUsers: number;
  activeSubscriptions: number;
  expiredSubscriptions: number;
  suspendedUsers: number;
  totalPosts: number;
};

export function AdminDashboard() {
  const [stats, setStats] = useState<Stats | null>(null);
  const booted = useRef(false);

  useEffect(() => {
    if (booted.current) return;
    booted.current = true;
    queueMicrotask(() => {
      void fetch("/api/admin/stats")
        .then((r) => r.json())
        .then(setStats)
        .catch(() => undefined);
    });
  }, []);

  const cards = [
    { label: "Subscribers", value: stats?.totalUsers },
    { label: "Active", value: stats?.activeSubscriptions },
    { label: "Expired", value: stats?.expiredSubscriptions },
    { label: "Suspended", value: stats?.suspendedUsers },
    { label: "Posts", value: stats?.totalPosts },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Admin dashboard</h1>
          <p className="text-sm text-zinc-500">Manage subscribers and content</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="secondary">
            <Link href="/admin/subscribers">Subscribers</Link>
          </Button>
          <Button asChild variant="secondary">
            <Link href="/admin/content">Content</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/admin/audit">Audit log</Link>
          </Button>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {cards.map((card) => (
          <Card key={card.label}>
            <CardHeader>
              <CardTitle className="text-sm font-medium text-zinc-500">
                {card.label}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {stats ? (
                <p className="text-3xl font-bold">{card.value}</p>
              ) : (
                <Skeleton className="h-9 w-16" />
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
