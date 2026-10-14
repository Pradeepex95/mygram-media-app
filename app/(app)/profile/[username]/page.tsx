import { notFound } from "next/navigation";
import { requireAuth } from "@/lib/auth/session";
import { getProfile } from "@/server/posts/service";
import { ProfileGrid } from "@/components/profile/profile-grid";
import { Card } from "@/components/ui/card";

type Props = { params: Promise<{ username: string }> };

export default async function ProfilePage({ params }: Props) {
  const user = await requireAuth();
  const { username } = await params;
  const profile = await getProfile({
    username: username.toLowerCase(),
    viewerId: user.id,
  });
  if (!profile) notFound();

  return (
    <div className="space-y-6">
      <Card className="p-6">
        <div className="flex items-center gap-4">
          <div className="flex h-20 w-20 items-center justify-center rounded-full bg-gradient-to-br from-pink-500 to-orange-400 text-2xl font-bold text-white">
            {profile.username.slice(0, 1).toUpperCase()}
          </div>
          <div>
            <h1 className="text-2xl font-bold">{profile.username}</h1>
            <p className="text-sm text-zinc-500">{profile.postCount} posts</p>
            {profile.bio && <p className="mt-2 text-sm">{profile.bio}</p>}
          </div>
        </div>
      </Card>

      <ProfileGrid
        username={profile.username}
        initialPosts={profile.posts}
        initialCursor={profile.nextCursor}
      />
    </div>
  );
}
