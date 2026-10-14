import { requireAdmin } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { handleRouteError, jsonOk } from "@/lib/api";
import { createPresignedViewUrl } from "@/lib/storage";

export async function GET(request: Request) {
  try {
    await requireAdmin();
    const { searchParams } = new URL(request.url);
    const type = searchParams.get("type") || "posts";

    if (type === "comments") {
      const comments = await prisma.comment.findMany({
        orderBy: { createdAt: "desc" },
        take: 100,
        include: {
          user: { select: { id: true, username: true } },
          post: { select: { id: true } },
        },
      });
      return jsonOk({ comments });
    }

    const posts = await prisma.post.findMany({
      orderBy: { createdAt: "desc" },
      take: 100,
      include: {
        author: { select: { id: true, username: true } },
        media: true,
        _count: { select: { likes: true, comments: true } },
      },
    });

    return jsonOk({
      posts: await Promise.all(
        posts.map(async (post) => ({
          id: post.id,
          caption: post.caption,
          createdAt: post.createdAt,
          author: post.author,
          likeCount: post._count.likes,
          commentCount: post._count.comments,
          media: await Promise.all(
            post.media.map(async (m) => ({
              id: m.id,
              type: m.type,
              url: await createPresignedViewUrl(m.storageKey),
              thumbnailUrl: m.thumbnailKey
                ? await createPresignedViewUrl(m.thumbnailKey)
                : null,
            })),
          ),
        })),
      ),
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
