import { notFound } from "next/navigation";
import { Role } from "@prisma/client";
import { requireAuth } from "@/lib/auth/session";
import { canUpload, getProfile } from "@/server/posts/service";
import { listActiveStories } from "@/server/stories/service";
import { ProfileHeader } from "@/components/profile/profile-header";
import { ProfileGrid } from "@/components/profile/profile-grid";
import type { StoryGroup } from "@/components/feed/story-viewer";

type Props = { params: Promise<{ username: string }> };

export default async function ProfilePage({ params }: Props) {
  const user = await requireAuth();
  const { username } = await params;
  const profile = await getProfile({
    username: username.toLowerCase(),
    viewerId: user.id,
  });
  if (!profile) notFound();

  const [uploadAllowed, stories] = await Promise.all([
    canUpload(user),
    listActiveStories(user.id),
  ]);
  const group = [stories.mine, ...stories.others].find(
    (item) => item?.user.id === profile.id,
  );
  const highlights: StoryGroup | null = group
    ? {
        user: {
          id: group.user.id,
          username: group.user.username,
          avatarUrl: group.user.avatarUrl,
        },
        items: group.items.map((item) => ({
          id: item.id,
          type: item.type,
          url: item.url,
          createdAt: item.createdAt.toISOString(),
          expiresAt: item.expiresAt.toISOString(),
        })),
      }
    : null;

  return (
    <div className="md:overflow-hidden md:rounded-xl md:border md:border-zinc-200 md:dark:border-zinc-800">
      <ProfileHeader
        username={profile.username}
        viewerUsername={user.username}
        bio={profile.bio}
        avatarUrl={profile.avatarUrl}
        postCount={profile.postCount}
        isOwn={user.id === profile.id}
        canEditAvatar={user.role === Role.ADMIN && user.id === profile.id}
        canUpload={uploadAllowed && user.id === profile.id}
        highlights={highlights}
      />
      <ProfileGrid
        username={profile.username}
        initialPosts={profile.posts}
        initialCursor={profile.nextCursor}
      />
    </div>
  );
}
