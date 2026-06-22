"use server";

import { createHash, timingSafeEqual } from "node:crypto";

import { createAdminClient } from "@/lib/supabase/admin";

function hashesMatch(secret: string, expectedHash: unknown) {
  if (typeof expectedHash !== "string" || !/^[a-f0-9]{64}$/i.test(expectedHash)) return false;
  const actual = Buffer.from(createHash("sha256").update(secret).digest("hex"), "hex");
  const expected = Buffer.from(expectedHash, "hex");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export async function recoverPasswordWithoutEmail(input: {
  email: string;
  newPassword: string;
  recoveryCode: string;
}) {
  const code = input.recoveryCode.trim();
  const separatorIndex = code.indexOf(".");
  const userId = code.slice(0, separatorIndex);
  const secret = code.slice(separatorIndex + 1);
  const genericError = "The email address or recovery code is invalid.";

  if (separatorIndex < 1 || !/^[0-9a-f-]{36}$/i.test(userId) || !secret) {
    return { error: genericError };
  }
  if (input.newPassword.length < 8 || !/[a-z]/.test(input.newPassword) || !/[A-Z]/.test(input.newPassword) || !/\d/.test(input.newPassword)) {
    return { error: "Use at least 8 characters with uppercase, lowercase, and a number." };
  }

  const admin = createAdminClient();
  if (!admin) return { error: "Temporary password recovery is not configured on the server." };

  const { data, error } = await admin.auth.admin.getUserById(userId);
  const recoveryHash = data.user?.app_metadata?.temporary_recovery_hash;
  if (error || !data.user || data.user.email?.toLowerCase() !== input.email.trim().toLowerCase() || !hashesMatch(secret, recoveryHash)) {
    return { error: genericError };
  }

  const { error: updateError } = await admin.auth.admin.updateUserById(userId, {
    password: input.newPassword,
  });
  if (updateError) return { error: "Unable to update the password. Please try again." };

  return {};
}
