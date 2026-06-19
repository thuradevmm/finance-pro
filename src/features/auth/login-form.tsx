"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";

import { AuthField } from "@/components/auth/auth-field";
import { createClient } from "@/lib/supabase/client";

export function LoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [rememberMe, setRememberMe] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errors, setErrors] = useState<{ email?: string; password?: string; form?: string }>({});

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextErrors: typeof errors = {};

    if (!email.trim()) nextErrors.email = "Email address is required.";
    if (!password) nextErrors.password = "Password is required.";
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    setIsSubmitting(true);
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim().toLowerCase(),
      password,
    });
    setIsSubmitting(false);

    if (error) {
      setErrors({ form: error.message });
      return;
    }

    router.replace("/dashboard");
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

      <button className="inline-flex h-12 w-full items-center justify-center rounded-md bg-[#0b1c30] px-5 text-sm font-semibold text-white shadow-sm transition hover:bg-[#1f2937] focus:outline-none focus:ring-2 focus:ring-[#2170e4] focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60" disabled={isSubmitting} type="submit">
        {isSubmitting ? "Signing In…" : "Sign In"}
      </button>
      <p className="text-center text-sm text-[#5f6168]">
        New to FinancePro?{" "}
        <Link className="font-semibold text-[#0058be] hover:underline" href="/register">Create an account</Link>
      </p>
    </form>
  );
}
