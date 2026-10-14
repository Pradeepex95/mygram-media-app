"use client";

import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

type ProfilePost = {
  id: string;
  likeCount: number;
  commentCount: number;
  media: Array<{
    id: string;
    type: "IMAGE" | "VIDEO";
    url: string;
    thumbnailUrl: string | null;
  }>;
};

export function ProfileGrid({
  username,
  initialPosts,
  initialCursor,
}: {
  username: string;
  initialPosts: ProfilePost[];
  initialCursor: string | null;
}) {
  const [posts, setPosts] = useState(initialPosts);
  const [cursor, setCursor] = useState(initialCursor);
  const [loading, setLoading] = useState(false);

  async function loadMore() {
    if (!cursor || loading) return;
    setLoading(true);
    try {
      const params = new URLSearchParams({ cursor });
      const res = await fetch(`/api/profile/${username}?${params}`);
      if (!res.ok) {
        toast.error("Could not load more posts");
        return;
      }
      const data = await res.json();
      setPosts((current) => [...current, ...data.profile.posts]);
      setCursor(data.profile.nextCursor);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-1 md:gap-2">
        {posts.map((post) => {
          const media = post.media[0];
          const src = media?.thumbnailUrl || media?.url;
          return (
            <Link
              key={post.id}
              href={`/p/${post.id}`}
              className="relative aspect-square overflow-hidden bg-zinc-100 dark:bg-zinc-900"
            >
              {src ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={src}
                  alt=""
                  className="h-full w-full object-cover"
                  loading="lazy"
                />
              ) : null}
              {media?.type === "VIDEO" && (
                <span className="absolute top-1 right-1 rounded bg-black/60 px-1 text-[10px] text-white">
                  VIDEO
                </span>
              )}
            </Link>
          );
        })}
      </div>
      {cursor && (
        <Button
          type="button"
          variant="secondary"
          className="w-full"
          disabled={loading}
          onClick={loadMore}
        >
          {loading ? "Loading..." : "Load more posts"}
        </Button>
      )}
    </div>
  );
}
