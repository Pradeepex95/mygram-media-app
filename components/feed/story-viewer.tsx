"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";

export type StoryItem = {
  id: string;
  type: "IMAGE" | "VIDEO";
  url: string;
  createdAt: string;
  expiresAt: string;
};

export type StoryGroup = {
  user: { id: string; username: string; avatarUrl: string | null };
  items: StoryItem[];
};

export function StoryViewer({
  group,
  onClose,
}: {
  group: StoryGroup;
  onClose: () => void;
}) {
  const [index, setIndex] = useState(0);
  const [mediaFailed, setMediaFailed] = useState(false);
  const item = group.items[index];

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
      if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
        setMediaFailed(false);
        setIndex((n) =>
          event.key === "ArrowRight"
            ? Math.min(group.items.length - 1, n + 1)
            : Math.max(0, n - 1),
        );
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [group.items.length, onClose]);

  if (!item) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/95">
      <button
        type="button"
        className="absolute right-4 top-4 text-white"
        onClick={onClose}
        aria-label="Close status"
      >
        <X />
      </button>
      <div className="w-full max-w-md px-3">
        <div className="mb-3 flex gap-1">
          {group.items.map((story, i) => (
            <span
              key={story.id}
              className={`h-0.5 flex-1 rounded ${i <= index ? "bg-white" : "bg-white/30"}`}
            />
          ))}
        </div>
        <p className="mb-2 text-sm font-semibold text-white">{group.user.username}</p>
        <button
          type="button"
          className="block w-full"
          onClick={() => {
            if (index < group.items.length - 1) {
              setMediaFailed(false);
              setIndex(index + 1);
            }
            else onClose();
          }}
        >
          {mediaFailed ? (
            <p className="py-16 text-center text-sm text-zinc-300">This video can’t be played. Upload it again.</p>
          ) : item.type === "VIDEO" ? (
            <video
              key={item.id}
              src={item.url}
              className="max-h-[75vh] w-full rounded-lg object-contain"
              muted
              playsInline
              controlsList="nodownload"
              onLoadedData={(event) => {
                void event.currentTarget.play().catch(() => setMediaFailed(true));
              }}
              onError={() => setMediaFailed(true)}
            />
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={item.url} alt="" className="max-h-[75vh] w-full rounded-lg object-contain" />
          )}
        </button>
        <p className="mt-2 text-center text-xs text-zinc-400">Visible for 24 hours</p>
      </div>
    </div>
  );
}
