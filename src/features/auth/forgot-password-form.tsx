"use client";

import Link from "next/link";
import { type FormEvent, useState } from "react";

import { recoverPasswordWithoutEmail } from "@/app/forgot-password/actions";
import { AuthField } from "@/components/auth/auth-field";
import { Icon } from "@/components/ui/icon";
import { LoadingButton } from "@/components/ui/loading-state";
import { emailServicesEnabled } from "@/lib/auth/email-services";
import { createClient } from "@/lib/supabase/client";

export function ForgotPasswordForm() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [submittedEmail, setSubmittedEmail] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [recoveryCode, setRecoveryCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalizedEmail = email.trim();
    if (!normalizedEmail) {
      setError("Email address is required.");
      return;
    }
    if (!/^\S+@\S+\.\S+$/.test(normalizedEmail)) {
      setError("Enter a valid email address.");
      return;
    }
    if (!emailServicesEnabled) {
      if (!recoveryCode.trim()) {
        setError("Recovery code is required.");
        return;
      }
      if (newPassword.length < 8 || !/[a-z]/.test(newPassword) || !/[A-Z]/.test(newPassword) || !/\d/.test(newPassword)) {
        setError("Use at least 8 characters with uppercase, lowercase, and a number.");
        return;
      }
      if (newPassword !== confirmPassword) {
        setError("Passwords do not match.");
        return;
      }

      setError("");
      setIsSubmitting(true);
      const result = await recoverPasswordWithoutEmail({ email: normalizedEmail, newPassword, recoveryCode });
      setIsSubmitting(false);
      if (result.error) {
        setError(result.error);
        return;
      }
      setSubmittedEmail(normalizedEmail);
      return;
    }

    setError("");
    setIsSubmitting(true);
    let resetError;
    try {
      const supabase = createClient();
      ({ error: resetError } = await supabase.auth.resetPasswordForEmail(normalizedEmail, {
        redirectTo: `${window.location.origin}/auth/callback?next=/update-password`,
      }));
    } catch {
      resetError = { message: "Unable to connect to Supabase. Check the environment variables and network connection." };
    }
    setIsSubmitting(false);
    if (resetError) {
      setError(resetError.message);
      return;
    }
    setSubmittedEmail(normalizedEmail);
  }

  if (submittedEmail) {
    return (
      <div>
        <span className="grid size-12 place-items-center rounded-full bg-[#dcfce7] text-[#166534]">
          <Icon className="size-6" name="mail" />
        </span>
        <h2 className="mt-5 text-xl font-semibold text-[#0b1c30]">{emailServicesEnabled ? "Check your inbox" : "Password updated"}</h2>
        <p className="mt-2 text-sm leading-6 text-[#5f6168]">
          {emailServicesEnabled ? <>A password reset link was sent to <strong className="text-[#0b1c30]">{submittedEmail}</strong>.</> : <>The password for <strong className="text-[#0b1c30]">{submittedEmail}</strong> was updated successfully.</>}
        </p>
        <Link className="mt-6 inline-flex h-11 w-full items-center justify-center rounded-md bg-[#0b1c30] px-5 text-sm font-semibold text-white transition hover:bg-[#1f2937]" href="/login">Return to Sign In</Link>
        <button className="mt-3 inline-flex h-10 w-full items-center justify-center rounded-md text-sm font-semibold text-[#0058be] transition hover:bg-[#eff4ff]" onClick={() => setSubmittedEmail("")} type="button">Use another email</button>
      </div>
    );
  }

  return (
    <form className="space-y-5" noValidate onSubmit={handleSubmit}>
      <AuthField autoComplete="email" error={error} icon="mail" label="Email Address" name="email" onChange={setEmail} placeholder="you@example.com" type="email" value={email} />
      {!emailServicesEnabled ? (
        <>
          <AuthField autoComplete="off" icon="lock" label="Recovery Code" name="recoveryCode" onChange={setRecoveryCode} placeholder="Paste the code saved during registration" value={recoveryCode} />
          <AuthField autoComplete="new-password" icon="lock" label="New Password" name="newPassword" onChange={setNewPassword} placeholder="Enter a new password" type="password" value={newPassword} />
          <AuthField autoComplete="new-password" icon="lock" label="Confirm New Password" name="confirmPassword" onChange={setConfirmPassword} placeholder="Enter the password again" type="password" value={confirmPassword} />
          <div className="rounded-md border border-[#fde68a] bg-[#fffbeb] px-4 py-3 text-sm font-medium text-[#92400e]" role="status">Use the private recovery code shown when this account was created.</div>
        </>
      ) : null}
      <LoadingButton className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-md bg-[#0b1c30] px-5 text-sm font-semibold text-white shadow-sm transition hover:bg-[#1f2937] focus:outline-none focus:ring-2 focus:ring-[#2170e4] focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60" isLoading={isSubmitting} loadingLabel="Working…" type="submit">{emailServicesEnabled ? "Send Reset Link" : "Reset Password"}</LoadingButton>
      <Link className="inline-flex h-10 w-full items-center justify-center rounded-md text-sm font-semibold text-[#0058be] transition hover:bg-[#eff4ff]" href="/login">
        <Icon className="mr-2 size-4" name="chevronLeft" />
        Back to Sign In
      </Link>
      <p className="text-center text-sm text-[#5f6168]">
        Need an account?{" "}
        <Link className="font-semibold text-[#0058be] hover:underline" href="/register">Register now</Link>
      </p>
    </form>
  );
}
