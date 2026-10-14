import { redirect } from "next/navigation";
import { requireAuth } from "@/lib/auth/session";
import { getEnv } from "@/lib/env";
import { canUpload } from "@/server/posts/service";
import { UploadForm } from "@/components/feed/upload-form";

export default async function UploadPage() {
  const user = await requireAuth();
  if (!(await canUpload(user))) {
    redirect("/feed");
  }
  const env = getEnv();
  return (
    <UploadForm
      maxImageBytes={env.MAX_IMAGE_BYTES}
      maxVideoBytes={env.MAX_VIDEO_BYTES}
    />
  );
}
