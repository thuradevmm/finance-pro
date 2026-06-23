"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";

import { registerWithoutEmail } from "@/app/register/actions";
import { AuthField } from "@/components/auth/auth-field";
import { useInteractionLoading } from "@/components/app/interaction-loading-provider";
import { LoadingButton } from "@/components/ui/loading-state";
import { emailServicesEnabled } from "@/lib/auth/email-services";
import { setSessionPersistence } from "@/lib/auth/session-timeout";
import { createClient } from "@/lib/supabase/client";

type RegisterErrors = {
  confirmPassword?: string;
  email?: string;
  fullName?: string;
  password?: string;
  terms?: string;
  form?: string;
};

export function RegisterForm() {
  const router = useRouter();
  const beginLoading = useInteractionLoading();
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [errors, setErrors] = useState<RegisterErrors>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [confirmationSent, setConfirmationSent] = useState(false);
  const [recoveryCode, setRecoveryCode] = useState("");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalizedEmail = email.trim().toLowerCase();
    const nextErrors: RegisterErrors = {};

    if (!fullName.trim()) nextErrors.fullName = "Full name is required.";
    if (!normalizedEmail) nextErrors.email = "Email address is required.";
    else if (!/^\S+@\S+\.\S+$/.test(normalizedEmail)) nextErrors.email = "Enter a valid email address.";
    if (!password) nextErrors.password = "Password is required.";
    else if (password.length < 8 || !/[a-z]/.test(password) || !/[A-Z]/.test(password) || !/\d/.test(password)) {
      nextErrors.password = "Use at least 8 characters with uppercase, lowercase, and a number.";
    }
    if (!confirmPassword) nextErrors.confirmPassword = "Confirm your password.";
    else if (confirmPassword !== password) nextErrors.confirmPassword = "Passwords do not match.";
    if (!acceptedTerms) nextErrors.terms = "Accept the terms to create your account.";

    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    setIsSubmitting(true);
    let supabase;
    try {
      supabase = createClient();
    } catch {
      setIsSubmitting(false);
      setErrors({ form: "Unable to connect to Supabase. Check the environment variables." });
      return;
    }

    if (!emailServicesEnabled) {
      const result = await registerWithoutEmail({ email: normalizedEmail, fullName, password });
      if (result.error || !result.recoveryCode) {
        setIsSubmitting(false);
        setErrors({ form: result.error ?? "Unable to create the account." });
        return;
      }

      const { error: signInError } = await supabase.auth.signInWithPassword({ email: normalizedEmail, password });
      setIsSubmitting(false);
      if (signInError) {
        setErrors({ form: signInError.message });
        return;
      }

      setSessionPersistence(true);
      setRecoveryCode(result.recoveryCode);
      return;
    }

    const { data, error } = await supabase.auth.signUp({
      email: normalizedEmail,
      password,
      options: {
        data: { full_name: fullName.trim() },
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      },
    });
    if (error) {
      setIsSubmitting(false);
      setErrors({ form: error.message });
      return;
    }

    if (!data.session) {
      setIsSubmitting(false);
      setConfirmationSent(true);
      return;
    }

    setSessionPersistence(true);
    beginLoading();
    router.replace("/dashboard");
    router.refresh();
  }

  if (confirmationSent) {
    return <p className="rounded-md border border-[#bfdbfe] bg-[#eff6ff] p-4 text-sm leading-6 text-[#0b1c30]">Check your email and follow the confirmation link to finish creating your account.</p>;
  }

  if (recoveryCode) {
    return (
      <div>
        <h2 className="text-xl font-semibold text-[#0b1c30]">Save your recovery code</h2>
        <p className="mt-2 text-sm leading-6 text-[#5f6168]">Email recovery is temporarily disabled. Store this one-time account recovery code somewhere private.</p>
        <code className="mt-5 block break-all rounded-md border border-[#bfdbfe] bg-[#eff6ff] p-4 text-sm font-semibold text-[#0b1c30]">{recoveryCode}</code>
        <p className="mt-3 text-xs leading-5 text-[#991b1b]">This code will not be shown again. Anyone with this code and your email can reset your password.</p>
        <LoadingButton className="mt-6 inline-flex h-11 w-full items-center justify-center gap-2 rounded-md bg-[#0b1c30] px-5 text-sm font-semibold text-white" isLoading={isSubmitting} loadingLabel="Opening Dashboard…" onClick={() => { setIsSubmitting(true); beginLoading(); router.replace("/dashboard"); router.refresh(); }} type="button">I saved it — Continue</LoadingButton>
      </div>
    );
  }

  return (
    <form className="space-y-5" noValidate onSubmit={handleSubmit}>
      <AuthField autoComplete="name" error={errors.fullName} icon="users" label="Full Name" name="fullName" onChange={setFullName} placeholder="Your full name" value={fullName} />
      <AuthField autoComplete="email" error={errors.email} icon="mail" label="Email Address" name="registerEmail" onChange={setEmail} placeholder="you@example.com" type="email" value={email} />
      <AuthField autoComplete="new-password" error={errors.password} icon="lock" label="Password" name="registerPassword" onChange={setPassword} placeholder="Create a password" type="password" value={password} />
      <AuthField autoComplete="new-password" error={errors.confirmPassword} icon="lock" label="Confirm Password" name="confirmPassword" onChange={setConfirmPassword} placeholder="Enter the password again" type="password" value={confirmPassword} />

      <div>
        <label className="flex cursor-pointer items-start gap-3 text-sm leading-5 text-[#45464d]">
          <input checked={acceptedTerms} className="mt-0.5 size-4 shrink-0 accent-[#2170e4]" onChange={(event) => setAcceptedTerms(event.target.checked)} type="checkbox" />
          <span>I agree to the account terms and privacy policy.</span>
        </label>
        {errors.terms ? <p className="mt-1.5 text-xs font-medium text-[#ba1a1a]">{errors.terms}</p> : null}
      </div>

      {errors.form ? <div className="rounded-md border border-[#fecaca] bg-[#fff1f0] px-4 py-3 text-sm font-medium text-[#991b1b]" role="alert">{errors.form}</div> : null}

      {!emailServicesEnabled ? <div className="rounded-md border border-[#bfdbfe] bg-[#eff6ff] px-4 py-3 text-sm font-medium text-[#1d4ed8]" role="status">Email confirmation is temporarily replaced by a private recovery code.</div> : null}

      <LoadingButton className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-md bg-[#0b1c30] px-5 text-sm font-semibold text-white shadow-sm transition hover:bg-[#1f2937] focus:outline-none focus:ring-2 focus:ring-[#2170e4] focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60" isLoading={isSubmitting} loadingLabel="Creating Account…" type="submit">Create Account</LoadingButton>

      <p className="text-center text-sm text-[#5f6168]">
        Already have an account?{" "}
        <Link className="font-semibold text-[#0058be] hover:underline" href="/login">Sign in</Link>
      </p>
    </form>
  );
}
