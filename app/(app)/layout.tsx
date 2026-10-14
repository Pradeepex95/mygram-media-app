import { redirect } from "next/navigation";
import { AppShell } from "@/components/layout/app-shell";
import { AuthError, requireAuth } from "@/lib/auth/session";
import { getEnv } from "@/lib/env";
import { canUpload } from "@/server/posts/service";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  let user;
  try {
    user = await requireAuth();
  } catch (error) {
    if (error instanceof AuthError) {
      redirect(`/login?reason=${error.reason}`);
    }
    redirect("/login");
  }

  const env = getEnv();
  const uploadAllowed = await canUpload(user);

  return (
    <AppShell
      appName={env.NEXT_PUBLIC_APP_NAME}
      username={user.username}
      role={user.role}
      canUpload={uploadAllowed}
    >
      {children}
    </AppShell>
  );
}
