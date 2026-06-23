"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";

import { AuthField } from "@/components/auth/auth-field";
import { useInteractionLoading } from "@/components/app/interaction-loading-provider";
import { LoadingButton } from "@/components/ui/loading-state";
import { createClient } from "@/lib/supabase/client";
import { markSessionActivity } from "@/lib/auth/session-timeout";

export function LoginForm({ initialFormError }: { initialFormError?: string }) {
  const router = useRouter();
  const beginLoading = useInteractionLoading();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [rememberMe, setRememberMe] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errors, setErrors] = useState<{ email?: string; password?: string; form?: string }>({ form: initialFormError });

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextErrors: typeof errors = {};

    if (!email.trim()) nextErrors.email = "Email address is required.";
    if (!password) nextErrors.password = "Password is required.";
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    setIsSubmitting(true);
    let error;
    try {
      const supabase = createClient();
      ({ error } = await supabase.auth.signInWithPassword({
        email: email.trim().toLowerCase(),
        password,
      }));
    } catch {
      setIsSubmitting(false);
      setErrors({ form: "Unable to connect to Supabase. Check the environment variables and network connection." });
      return;
    }

    if (error) {
      setIsSubmitting(false);
      setErrors({ form: error.message });
      return;
    }

    const requestedPath = new URLSearchParams(window.location.search).get("next");
    const destination = requestedPath?.startsWith("/") && !requestedPath.startsWith("//")
      ? requestedPath
      : "/dashboard";

    markSessionActivity();
    setIsSubmitting(false);
    beginLoading();
    router.replace(destination);
    router.refresh();
  }

  return (
    <form className="space-y-5" noValidate onSubmit={handleSubmit}>
      <AuthField autoComplete="email" error={errors.email} icon="mail" label="Email Address" name="email" onChange={setEmail} placeholder="you@example.com" type="email" value={email} />
      <div>
        <AuthField autoComplete="current-password" error={errors.password} icon="lock" label="Password" name="password" onChange={setPassword} placeholder="Enter your password" type="password" value={password} />
        <div className="mt-3 flex items-center justify-between gap-4">
          <label className="flex cursor-pointer items-center gap-2 text-sm font-medium text-[#45464d]">
            <input checked={rememberMe} className="size-4 accent-[#2170e4]" onChange={(event) => setRememberMe(event.target.checked)} type="checkbox" />
            Remember me
          </label>
          <Link className="text-sm font-semibold text-[#0058be] hover:underline" href="/forgot-password">Forgot password?</Link>
        </div>
      </div>

      {errors.form ? <div className="rounded-md border border-[#fecaca] bg-[#fff1f0] px-4 py-3 text-sm font-medium text-[#991b1b]" role="alert">{errors.form}</div> : null}

      <LoadingButton className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-md bg-[#0b1c30] px-5 text-sm font-semibold text-white shadow-sm transition hover:bg-[#1f2937] focus:outline-none focus:ring-2 focus:ring-[#2170e4] focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60" isLoading={isSubmitting} loadingLabel="Signing In…" type="submit">Sign In</LoadingButton>
      <p className="text-center text-sm text-[#5f6168]">
        New to FinancePro?{" "}
        <Link className="font-semibold text-[#0058be] hover:underline" href="/register">Create an account</Link>
      </p>
    </form>
  );
}
