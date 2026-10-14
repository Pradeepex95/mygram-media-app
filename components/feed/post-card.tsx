"use client";

import Link from "next/link";
import { useState } from "react";
import { Bookmark, Heart, MessageCircle, Send, Trash2 } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { toast } from "sonner";
import { VideoPlayer } from "@/components/media/video-player";

export type FeedPost = {
  id: string;
  caption: string | null;
  createdAt: string;
  author: {
    id: string;
    username: string;
    avatarUrl?: string | null;
  };
  likeCount: number;
  commentCount: number;
  likedByMe: boolean;
  media: Array<{
    id: string;
    type: "IMAGE" | "VIDEO";
    url: string;
    thumbnailUrl?: string | null;
  }>;
};

export function PostCard({
  post,
  currentUserId,
  onDeleted,
}: {
  post: FeedPost;
  currentUserId?: string;
  onDeleted?: (id: string) => void;
}) {
  const [liked, setLiked] = useState(post.likedByMe);
  const [likeCount, setLikeCount] = useState(post.likeCount);
  const media = post.media[0];

  async function toggleLike() {
    const res = await fetch(`/api/posts/${post.id}/like`, { method: "POST" });
    if (!res.ok) {
      toast.error("Could not update like");
      return;
    }
    const data = await res.json();
    setLiked(data.liked);
    setLikeCount(data.likeCount);
  }

  async function remove() {
    if (!confirm("Delete this post?")) return;
    const res = await fetch(`/api/posts/${post.id}`, { method: "DELETE" });
    if (!res.ok) {
      toast.error("Could not delete post");
      return;
    }
    toast.success("Post deleted");
    onDeleted?.(post.id);
  }

  return (
    <article className="border-b border-zinc-800 bg-black text-white">
      <div className="flex items-center gap-3 px-3 py-2">
        <Link href={`/profile/${post.author.username}`} className="h-8 w-8 overflow-hidden rounded-full bg-gradient-to-tr from-yellow-400 via-pink-500 to-purple-600 p-[2px]">
          {post.author.avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={post.author.avatarUrl} alt="" className="h-full w-full rounded-full object-cover" />
          ) : (
            <span className="flex h-full w-full items-center justify-center rounded-full bg-zinc-900 text-xs font-semibold">
              {post.author.username.slice(0, 1).toUpperCase()}
            </span>
          )}
        </Link>
        <Link href={`/profile/${post.author.username}`} className="text-sm font-semibold">
          {post.author.username}
        </Link>
      </div>

      {media?.type === "VIDEO" ? (
        <VideoPlayer src={media.url} poster={media.thumbnailUrl} className="aspect-[4/5] w-full" />
      ) : media ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={media.url}
          alt={post.caption || "Post"}
          className="aspect-[4/5] w-full object-cover"
          loading="lazy"
          onContextMenu={(e) => e.preventDefault()}
          draggable={false}
        />
      ) : null}

      <div className="space-y-2 px-3 py-2">
        <div className="flex items-center">
          <button type="button" onClick={toggleLike} aria-label={liked ? "Unlike" : "Like"} className="p-1">
            <Heart className={liked ? "fill-red-500 text-red-500" : ""} />
          </button>
          <Link href={`/p/${post.id}`} className="p-1" aria-label="Comments">
            <MessageCircle />
          </Link>
          <Link href={`/p/${post.id}`} className="p-1" aria-label="Share">
            <Send />
          </Link>
          {currentUserId === post.author.id && (
            <button type="button" onClick={remove} aria-label="Delete" className="p-1">
              <Trash2 className="h-5 w-5 text-zinc-400" />
            </button>
          )}
          <Bookmark className="ml-auto" />
        </div>
        <p className="text-sm font-semibold">{likeCount.toLocaleString()} likes</p>
        {post.caption && (
          <p className="text-sm">
            <Link href={`/profile/${post.author.username}`} className="mr-2 font-semibold">
              {post.author.username}
            </Link>
            {post.caption}
          </p>
        )}
        <Link href={`/p/${post.id}`} className="block text-sm text-zinc-500">
          View all {post.commentCount} comments
        </Link>
        <p className="text-[11px] uppercase tracking-wide text-zinc-500">
          {formatDistanceToNow(new Date(post.createdAt), { addSuffix: true })}
        </p>
      </div>
    </article>
  );
}
