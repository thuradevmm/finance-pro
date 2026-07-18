"use client";

import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";

import { AuthField } from "@/components/auth/auth-field";
import { useInteractionLoading } from "@/components/app/interaction-loading-provider";
import { LoadingButton } from "@/components/ui/loading-state";
import { createClient } from "@/lib/supabase/client";

export function UpdatePasswordForm() {
  const router = useRouter();
  const beginLoading = useInteractionLoading();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (password.length < 8 || !/[a-z]/.test(password) || !/[A-Z]/.test(password) || !/\d/.test(password)) {
      setError("Use at least 8 characters with uppercase, lowercase, and a number.");
      return;
    }
    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setError("");
    setIsSubmitting(true);
    const { error: updateError } = await createClient().auth.updateUser({ password });
    if (updateError) {
      setIsSubmitting(false);
      setError(updateError.message);
      return;
    }

    beginLoading();
    router.replace("/dashboard");
    router.refresh();
  }

  return (
    <form className="space-y-5" noValidate onSubmit={handleSubmit}>
      <AuthField autoComplete="new-password" icon="lock" label="New Password" name="password" onChange={setPassword} placeholder="Enter a new password" type="password" value={password} />
      <AuthField autoComplete="new-password" icon="lock" label="Confirm Password" name="confirmPassword" onChange={setConfirmPassword} placeholder="Enter the password again" type="password" value={confirmPassword} />
      {error ? <div className="break-words rounded-md border border-[#fecaca] bg-[#fff1f0] px-4 py-3 text-sm font-medium text-[#991b1b] [overflow-wrap:anywhere]" role="alert">{error}</div> : null}
      <LoadingButton className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-md bg-[#0b1c30] px-5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60" isLoading={isSubmitting} loadingLabel="Updating…" type="submit">Update Password</LoadingButton>
    </form>
  );
}
