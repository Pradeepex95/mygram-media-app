import { requireAdmin } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { handleRouteError, jsonOk } from "@/lib/api";
import { createPresignedViewUrl } from "@/lib/storage";
import { adminContentQuerySchema } from "@/lib/validations";
import { clampPageSize, decodeTimeCursor, encodeTimeCursor } from "@/lib/pagination";

export async function GET(request: Request) {
  try {
    await requireAdmin();
    const { searchParams } = new URL(request.url);
    const query = adminContentQuerySchema.parse({
      type: searchParams.get("type") || undefined,
      cursor: searchParams.get("cursor") || undefined,
      take: searchParams.get("take") || undefined,
    });
    const take = clampPageSize(query.take);
    const cursor = decodeTimeCursor(query.cursor);
    const cursorWhere = cursor
      ? {
          OR: [
            { createdAt: { lt: cursor.createdAt } },
            { createdAt: cursor.createdAt, id: { lt: cursor.id } },
          ],
        }
      : undefined;

    if (query.type === "comments") {
      const comments = await prisma.comment.findMany({
        where: cursorWhere,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: take + 1,
        select: {
          id: true,
          body: true,
          createdAt: true,
          user: { select: { id: true, username: true } },
          post: { select: { id: true } },
        },
      });
      const hasMore = comments.length > take;
      const items = hasMore ? comments.slice(0, take) : comments;
      return jsonOk({
        comments: items,
        nextCursor:
          hasMore && items.length
            ? encodeTimeCursor({
                createdAt: items[items.length - 1].createdAt,
                id: items[items.length - 1].id,
              })
            : null,
      });
    }

    const posts = await prisma.post.findMany({
      where: cursorWhere,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: take + 1,
      select: {
        id: true,
        caption: true,
        createdAt: true,
        likeCount: true,
        commentCount: true,
        author: { select: { id: true, username: true } },
        media: {
          take: 1,
          orderBy: { createdAt: "asc" },
          select: {
            id: true,
            type: true,
            storageKey: true,
            thumbnailKey: true,
          },
        },
      },
    });
    const hasMore = posts.length > take;
    const items = hasMore ? posts.slice(0, take) : posts;

    return jsonOk({
      posts: await Promise.all(
        items.map(async (post) => ({
          id: post.id,
          caption: post.caption,
          createdAt: post.createdAt,
          author: post.author,
          likeCount: post.likeCount,
          commentCount: post.commentCount,
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
      nextCursor:
        hasMore && items.length
          ? encodeTimeCursor({
              createdAt: items[items.length - 1].createdAt,
              id: items[items.length - 1].id,
            })
          : null,
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
