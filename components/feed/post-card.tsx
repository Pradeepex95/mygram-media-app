"use client";

import Link from "next/link";
import { useState } from "react";
import { Heart, MessageCircle, Trash2 } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { toast } from "sonner";
import { VideoPlayer } from "@/components/media/video-player";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

export type FeedPost = {
  id: string;
  caption: string | null;
  createdAt: string;
  author: { id: string; username: string; avatarKey?: string | null };
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
    <Card className="overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3">
        <Link href={`/profile/${post.author.username}`} className="font-semibold hover:underline">
          {post.author.username}
        </Link>
        <span className="text-xs text-zinc-500">
          {formatDistanceToNow(new Date(post.createdAt), { addSuffix: true })}
        </span>
      </div>

      {media?.type === "VIDEO" ? (
        <VideoPlayer
          src={media.url}
          poster={media.thumbnailUrl}
          className="aspect-square w-full"
        />
      ) : media ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={media.url}
          alt={post.caption || "Post media"}
          className="aspect-square w-full object-cover"
          loading="lazy"
          onContextMenu={(e) => e.preventDefault()}
          draggable={false}
        />
      ) : null}

      <div className="space-y-2 p-4">
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            onClick={toggleLike}
            aria-label={liked ? "Unlike" : "Like"}
          >
            <Heart className={liked ? "fill-pink-500 text-pink-500" : ""} />
          </Button>
          <Link href={`/p/${post.id}`}>
            <Button variant="ghost" size="icon" aria-label="Comments">
              <MessageCircle />
            </Button>
          </Link>
          {currentUserId === post.author.id && (
            <Button variant="ghost" size="icon" onClick={remove} aria-label="Delete">
              <Trash2 className="text-red-500" />
            </Button>
          )}
        </div>
        <p className="text-sm font-semibold">{likeCount} likes</p>
        {post.caption && (
          <p className="text-sm">
            <Link href={`/profile/${post.author.username}`} className="mr-2 font-semibold">
              {post.author.username}
            </Link>
            {post.caption}
          </p>
        )}
        <Link href={`/p/${post.id}`} className="text-sm text-zinc-500 hover:underline">
          View {post.commentCount} comments
        </Link>
      </div>
    </Card>
  );
}
