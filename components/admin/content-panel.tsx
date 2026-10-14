"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type AdminPost = {
  id: string;
  caption: string | null;
  likeCount: number;
  commentCount: number;
  author: { username: string };
  media: Array<{ url: string; thumbnailUrl?: string | null }>;
};

type AdminComment = {
  id: string;
  body: string;
  user: { username: string };
  post: { id: string };
};

export function ContentPanel() {
  const [tab, setTab] = useState<"posts" | "comments">("posts");
  const [posts, setPosts] = useState<AdminPost[]>([]);
  const [comments, setComments] = useState<AdminComment[]>([]);
  const lastTab = useRef<string | null>(null);

  async function load(type: "posts" | "comments") {
    const res = await fetch(`/api/admin/content?type=${type}`);
    if (!res.ok) return toast.error("Failed to load content");
    const data = await res.json();
    if (type === "posts") setPosts(data.posts || []);
    else setComments(data.comments || []);
  }

  useEffect(() => {
    if (lastTab.current === tab) return;
    lastTab.current = tab;
    queueMicrotask(() => {
      void load(tab);
    });
  }, [tab]);

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <Button
          variant={tab === "posts" ? "default" : "secondary"}
          onClick={() => setTab("posts")}
        >
          Posts
        </Button>
        <Button
          variant={tab === "comments" ? "default" : "secondary"}
          onClick={() => setTab("comments")}
        >
          Comments
        </Button>
      </div>

      {tab === "posts" ? (
        <div className="space-y-3">
          {posts.map((post) => (
            <Card key={post.id}>
              <CardHeader>
                <CardTitle className="text-base">
                  @{post.author.username} · {post.likeCount} likes ·{" "}
                  {post.commentCount} comments
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {post.caption && <p className="text-sm">{post.caption}</p>}
                {post.media?.[0]?.url && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={post.media[0].thumbnailUrl || post.media[0].url}
                    alt=""
                    className="max-h-48 rounded-lg object-cover"
                  />
                )}
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={async () => {
                    if (!confirm("Delete this post?")) return;
                    const res = await fetch(`/api/admin/posts/${post.id}`, {
                      method: "DELETE",
                    });
                    if (!res.ok) return toast.error("Delete failed");
                    toast.success("Post deleted");
                    void load("posts");
                  }}
                >
                  Delete post
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <div className="space-y-3">
          {comments.map((comment) => (
            <Card key={comment.id}>
              <CardContent className="space-y-2 pt-4">
                <p className="text-sm">
                  <span className="font-semibold">@{comment.user.username}</span>{" "}
                  on post {comment.post.id}
                </p>
                <p className="text-sm">{comment.body}</p>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={async () => {
                    if (!confirm("Delete this comment?")) return;
                    const res = await fetch(`/api/admin/comments/${comment.id}`, {
                      method: "DELETE",
                    });
                    if (!res.ok) return toast.error("Delete failed");
                    toast.success("Comment deleted");
                    void load("comments");
                  }}
                >
                  Delete comment
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
