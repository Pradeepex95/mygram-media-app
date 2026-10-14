import { notFound } from "next/navigation";
import { requireAuth } from "@/lib/auth/session";
import { getPost } from "@/server/posts/service";
import { PostDetail } from "@/components/feed/post-detail";

type Props = { params: Promise<{ id: string }> };

export default async function PostPage({ params }: Props) {
  const user = await requireAuth();
  const { id } = await params;
  const post = await getPost({ postId: id, viewerId: user.id });
  if (!post) notFound();

  return (
    <PostDetail
      post={{
        ...post,
        createdAt: post.createdAt.toISOString(),
        comments: post.comments.map((c) => ({
          ...c,
          createdAt: c.createdAt.toISOString(),
        })),
      }}
    />
  );
}
