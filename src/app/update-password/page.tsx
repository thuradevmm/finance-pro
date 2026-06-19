import type { Metadata } from "next";

import { AuthShell } from "@/components/auth/auth-shell";
import { UpdatePasswordForm } from "@/features/auth/update-password-form";

export const metadata: Metadata = {
  title: "Update Password | FinancePro",
};

export default function UpdatePasswordPage() {
  return (
    <AuthShell description="Choose a new password for your FinancePro account." eyebrow="Account recovery" title="Update your password">
      <UpdatePasswordForm />
    </AuthShell>
  );
}
