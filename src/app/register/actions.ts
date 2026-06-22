"use server";

import { createHash, randomBytes } from "node:crypto";

import { createAdminClient } from "@/lib/supabase/admin";

function hashRecoverySecret(secret: string) {
  return createHash("sha256").update(secret).digest("hex");
}

export async function registerWithoutEmail(input: {
  email: string;
  fullName: string;
  password: string;
}) {
  const email = input.email.trim().toLowerCase();
  const fullName = input.fullName.trim();

  if (!/^\S+@\S+\.\S+$/.test(email) || !fullName) {
    return { error: "Enter a valid name and email address." };
  }
  if (input.password.length < 8 || !/[a-z]/.test(input.password) || !/[A-Z]/.test(input.password) || !/\d/.test(input.password)) {
    return { error: "Use at least 8 characters with uppercase, lowercase, and a number." };
  }

  const admin = createAdminClient();
  if (!admin) {
    return { error: "Temporary registration is not configured on the server." };
  }

  const recoverySecret = randomBytes(18).toString("base64url");
  const { data, error } = await admin.auth.admin.createUser({
    app_metadata: { temporary_recovery_hash: hashRecoverySecret(recoverySecret) },
    email,
    email_confirm: true,
    password: input.password,
    user_metadata: { full_name: fullName },
  });

  if (error || !data.user) {
    return { error: error?.message ?? "Unable to create the account." };
  }

  return { recoveryCode: `${data.user.id}.${recoverySecret}` };
}
