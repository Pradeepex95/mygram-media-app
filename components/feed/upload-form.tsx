"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { UploadCloud } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";

const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];
const VIDEO_TYPES = ["video/mp4", "video/quicktime", "video/webm"];

function fileKind(file: File) {
  if (IMAGE_TYPES.includes(file.type)) return "IMAGE" as const;
  if (VIDEO_TYPES.includes(file.type)) return "VIDEO" as const;
  return null;
}

async function generateVideoThumbnail(file: File): Promise<Blob | null> {
  const url = URL.createObjectURL(file);
  try {
    return await new Promise((resolve) => {
      const video = document.createElement("video");
      let settled = false;
      let timer = 0;
      const finish = (blob: Blob | null) => {
        if (settled) return;
        settled = true;
        window.clearTimeout(timer);
        URL.revokeObjectURL(url);
        resolve(blob);
      };
      timer = window.setTimeout(() => finish(null), 8000);
      video.preload = "auto";
      video.muted = true;
      video.playsInline = true;
      video.src = url;
      video.onerror = () => finish(null);
      video.onloadeddata = () => {
        const canvas = document.createElement("canvas");
        canvas.width = video.videoWidth || 640;
        canvas.height = video.videoHeight || 640;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          finish(null);
          return;
        }
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        canvas.toBlob((blob) => finish(blob), "image/jpeg", 0.8);
      };
    });
  } catch {
    URL.revokeObjectURL(url);
    return null;
  }
}

export function UploadForm({
  maxImageBytes,
  maxVideoBytes,
}: {
  maxImageBytes: number;
  maxVideoBytes: number;
}) {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [caption, setCaption] = useState("");
  const [progress, setProgress] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  const onFile = useCallback(
    (next: File | null) => {
      if (!next) return;
      const kind = fileKind(next);
      if (!kind) {
        toast.error("Unsupported file type");
        return;
      }
      const max = kind === "IMAGE" ? maxImageBytes : maxVideoBytes;
      if (next.size > max) {
        toast.error(
          `File too large. Max ${Math.floor(max / (1024 * 1024))} MB for ${kind.toLowerCase()}s`,
        );
        return;
      }
      setFile(next);
      setPreview((current) => {
        if (current) URL.revokeObjectURL(current);
        return URL.createObjectURL(next);
      });
    },
    [maxImageBytes, maxVideoBytes],
  );

  async function uploadWithProgress(url: string, blob: Blob, contentType: string) {
    await new Promise<void>((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open("PUT", url);
      xhr.setRequestHeader("Content-Type", contentType);
      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable) {
          setProgress(Math.round((event.loaded / event.total) * 100));
        }
      };
      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          resolve();
          return;
        }
        let message = "Upload failed";
        try {
          const parsed = JSON.parse(xhr.responseText) as { error?: string };
          if (parsed.error) message = parsed.error;
        } catch {
          if (xhr.responseText) message = xhr.responseText.slice(0, 180);
        }
        reject(new Error(message));
      };
      xhr.onerror = () => reject(new Error("Upload failed"));
      xhr.send(blob);
    });
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!file) {
      toast.error("Choose a file first");
      return;
    }
    setUploading(true);
    setProgress(0);
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
      if (!presignRes.ok) {
        const err = await presignRes.json().catch(() => ({}));
        throw new Error(err.error || "Could not start upload");
      }
      const presign = await presignRes.json();
      await uploadWithProgress(presign.uploadUrl, file, file.type);

      let thumbnailKey: string | null = null;
      if (fileKind(file) === "VIDEO") {
        const thumb = await generateVideoThumbnail(file);
        if (thumb) {
          const thumbPresignRes = await fetch("/api/upload/presign", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              mimeType: "image/jpeg",
              sizeBytes: thumb.size,
              kind: "thumb",
            }),
          });
          if (thumbPresignRes.ok) {
            const thumbPresign = await thumbPresignRes.json();
            await uploadWithProgress(
              thumbPresign.uploadUrl,
              thumb,
              "image/jpeg",
            );
            thumbnailKey = thumbPresign.key;
          }
        }
      }

      const completeRes = await fetch("/api/upload/complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          caption,
          media: [
            {
              storageKey: presign.key,
              thumbnailKey,
              mimeType: file.type,
              sizeBytes: file.size,
            },
          ],
        }),
      });
      if (!completeRes.ok) {
        const err = await completeRes.json().catch(() => ({}));
        throw new Error(err.error || "Could not create post");
      }
      const data = await completeRes.json();
      toast.success("Uploaded");
      router.push(`/p/${data.post.id}`);
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>New post</CardTitle>
      </CardHeader>
      <CardContent>
        <form className="space-y-4" onSubmit={onSubmit}>
          <div
            className={`flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed px-4 py-10 text-center transition-colors ${
              dragOver
                ? "border-pink-500 bg-pink-50 dark:bg-pink-950/20"
                : "border-zinc-300 dark:border-zinc-700"
            }`}
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragOver(false);
              onFile(e.dataTransfer.files?.[0] || null);
            }}
            onClick={() => document.getElementById("file-input")?.click()}
          >
            <UploadCloud className="mb-2 h-8 w-8 text-pink-500" />
            <p className="text-sm font-medium">Drag and drop or click to choose</p>
            <p className="mt-1 text-xs text-zinc-500">
              Images up to {Math.floor(maxImageBytes / (1024 * 1024))} MB · Videos up to{" "}
              {Math.floor(maxVideoBytes / (1024 * 1024))} MB
            </p>
            <input
              id="file-input"
              type="file"
              accept={[...IMAGE_TYPES, ...VIDEO_TYPES].join(",")}
              className="hidden"
              onChange={(e) => onFile(e.target.files?.[0] || null)}
            />
          </div>

          {preview && file && (
            <div className="overflow-hidden rounded-xl border dark:border-zinc-800">
              {fileKind(file) === "VIDEO" ? (
                <video src={preview} className="max-h-96 w-full object-contain" controls muted />
              ) : (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={preview} alt="Preview" className="max-h-96 w-full object-contain" />
              )}
            </div>
          )}

          <Textarea
            placeholder="Write a caption..."
            value={caption}
            onChange={(e) => setCaption(e.target.value)}
            maxLength={2200}
          />

          {uploading && (
            <div className="space-y-1">
              <div className="h-2 overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800">
                <div
                  className="h-full bg-gradient-to-r from-pink-500 to-orange-400 transition-all"
                  style={{ width: `${progress}%` }}
                />
              </div>
              <p className="text-xs text-zinc-500">{progress}%</p>
            </div>
          )}

          <Button type="submit" disabled={!file || uploading} className="w-full">
            {uploading ? "Uploading..." : "Share"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
