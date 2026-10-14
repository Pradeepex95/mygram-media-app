import { requireAuth } from "@/lib/auth/session";
import { FeedList } from "@/components/feed/feed-list";
import { getAppName } from "@/lib/env";

export default async function FeedPage() {
  const user = await requireAuth();
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">{getAppName()} Feed</h1>
        <p className="text-sm text-zinc-500">Newest photos and videos</p>
      </div>
      <FeedList currentUserId={user.id} />
    </div>
  );
}
