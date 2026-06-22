import type { Metadata } from "next";

import { AuthShell } from "@/components/auth/auth-shell";
import { LoginForm } from "@/features/auth/login-form";

export const metadata: Metadata = {
  title: "Sign In | FinancePro",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string | string[] }>;
}) {
  const error = (await searchParams).error;
  const initialFormError = error === "session_expired"
    ? "Your session expired due to inactivity. Sign in again to continue."
    : error === "auth_unavailable"
      ? "Unable to verify your session because Supabase could not be reached."
      : undefined;

  return (
    <AuthShell description="Enter your details to access your personal finance workspace." eyebrow="Welcome back" title="Sign in to FinancePro">
      <LoginForm initialFormError={initialFormError} />
    </AuthShell>
  );
}
