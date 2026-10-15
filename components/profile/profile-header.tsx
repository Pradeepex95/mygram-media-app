"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AtSign,
  Bell,
  ChevronDown,
  Lock,
  LogOut,
  Menu,
  Moon,
  Plus,
  Sun,
  UserPlus,
  X,
} from "lucide-react";
import { useTheme } from "next-themes";
import { toast } from "sonner";
import { AvatarEditor } from "@/components/profile/avatar-editor";
import { StoryViewer, type StoryGroup } from "@/components/feed/story-viewer";

const STORY_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "video/mp4",
  "video/quicktime",
  "video/webm",
];

type Panel = "account" | "more" | "edit" | "link" | "followers" | "following" | "alerts" | null;

export function ProfileHeader({
  username,
  viewerUsername,
  bio,
  avatarUrl,
  postCount,
  isOwn,
  canEditAvatar,
  canUpload,
  highlights,
}: {
  username: string;
  viewerUsername: string;
  bio: string | null;
  avatarUrl: string | null;
  postCount: number;
  isOwn: boolean;
  canEditAvatar: boolean;
  canUpload: boolean;
  highlights: StoryGroup | null;
}) {
  const router = useRouter();
  const { resolvedTheme, setTheme } = useTheme();
  const storyRef = useRef<HTMLInputElement>(null);
  const [panel, setPanel] = useState<Panel>(null);
  const [draft, setDraft] = useState(bio ?? "");
  const [currentBio, setCurrentBio] = useState(bio);
  const [saving, setSaving] = useState(false);
  const [storyBusy, setStoryBusy] = useState(false);
  const [viewer, setViewer] = useState<StoryGroup | null>(null);

  const profileUrl = () =>
    typeof window === "undefined" ? `/profile/${username}` : window.location.href;

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(profileUrl());
      toast.success("Profile link copied");
      setPanel(null);
    } catch {
      toast.error("Could not copy the link");
    }
  }

  async function shareProfile() {
    const url = profileUrl();
      if (navigator.share) {
        try {
          await navigator.share({ title: username, url });
          return;
        } catch (error) {
          if (error instanceof Error && error.name === "AbortError") return;
        }
      }
    await copyLink();
  }

  async function saveBio() {
    setSaving(true);
    try {
      const res = await fetch("/api/me", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bio: draft }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Could not save profile");
      setCurrentBio(data.bio ?? null);
      setPanel(null);
      toast.success("Profile updated");
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save profile");
    } finally {
      setSaving(false);
    }
  }

  async function onStoryFile(file: File | undefined) {
    if (!file) return;
    if (!STORY_TYPES.includes(file.type)) {
      toast.error("Use a photo or video");
      return;
    }
    setStoryBusy(true);
    try {
      const presignRes = await fetch("/api/upload/presign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mimeType: file.type,
          sizeBytes: file.size,
          kind: "media",
        }),
      });
      const presign = await presignRes.json();
      if (!presignRes.ok) throw new Error(presign.error || "Could not start upload");
      const put = await fetch(presign.uploadUrl, {
        method: "PUT",
        headers: { "Content-Type": file.type },
        body: file,
      });
      if (!put.ok) throw new Error("Upload failed");
      const created = await fetch("/api/stories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          storageKey: presign.key,
          mimeType: file.type,
          sizeBytes: file.size,
        }),
      });
      const body = await created.json().catch(() => ({}));
      if (!created.ok) throw new Error(body.error || "Could not publish story");
      toast.success("Story is live for 24 hours");
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Upload failed");
    } finally {
      setStoryBusy(false);
    }
  }

  async function logout() {
    const res = await fetch("/api/auth/logout", { method: "POST" });
    if (!res.ok) {
      toast.error("Logout failed");
      return;
    }
    router.replace("/login");
    router.refresh();
  }

  const showHighlights = Boolean(highlights?.items.length) || (isOwn && canUpload);

  return (
    <header className="bg-black text-white md:bg-white md:text-zinc-900 md:dark:bg-black md:dark:text-white">
      <div className="sticky top-0 z-20 flex h-12 items-center justify-between bg-black px-3 md:bg-white md:dark:bg-black">
        <div className="flex w-16 justify-start">
          {canUpload ? (
            <Link href="/upload" aria-label="New post" className="rounded-full p-1">
              <Plus className="h-7 w-7" />
            </Link>
          ) : null}
        </div>
        <button
          type="button"
          className="flex max-w-[60%] items-center gap-1 text-base font-semibold"
          onClick={() => setPanel(panel === "account" ? null : "account")}
        >
          <Lock className="h-4 w-4 shrink-0" />
          <span className="truncate">{username}</span>
          <ChevronDown className="h-4 w-4 shrink-0" />
        </button>
        <div className="flex w-16 items-center justify-end gap-2">
          <button
            type="button"
            aria-label="Notifications"
            className="rounded-full p-1"
            onClick={() => setPanel("alerts")}
          >
            <Bell className="h-6 w-6" />
          </button>
          <button
            type="button"
            aria-label="Options"
            className="rounded-full p-1"
            onClick={() => setPanel(panel === "more" ? null : "more")}
          >
            <Menu className="h-6 w-6" />
          </button>
        </div>
        {panel === "account" && (
          <div className="absolute top-12 left-1/2 z-30 w-56 -translate-x-1/2 rounded-xl border border-zinc-800 bg-zinc-950 p-2 text-sm text-white shadow-lg md:border-zinc-200 md:bg-white md:text-zinc-900 md:dark:border-zinc-800 md:dark:bg-zinc-950 md:dark:text-white">
          <p className="px-2 py-2 font-semibold">{username}</p>
          {viewerUsername !== username && (
            <Link
              href={`/profile/${viewerUsername}`}
              className="block rounded-lg px-2 py-2 hover:bg-zinc-800 md:hover:bg-zinc-100 md:dark:hover:bg-zinc-800"
              onClick={() => setPanel(null)}
            >
              Your profile
            </Link>
          )}
          <button type="button" className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left hover:bg-zinc-800 md:hover:bg-zinc-100 md:dark:hover:bg-zinc-800" onClick={() => void logout()}>
            <LogOut className="h-4 w-4" />
            Log out
          </button>
          </div>
        )}
        {panel === "more" && (
          <div className="absolute top-12 right-3 z-30 w-48 rounded-xl border border-zinc-800 bg-zinc-950 p-2 text-sm text-white shadow-lg md:border-zinc-200 md:bg-white md:text-zinc-900 md:dark:border-zinc-800 md:dark:bg-zinc-950 md:dark:text-white">
          {isOwn && (
            <button type="button" className="block w-full rounded-lg px-2 py-2 text-left hover:bg-zinc-800 md:hover:bg-zinc-100 md:dark:hover:bg-zinc-800" onClick={() => { setDraft(currentBio ?? ""); setPanel("edit"); }}>
              Edit profile
            </button>
          )}
          <button type="button" className="block w-full rounded-lg px-2 py-2 text-left hover:bg-zinc-800 md:hover:bg-zinc-100 md:dark:hover:bg-zinc-800" onClick={() => void shareProfile()}>
            Share profile
          </button>
          <button
            type="button"
            className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left hover:bg-zinc-800 md:hover:bg-zinc-100 md:dark:hover:bg-zinc-800"
            onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
          >
            <Sun className="hidden h-4 w-4 dark:block" />
            <Moon className="h-4 w-4 dark:hidden" />
            Toggle theme
          </button>
          <button type="button" className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left hover:bg-zinc-800 md:hover:bg-zinc-100 md:dark:hover:bg-zinc-800" onClick={() => void logout()}>
            <LogOut className="h-4 w-4" />
            Log out
          </button>
          </div>
        )}
      </div>

      <div className="flex items-center gap-6 px-4 pt-3">
        <AvatarEditor username={username} avatarUrl={avatarUrl} canEdit={canEditAvatar} />
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-[15px] font-semibold">{username}</h1>
          <div className="mt-3 grid grid-cols-3 text-center">
            <Stat value={postCount} label="posts" />
            <Stat value={0} label="followers" onClick={() => setPanel("followers")} />
            <Stat value={0} label="following" onClick={() => setPanel("following")} />
          </div>
        </div>
      </div>

      {currentBio && (
        <p className="px-4 pt-3 text-sm whitespace-pre-wrap">{currentBio}</p>
      )}

      <div className="flex items-center gap-2 px-4 pt-3">
        <span className="inline-flex max-w-[70%] items-center gap-1 truncate rounded-full border border-zinc-700 px-3 py-1 text-xs font-medium md:border-zinc-300 md:dark:border-zinc-700">
          <AtSign className="h-3.5 w-3.5 shrink-0" />
          <span className="truncate">{username}</span>
        </span>
        {isOwn && (
          <button
            type="button"
            className="inline-flex items-center gap-1 rounded-full border border-zinc-700 px-3 py-1 text-xs font-semibold md:border-zinc-300 md:dark:border-zinc-700"
            onClick={() => {
              setDraft(currentBio ?? "");
              setPanel("edit");
            }}
          >
            <Plus className="h-3.5 w-3.5" />
            Add
          </button>
        )}
      </div>

      <div className="flex items-center gap-1.5 px-4 pt-3">
        {isOwn ? (
          <button
            type="button"
            className="h-8 flex-1 rounded-lg bg-zinc-800 text-sm font-semibold text-white md:bg-zinc-100 md:text-zinc-900 md:dark:bg-zinc-800 md:dark:text-white"
            onClick={() => {
              setDraft(currentBio ?? "");
              setPanel("edit");
            }}
          >
            Edit profile
          </button>
        ) : null}
        <button
          type="button"
          className="h-8 flex-1 rounded-lg bg-zinc-800 text-sm font-semibold text-white md:bg-zinc-100 md:text-zinc-900 md:dark:bg-zinc-800 md:dark:text-white"
          onClick={() => void shareProfile()}
        >
          Share profile
        </button>
        {isOwn && (
          <button
            type="button"
            aria-label="Share profile link"
            className="flex h-8 w-8 items-center justify-center rounded-lg bg-zinc-800 text-white md:bg-zinc-100 md:text-zinc-900 md:dark:bg-zinc-800 md:dark:text-white"
            onClick={() => setPanel("link")}
          >
            <UserPlus className="h-4 w-4" />
          </button>
        )}
      </div>

      {showHighlights && (
        <div className="flex gap-4 overflow-x-auto px-4 pt-5 pb-2">
          {isOwn && canUpload && (
            <button
              type="button"
              className="flex w-16 shrink-0 flex-col items-center gap-1"
              disabled={storyBusy}
              onClick={() => storyRef.current?.click()}
            >
              <span className="flex h-16 w-16 items-center justify-center rounded-full border border-zinc-600">
                <Plus className="h-7 w-7" />
              </span>
              <span className="text-xs">{storyBusy ? "..." : "New"}</span>
            </button>
          )}
          {highlights?.items.map((item, index) => (
            <button
              key={item.id}
              type="button"
              className="flex w-16 shrink-0 flex-col items-center gap-1"
              onClick={() =>
                highlights &&
                setViewer({
                  user: highlights.user,
                  items: highlights.items.slice(index),
                })
              }
            >
              <span className="block h-16 w-16 overflow-hidden rounded-full bg-zinc-800">
                {item.type === "VIDEO" ? (
                  <video src={item.url} className="h-full w-full object-cover" muted preload="metadata" />
                ) : (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={item.url} alt="" className="h-full w-full object-cover" />
                )}
              </span>
              <span className="w-full truncate text-center text-xs">
                {new Date(item.createdAt).toLocaleDateString(undefined, {
                  month: "short",
                  day: "numeric",
                })}
              </span>
            </button>
          ))}
        </div>
      )}

      <input
        ref={storyRef}
        type="file"
        accept={STORY_TYPES.join(",")}
        className="hidden"
        onChange={(event) => {
          void onStoryFile(event.target.files?.[0]);
          event.target.value = "";
        }}
      />

      {panel === "edit" && (
        <Modal title="Edit profile" onClose={() => setPanel(null)}>
          <label className="block text-sm">
            <span className="mb-1 block text-zinc-400">Bio</span>
            <textarea
              value={draft}
              maxLength={150}
              rows={4}
              className="w-full resize-none rounded-lg border border-zinc-700 bg-transparent px-3 py-2 text-sm outline-none focus:border-zinc-400"
              placeholder="Write a short bio"
              onChange={(event) => setDraft(event.target.value)}
            />
            <span className="mt-1 block text-right text-xs text-zinc-500">{draft.length}/150</span>
          </label>
          <button
            type="button"
            className="mt-3 h-9 w-full rounded-lg bg-sky-500 text-sm font-semibold text-white disabled:opacity-60"
            disabled={saving}
            onClick={() => void saveBio()}
          >
            {saving ? "Saving..." : "Save"}
          </button>
        </Modal>
      )}

      {panel === "link" && (
        <Modal title="Share profile" onClose={() => setPanel(null)}>
          <p className="text-sm text-zinc-400">Anyone with an account can open this profile from the link.</p>
          <button
            type="button"
            className="mt-4 h-9 w-full rounded-lg bg-sky-500 text-sm font-semibold text-white"
            onClick={() => void copyLink()}
          >
            Copy link
          </button>
        </Modal>
      )}

      {panel === "followers" && (
        <Modal title="Followers" onClose={() => setPanel(null)}>
          <p className="text-sm text-zinc-400">No followers yet.</p>
        </Modal>
      )}

      {panel === "following" && (
        <Modal title="Following" onClose={() => setPanel(null)}>
          <p className="text-sm text-zinc-400">Not following anyone yet.</p>
        </Modal>
      )}

      {panel === "alerts" && (
        <Modal title="Notifications" onClose={() => setPanel(null)}>
          <p className="text-sm text-zinc-400">No notifications yet.</p>
        </Modal>
      )}

      {viewer && <StoryViewer group={viewer} onClose={() => setViewer(null)} />}
    </header>
  );
}

function Stat({
  value,
  label,
  onClick,
}: {
  value: number;
  label: string;
  onClick?: () => void;
}) {
  const className = "flex flex-col items-center leading-tight";
  const inner = (
    <>
      <span className="text-base font-semibold">{value.toLocaleString()}</span>
      <span className="text-[13px] text-zinc-400">{label}</span>
    </>
  );
  if (!onClick) return <div className={className}>{inner}</div>;
  return (
    <button type="button" className={className} onClick={onClick}>
      {inner}
    </button>
  );
}

function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-black/60 sm:items-center" onClick={onClose}>
      <div
        className="w-full max-w-md rounded-t-2xl bg-zinc-950 p-4 text-white sm:rounded-2xl md:bg-white md:text-zinc-900 md:dark:bg-zinc-950 md:dark:text-white"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-base font-semibold">{title}</h2>
          <button type="button" aria-label="Close" onClick={onClose}>
            <X className="h-5 w-5" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
