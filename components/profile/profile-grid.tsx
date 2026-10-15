"use client";

import Link from "next/link";
import { useState } from "react";
import { Clapperboard, Grid3x3, Heart, Layers, MessageCircle, Play, Repeat2, SquareUser } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

type ProfilePost = {
  id: string;
  likeCount: number;
  commentCount: number;
  mediaCount: number;
  media: Array<{
    id: string;
    type: "IMAGE" | "VIDEO";
    url: string;
    thumbnailUrl: string | null;
  }>;
};

type Tab = "posts" | "videos" | "reposts" | "tagged";

const tabs: Array<{ id: Tab; label: string; icon: typeof Grid3x3 }> = [
  { id: "posts", label: "Posts", icon: Grid3x3 },
  { id: "videos", label: "Videos", icon: Clapperboard },
  { id: "reposts", label: "Reposts", icon: Repeat2 },
  { id: "tagged", label: "Tagged", icon: SquareUser },
];

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
  const [tab, setTab] = useState<Tab>("posts");

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

  const visible =
    tab === "videos"
      ? posts.filter((post) => post.media[0]?.type === "VIDEO")
      : tab === "posts"
        ? posts
        : [];

  return (
    <div className="bg-black text-white md:bg-white md:text-zinc-900 md:dark:bg-black md:dark:text-white">
      <div className="mt-3 grid grid-cols-4 border-t border-zinc-800 md:border-zinc-200 md:dark:border-zinc-800">
        {tabs.map((item) => {
          const Icon = item.icon;
          const active = tab === item.id;
          return (
            <button
              key={item.id}
              type="button"
              aria-label={item.label}
              className={cn(
                "flex h-11 items-center justify-center border-b",
                active
                  ? "border-white text-white md:border-zinc-900 md:text-zinc-900 md:dark:border-white md:dark:text-white"
                  : "border-transparent text-zinc-500",
              )}
              onClick={() => setTab(item.id)}
            >
              <Icon className="h-6 w-6" />
            </button>
          );
        })}
      </div>

      {tab === "reposts" || tab === "tagged" || visible.length === 0 ? (
        <Empty tab={tab} hasPosts={posts.length > 0} />
      ) : (
        <div className="grid grid-cols-3 gap-px">
          {visible.map((post) => {
            const media = post.media[0];
            const src = media?.thumbnailUrl || media?.url;
            return (
              <Link
                key={post.id}
                href={`/p/${post.id}`}
                className="group relative aspect-square overflow-hidden bg-zinc-900 md:bg-zinc-100 md:dark:bg-zinc-900"
              >
                {src ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={src} alt="" className="h-full w-full object-cover" loading="lazy" />
                ) : null}
                {media?.type === "VIDEO" && (
                  <Play className="absolute top-2 right-2 h-4 w-4 fill-white text-white drop-shadow" />
                )}
                {media?.type !== "VIDEO" && post.mediaCount > 1 && (
                  <Layers className="absolute top-2 right-2 h-4 w-4 text-white drop-shadow" />
                )}
                <span className="absolute inset-0 hidden items-center justify-center gap-4 bg-black/40 text-sm font-semibold text-white md:group-hover:flex">
                  <span className="inline-flex items-center gap-1">
                    <Heart className="h-4 w-4 fill-white" />
                    {post.likeCount}
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <MessageCircle className="h-4 w-4 fill-white" />
                    {post.commentCount}
                  </span>
                </span>
              </Link>
            );
          })}
        </div>
      )}

      {cursor && (tab === "posts" || tab === "videos") && (
        <button
          type="button"
          className="mx-4 my-4 h-9 w-[calc(100%-2rem)] rounded-lg bg-zinc-800 text-sm font-semibold text-white disabled:opacity-60 md:bg-zinc-100 md:text-zinc-900 md:dark:bg-zinc-800 md:dark:text-white"
          disabled={loading}
          onClick={() => void loadMore()}
        >
          {loading ? "Loading..." : "Load more"}
        </button>
      )}
    </div>
  );
}

function Empty({ tab, hasPosts }: { tab: Tab; hasPosts: boolean }) {
  if (tab === "videos" && hasPosts) {
    return <EmptyMessage title="No videos yet" />;
  }
  if (tab === "reposts") {
    return <EmptyMessage title="No reposts" body="Posts you repost will show up here." />;
  }
  if (tab === "tagged") {
    return <EmptyMessage title="No photos" body="Photos you're tagged in will show up here." />;
  }
  if (tab === "posts" && !hasPosts) {
    return <EmptyMessage title="No posts yet" />;
  }
  if (tab === "videos") {
    return <EmptyMessage title="No videos yet" />;
  }
  return null;
}

function EmptyMessage({ title, body }: { title: string; body?: string }) {
  return (
    <div className="px-8 py-16 text-center">
      <p className="text-lg font-semibold">{title}</p>
      {body && <p className="mt-1 text-sm text-zinc-400">{body}</p>}
    </div>
  );
}
