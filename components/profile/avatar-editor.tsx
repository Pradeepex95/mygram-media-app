"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

export function AvatarEditor({
  username,
  avatarUrl,
  canEdit,
}: {
  username: string;
  avatarUrl: string | null;
  canEdit: boolean;
}) {
  const router = useRouter();
  const [url, setUrl] = useState(avatarUrl);
  const [busy, setBusy] = useState(false);

  async function onFile(file: File | undefined) {
    if (!file) return;
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      toast.error("Use a jpg, png, or webp photo");
      return;
    }
    setBusy(true);
    try {
      const presignRes = await fetch("/api/upload/presign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mimeType: file.type,
          sizeBytes: file.size,
          kind: "avatar",
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
      const saved = await fetch("/api/me/avatar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ storageKey: presign.key }),
      });
      const data = await saved.json();
      if (!saved.ok) throw new Error(data.error || "Could not save photo");
      setUrl(data.avatarUrl);
      toast.success("Profile photo updated");
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Upload failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col items-center gap-3">
      <div className="h-24 w-24 overflow-hidden rounded-full bg-gradient-to-tr from-yellow-400 via-pink-500 to-purple-600 p-[3px]">
        {url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={url} alt="" className="h-full w-full rounded-full object-cover" />
        ) : (
          <span className="flex h-full w-full items-center justify-center rounded-full bg-zinc-900 text-3xl font-semibold text-white">
            {username.slice(0, 1).toUpperCase()}
          </span>
        )}
      </div>
      {canEdit && (
        <label className="cursor-pointer text-sm font-semibold text-sky-500">
          {busy ? "Uploading..." : "Change profile photo"}
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            disabled={busy}
            onChange={(event) => void onFile(event.target.files?.[0])}
          />
        </label>
      )}
    </div>
  );
}
