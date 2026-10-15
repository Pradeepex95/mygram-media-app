"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { PostCard, type FeedPost } from "@/components/feed/post-card";
import { StoryBar } from "@/components/feed/story-bar";
import { Skeleton } from "@/components/ui/skeleton";

export function FeedList({
  currentUserId,
  username,
  canUpload,
  appName,
}: {
  currentUserId: string;
  username: string;
  canUpload: boolean;
  appName: string;
}) {
  const router = useRouter();
  const [posts, setPosts] = useState<FeedPost[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const booted = useRef(false);
  const loadingMoreRef = useRef(false);

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
    if (!el || !cursor) return;
    const observer = new IntersectionObserver(([entry]) => {
      if (!entry?.isIntersecting || loadingMoreRef.current) return;
      loadingMoreRef.current = true;
      setLoadingMore(true);
      void load(cursor).finally(() => {
        loadingMoreRef.current = false;
        setLoadingMore(false);
      });
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [cursor, load]);

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
      <div className="-mx-3 bg-black text-white md:mx-0 md:rounded-xl md:border md:border-zinc-800">
        <div className="border-b border-zinc-800 px-3 py-3 text-center font-serif text-2xl">
          {appName}
        </div>
        <StoryBar username={username} canUpload={canUpload} />
        <p className="px-6 py-16 text-center text-sm text-zinc-500">
          No posts yet. A new photo also appears in status for 24 hours.
        </p>
      </div>
    );
  }

  return (
    <div className="-mx-3 bg-black text-white md:mx-0 md:overflow-hidden md:rounded-xl md:border md:border-zinc-800">
      <div className="sticky top-0 z-20 flex items-center justify-center border-b border-zinc-800 bg-black px-3 py-3 md:static">
        <h1 className="font-serif text-2xl tracking-tight">{appName}</h1>
      </div>
      <StoryBar username={username} canUpload={canUpload} />
      <div>
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
    </div>
  );
}
