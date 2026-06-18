import type { Metadata } from "next";

import { AuthShell } from "@/components/auth/auth-shell";
import { ForgotPasswordForm } from "@/features/auth/forgot-password-form";

export const metadata: Metadata = {
  title: "Forgot Password | FinancePro",
};

export default function ForgotPasswordPage() {
  return (
    <AuthShell description="Enter the email associated with your account and we will prepare a mock recovery link." eyebrow="Account recovery" title="Forgot your password?">
      <ForgotPasswordForm />
    </AuthShell>
  );
}
