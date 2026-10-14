"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Clapperboard,
  Home,
  LogOut,
  Moon,
  PlusSquare,
  Shield,
  Sun,
  User,
} from "lucide-react";
import { useTheme } from "next-themes";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

type AppShellProps = {
  appName: string;
  username: string;
  role: "ADMIN" | "SUBSCRIBER";
  canUpload: boolean;
  children: React.ReactNode;
};

export function AppShell({
  appName,
  username,
  role,
  canUpload,
  children,
}: AppShellProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { theme, setTheme } = useTheme();

  const nav = [
    { href: "/feed", label: "Home", icon: Home },
    ...(canUpload
      ? [{ href: "/upload", label: "Upload", icon: PlusSquare }]
      : []),
    { href: `/profile/${username}`, label: "Profile", icon: User },
    ...(role === "ADMIN"
      ? [{ href: "/admin", label: "Admin", icon: Shield }]
      : []),
  ];

  async function logout() {
    const res = await fetch("/api/auth/logout", { method: "POST" });
    if (!res.ok) {
      toast.error("Logout failed");
      return;
    }
    router.replace("/login");
    router.refresh();
  }

  return (
    <div className="min-h-screen bg-zinc-50 text-zinc-900 dark:bg-black dark:text-zinc-50">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950 md:flex">
        <Link href="/feed" className="mb-8 flex items-center gap-2 px-2">
          <Clapperboard className="h-7 w-7 text-pink-500" />
          <span className="bg-gradient-to-r from-pink-500 to-orange-400 bg-clip-text text-xl font-bold text-transparent">
            {appName}
          </span>
        </Link>
        <nav className="flex flex-1 flex-col gap-1">
          {nav.map((item) => {
            const Icon = item.icon;
            const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                  active
                    ? "bg-zinc-100 dark:bg-zinc-900"
                    : "hover:bg-zinc-100 dark:hover:bg-zinc-900",
                )}
              >
                <Icon className="h-5 w-5" />
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="space-y-2 border-t border-zinc-200 pt-4 dark:border-zinc-800">
          <Button
            variant="ghost"
            className="w-full justify-start"
            onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
          >
            {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            Toggle theme
          </Button>
          <Button variant="ghost" className="w-full justify-start" onClick={logout}>
            <LogOut className="h-4 w-4" />
            Log out
          </Button>
        </div>
      </aside>

      <main className="mx-auto min-h-screen max-w-2xl px-3 pb-24 pt-4 md:ml-64 md:max-w-3xl md:pb-8 md:pt-8">
        {children}
      </main>

      <nav className="fixed inset-x-0 bottom-0 z-30 flex items-center justify-around border-t border-zinc-200 bg-white/95 px-2 py-2 backdrop-blur dark:border-zinc-800 dark:bg-zinc-950/95 md:hidden">
        {nav.map((item) => {
          const Icon = item.icon;
          const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex flex-col items-center gap-1 rounded-lg px-3 py-1 text-[11px]",
                active ? "text-pink-500" : "text-zinc-500",
              )}
            >
              <Icon className="h-5 w-5" />
              {item.label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
