import { requireAuth } from "@/lib/auth/session";
import { FeedList } from "@/components/feed/feed-list";
import { getEnv } from "@/lib/env";
import { canUpload } from "@/server/posts/service";

export default async function FeedPage() {
  const user = await requireAuth();
  const env = getEnv();
  return (
    <FeedList
      currentUserId={user.id}
      username={user.username}
      canUpload={await canUpload(user)}
      appName={env.NEXT_PUBLIC_APP_NAME}
    />
  );
}
