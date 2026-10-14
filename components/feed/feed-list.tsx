"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { PostCard, type FeedPost } from "@/components/feed/post-card";
import { Skeleton } from "@/components/ui/skeleton";

export function FeedList({ currentUserId }: { currentUserId: string }) {
  const router = useRouter();
  const [posts, setPosts] = useState<FeedPost[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const booted = useRef(false);

  const load = useCallback(
    async (next?: string | null) => {
      const params = new URLSearchParams();
      if (next) params.set("cursor", next);
      const res = await fetch(`/api/posts?${params.toString()}`);
      if (res.status === 401) {
        const data = await res.json().catch(() => ({}));
        const reason = data.reason || "UNAUTHENTICATED";
        router.replace(`/login?reason=${reason}`);
        return;
      }
      if (!res.ok) {
        toast.error("Failed to load feed");
        return;
      }
      const data = await res.json();
      setPosts((prev) => (next ? [...prev, ...data.items] : data.items));
      setCursor(data.nextCursor);
    },
    [router],
  );

  useEffect(() => {
    if (booted.current) return;
    booted.current = true;
    queueMicrotask(() => {
      void load(null).finally(() => setLoading(false));
    });
  }, [load]);

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(async ([entry]) => {
      if (entry.isIntersecting && cursor && !loadingMore) {
        setLoadingMore(true);
        await load(cursor);
        setLoadingMore(false);
      }
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [cursor, load, loadingMore]);

  if (loading) {
    return (
      <div className="space-y-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="space-y-3 rounded-xl border p-4 dark:border-zinc-800">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="aspect-square w-full" />
            <Skeleton className="h-4 w-24" />
          </div>
        ))}
      </div>
    );
  }

  if (!posts.length) {
    return (
      <div className="rounded-xl border border-dashed p-10 text-center text-zinc-500 dark:border-zinc-800">
        No posts yet. Be the first to share something.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {posts.map((post) => (
        <PostCard
          key={post.id}
          post={post}
          currentUserId={currentUserId}
          onDeleted={(id) => setPosts((prev) => prev.filter((p) => p.id !== id))}
        />
      ))}
      <div ref={sentinelRef} className="h-8" />
      {loadingMore && <Skeleton className="h-24 w-full" />}
    </div>
  );
}
