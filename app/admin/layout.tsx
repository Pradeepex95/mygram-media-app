import { redirect } from "next/navigation";
import { AppShell } from "@/components/layout/app-shell";
import { AuthError, requireAdmin } from "@/lib/auth/session";
import { getEnv } from "@/lib/env";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  let user;
  try {
    user = await requireAdmin();
  } catch (error) {
    if (error instanceof AuthError) {
      redirect(`/login?reason=${error.reason}`);
    }
    redirect("/feed");
  }

  const env = getEnv();

  return (
    <AppShell
      appName={env.NEXT_PUBLIC_APP_NAME}
      username={user.username}
      role={user.role}
      canUpload
    >
      {children}
    </AppShell>
  );
}
