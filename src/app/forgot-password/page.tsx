import type { Metadata } from "next";

import { AuthShell } from "@/components/auth/auth-shell";
import { ForgotPasswordForm } from "@/features/auth/forgot-password-form";
import { emailServicesEnabled } from "@/lib/auth/email-services";

export const metadata: Metadata = {
  title: "Forgot Password | FinancePro",
};

export default function ForgotPasswordPage() {
  return (
    <AuthShell description={emailServicesEnabled ? "Enter the email associated with your account and we will send a recovery link." : "Use the private recovery code saved when your account was created."} eyebrow="Account recovery" title="Forgot your password?">
      <ForgotPasswordForm />
    </AuthShell>
  );
}
