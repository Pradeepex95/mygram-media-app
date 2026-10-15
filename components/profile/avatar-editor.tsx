"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
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

  const photo = (
    <span className="relative block h-[86px] w-[86px] shrink-0">
      <span className="block h-full w-full overflow-hidden rounded-full bg-zinc-800">
        {url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={url} alt="" className="h-full w-full object-cover" />
        ) : (
          <span className="flex h-full w-full items-center justify-center text-3xl font-semibold text-white">
            {username.slice(0, 1).toUpperCase()}
          </span>
        )}
      </span>
      {canEdit && (
        <span className="absolute right-0 bottom-0 flex h-6 w-6 items-center justify-center rounded-full border-2 border-black bg-sky-500 md:border-white md:dark:border-black">
          <Plus className="h-3.5 w-3.5 text-white" />
        </span>
      )}
    </span>
  );

  if (!canEdit) return photo;

  return (
    <label className={`cursor-pointer ${busy ? "opacity-60" : ""}`}>
      {photo}
      <span className="sr-only">{busy ? "Uploading profile photo" : "Change profile photo"}</span>
      <input
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        disabled={busy}
        onChange={(event) => void onFile(event.target.files?.[0])}
      />
    </label>
  );
}
