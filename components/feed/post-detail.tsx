"use client";

import { useState } from "react";
import Link from "next/link";
import { Heart, Send } from "lucide-react";
import { toast } from "sonner";
import { VideoPlayer } from "@/components/media/video-player";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

type Comment = {
  id: string;
  body: string;
  createdAt: string;
  user: { id: string; username: string };
};

type PostDetailData = {
  id: string;
  caption: string | null;
  createdAt: string;
  author: { id: string; username: string };
  likeCount: number;
  commentCount: number;
  likedByMe: boolean;
  comments: Comment[];
  commentNextCursor: string | null;
  media: Array<{
    id: string;
    type: "IMAGE" | "VIDEO";
    url: string;
    thumbnailUrl?: string | null;
  }>;
};

export function PostDetail({ post }: { post: PostDetailData }) {
  const [liked, setLiked] = useState(post.likedByMe);
  const [likeCount, setLikeCount] = useState(post.likeCount);
  const [comments, setComments] = useState(post.comments);
  const [commentCursor, setCommentCursor] = useState(post.commentNextCursor);
  const [loadingComments, setLoadingComments] = useState(false);
  const [body, setBody] = useState("");
  const media = post.media[0];

  async function toggleLike() {
    const res = await fetch(`/api/posts/${post.id}/like`, { method: "POST" });
    if (!res.ok) return toast.error("Could not update like");
    const data = await res.json();
    setLiked(data.liked);
    setLikeCount(data.likeCount);
  }

  async function submitComment(e: React.FormEvent) {
    e.preventDefault();
    if (!body.trim()) return;
    const res = await fetch(`/api/posts/${post.id}/comments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body }),
    });
    if (!res.ok) {
      toast.error("Could not add comment");
      return;
    }
    const data = await res.json();
    setComments((prev) => [...prev, data.comment]);
    setBody("");
  }

  async function loadMoreComments() {
    if (!commentCursor || loadingComments) return;
    setLoadingComments(true);
    try {
      const params = new URLSearchParams({ cursor: commentCursor });
      const res = await fetch(`/api/posts/${post.id}/comments?${params}`);
      if (!res.ok) {
        toast.error("Could not load more comments");
        return;
      }
      const data = await res.json();
      setComments((prev) => [...prev, ...data.items]);
      setCommentCursor(data.nextCursor);
    } finally {
      setLoadingComments(false);
    }
  }

  return (
    <Card className="overflow-hidden">
      <div className="px-4 py-3 font-semibold">
        <Link href={`/profile/${post.author.username}`} className="hover:underline">
          {post.author.username}
        </Link>
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
          alt={post.caption || "Post"}
          className="aspect-square w-full object-cover"
          onContextMenu={(e) => e.preventDefault()}
          draggable={false}
        />
      ) : null}
      <div className="space-y-3 p-4">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" onClick={toggleLike}>
            <Heart className={liked ? "fill-pink-500 text-pink-500" : ""} />
          </Button>
          <span className="text-sm font-semibold">{likeCount} likes</span>
        </div>
        {post.caption && (
          <p className="text-sm">
            <span className="mr-2 font-semibold">{post.author.username}</span>
            {post.caption}
          </p>
        )}
        <div className="space-y-2 border-t pt-3 dark:border-zinc-800">
          {comments.map((c) => (
            <p key={c.id} className="text-sm">
              <span className="mr-2 font-semibold">{c.user.username}</span>
              {c.body}
            </p>
          ))}
          {commentCursor && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={loadingComments}
              onClick={loadMoreComments}
            >
              {loadingComments ? "Loading..." : "Load more comments"}
            </Button>
          )}
        </div>
        <form className="flex gap-2" onSubmit={submitComment}>
          <Input
            placeholder="Add a comment..."
            value={body}
            onChange={(e) => setBody(e.target.value)}
            maxLength={1000}
          />
          <Button type="submit" size="icon" aria-label="Send comment">
            <Send className="h-4 w-4" />
          </Button>
        </form>
      </div>
    </Card>
  );
}
