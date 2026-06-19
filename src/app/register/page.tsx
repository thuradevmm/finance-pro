import type { Metadata } from "next";

import { AuthShell } from "@/components/auth/auth-shell";
import { RegisterForm } from "@/features/auth/register-form";

export const metadata: Metadata = {
  title: "Create Account | FinancePro",
};

export default function RegisterPage() {
  return (
    <AuthShell description="Create your local mock account to start organizing your personal finances." eyebrow="Get started" title="Create your FinancePro account">
      <RegisterForm />
    </AuthShell>
  );
}
