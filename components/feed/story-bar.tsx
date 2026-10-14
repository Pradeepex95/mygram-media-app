"use client";

import { useEffect, useRef, useState } from "react";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { StoryViewer, type StoryGroup } from "@/components/feed/story-viewer";

const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];
const VIDEO_TYPES = ["video/mp4", "video/quicktime", "video/webm"];

async function putFile(url: string, file: Blob, type: string) {
  const res = await fetch(url, {
    method: "PUT",
    headers: { "Content-Type": type },
    body: file,
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || "Upload failed");
  }
}

export function StoryBar({
  username,
  canUpload,
}: {
  username: string;
  canUpload: boolean;
}) {
  const [mine, setMine] = useState<StoryGroup | null>(null);
  const [others, setOthers] = useState<StoryGroup[]>([]);
  const [open, setOpen] = useState<StoryGroup | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function load() {
    const res = await fetch("/api/stories");
    if (!res.ok) return;
    const data = await res.json();
    setMine(data.mine);
    setOthers(data.others || []);
  }

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void load();
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  async function onFile(file: File | undefined) {
    if (!file) return;
    const allowed = [...IMAGE_TYPES, ...VIDEO_TYPES];
    if (!allowed.includes(file.type)) {
      toast.error("Use a photo or video");
      return;
    }
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
      await putFile(presign.uploadUrl, file, file.type);
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
      if (!created.ok) throw new Error(body.error || "Could not publish status");
      toast.success("Status is live for 24 hours");
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Upload failed");
    }
  }

  const minePreview = mine?.items.at(-1)?.url || mine?.user.avatarUrl;

  return (
    <>
      <div className="flex gap-4 overflow-x-auto px-3 py-3">
        <button
          type="button"
          className="flex w-16 shrink-0 flex-col items-center gap-1"
          onClick={() => {
            if (mine) setOpen(mine);
            else if (canUpload) fileRef.current?.click();
          }}
        >
          <span className="relative">
            <span
              className={`block h-16 w-16 overflow-hidden rounded-full p-[2px] ${
                mine
                  ? "bg-gradient-to-tr from-yellow-400 via-pink-500 to-purple-600"
                  : "bg-zinc-700"
              }`}
            >
              {minePreview ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={minePreview} alt="" className="h-full w-full rounded-full object-cover" />
              ) : (
                <span className="flex h-full w-full items-center justify-center rounded-full bg-zinc-800 text-lg font-semibold">
                  {username.slice(0, 1).toUpperCase()}
                </span>
              )}
            </span>
            {canUpload && (
              <span
                className="absolute bottom-0 right-0 flex h-5 w-5 items-center justify-center rounded-full border-2 border-black bg-blue-500"
                onClick={(event) => {
                  event.stopPropagation();
                  fileRef.current?.click();
                }}
              >
                <Plus className="h-3 w-3 text-white" />
              </span>
            )}
          </span>
          <span className="w-full truncate text-center text-[11px]">Your story</span>
        </button>

        {others.map((group) => {
          const preview = group.items.at(-1)?.url || group.user.avatarUrl;
          return (
            <button
              key={group.user.id}
              type="button"
              className="flex w-16 shrink-0 flex-col items-center gap-1"
              onClick={() => setOpen(group)}
            >
              <span className="block h-16 w-16 overflow-hidden rounded-full bg-gradient-to-tr from-yellow-400 via-pink-500 to-purple-600 p-[2px]">
                {preview ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={preview} alt="" className="h-full w-full rounded-full object-cover" />
                ) : (
                  <span className="flex h-full w-full items-center justify-center rounded-full bg-zinc-800 text-lg">
                    {group.user.username.slice(0, 1).toUpperCase()}
                  </span>
                )}
              </span>
              <span className="w-full truncate text-center text-[11px]">
                {group.user.username}
              </span>
            </button>
          );
        })}
      </div>
      <input
        ref={fileRef}
        type="file"
        accept={[...IMAGE_TYPES, ...VIDEO_TYPES].join(",")}
        className="hidden"
        onChange={(event) => {
          void onFile(event.target.files?.[0]);
          event.target.value = "";
        }}
      />
      {open && <StoryViewer group={open} onClose={() => setOpen(null)} />}
    </>
  );
}
