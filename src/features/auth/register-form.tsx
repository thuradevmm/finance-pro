"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";

import { AuthField } from "@/components/auth/auth-field";
import { saveMockSession, saveRegisteredMockAccount } from "@/lib/auth/mock-auth";

type RegisterErrors = {
  confirmPassword?: string;
  email?: string;
  fullName?: string;
  password?: string;
  terms?: string;
};

export function RegisterForm() {
  const router = useRouter();
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [errors, setErrors] = useState<RegisterErrors>({});

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
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

    const account = { email: normalizedEmail, fullName: fullName.trim(), password };
    saveRegisteredMockAccount(account);
    saveMockSession(account);
    router.push("/dashboard");
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
          <span>I agree to the mock account terms and understand that this data stays in this browser.</span>
        </label>
        {errors.terms ? <p className="mt-1.5 text-xs font-medium text-[#ba1a1a]">{errors.terms}</p> : null}
      </div>

      <button className="inline-flex h-12 w-full items-center justify-center rounded-md bg-[#0b1c30] px-5 text-sm font-semibold text-white shadow-sm transition hover:bg-[#1f2937] focus:outline-none focus:ring-2 focus:ring-[#2170e4] focus:ring-offset-2" type="submit">
        Create Account
      </button>

      <p className="text-center text-sm text-[#5f6168]">
        Already have an account?{" "}
        <Link className="font-semibold text-[#0058be] hover:underline" href="/login">Sign in</Link>
      </p>
    </form>
  );
}
