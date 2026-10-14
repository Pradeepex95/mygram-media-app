import { Suspense } from "react";
import { LoginForm } from "@/components/auth/login-form";

export default function LoginPage() {
  const appName = process.env.NEXT_PUBLIC_APP_NAME || "MyGram";
  return (
    <Suspense fallback={<div className="min-h-screen" />}>
      <LoginForm appName={appName} />
    </Suspense>
  );
}
