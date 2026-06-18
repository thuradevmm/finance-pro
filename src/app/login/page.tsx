import type { Metadata } from "next";

import { AuthShell } from "@/components/auth/auth-shell";
import { LoginForm } from "@/features/auth/login-form";

export const metadata: Metadata = {
  title: "Sign In | FinancePro",
};

export default function LoginPage() {
  return (
    <AuthShell description="Enter your details to access your personal finance workspace." eyebrow="Welcome back" title="Sign in to FinancePro">
      <LoginForm />
    </AuthShell>
  );
}
