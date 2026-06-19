"use client";

import Link from "next/link";
import { type FormEvent, useState } from "react";

import { AuthField } from "@/components/auth/auth-field";
import { Icon } from "@/components/ui/icon";

export function ForgotPasswordForm() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [submittedEmail, setSubmittedEmail] = useState("");

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
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
    setError("");
    setSubmittedEmail(normalizedEmail);
  }

  if (submittedEmail) {
    return (
      <div>
        <span className="grid size-12 place-items-center rounded-full bg-[#dcfce7] text-[#166534]">
          <Icon className="size-6" name="mail" />
        </span>
        <h2 className="mt-5 text-xl font-semibold text-[#0b1c30]">Check your inbox</h2>
        <p className="mt-2 text-sm leading-6 text-[#5f6168]">A mock reset link was sent to <strong className="text-[#0b1c30]">{submittedEmail}</strong>. No actual email was sent.</p>
        <Link className="mt-6 inline-flex h-11 w-full items-center justify-center rounded-md bg-[#0b1c30] px-5 text-sm font-semibold text-white transition hover:bg-[#1f2937]" href="/login">Return to Sign In</Link>
        <button className="mt-3 inline-flex h-10 w-full items-center justify-center rounded-md text-sm font-semibold text-[#0058be] transition hover:bg-[#eff4ff]" onClick={() => setSubmittedEmail("")} type="button">Use another email</button>
      </div>
    );
  }

  return (
    <form className="space-y-5" noValidate onSubmit={handleSubmit}>
      <AuthField autoComplete="email" error={error} icon="mail" label="Email Address" name="email" onChange={setEmail} placeholder="you@example.com" type="email" value={email} />
      <button className="inline-flex h-12 w-full items-center justify-center rounded-md bg-[#0b1c30] px-5 text-sm font-semibold text-white shadow-sm transition hover:bg-[#1f2937] focus:outline-none focus:ring-2 focus:ring-[#2170e4] focus:ring-offset-2" type="submit">Send Reset Link</button>
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
