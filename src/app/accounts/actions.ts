"use server";

import { revalidatePath } from "next/cache";

import type { AccountFormData } from "@/lib/accounts/supabase";
import { createClient } from "@/lib/supabase/server";
import { getUserSafely } from "@/lib/supabase/auth";

type ActionResult = { error?: string };

const databaseTypes: Record<AccountFormData["type"], string> = {
  "Bank Account": "bank_account",
  "Cash Wallet": "cash",
  "Credit Card": "credit_card",
  "Digital Wallet": "digital_wallet",
  Savings: "savings",
};

async function authenticatedClient() {
  const supabase = await createClient();
  const { user } = await getUserSafely(supabase);
  return { supabase, user };
}

function accountPayload(input: AccountFormData) {
  return {
    currency_code: input.currency,
    description: input.notes.trim() || null,
    initial_balance: input.openingBalance,
    is_active: input.status !== "Archived",
    metadata: {
      account_number: input.accountNumber.trim(),
      available_balance: input.availableBalance,
      category: input.category,
      institution: input.institution.trim(),
      monthly_budget_limit: input.monthlyBudgetLimit,
      status: input.status,
    },
    name: input.name.trim(),
    type: databaseTypes[input.type],
  };
}

export async function createAccount(input: AccountFormData): Promise<ActionResult> {
  const { supabase, user } = await authenticatedClient();
  if (!user) return { error: "You must be signed in." };

  const { error } = await supabase.from("accounts").insert({ ...accountPayload(input), user_id: user.id });
  if (error) return { error: error.message };

  revalidatePath("/accounts");
  return {};
}

export async function updateAccount(accountId: string, input: AccountFormData): Promise<ActionResult> {
  const { supabase, user } = await authenticatedClient();
  if (!user) return { error: "You must be signed in." };

  const { data, error } = await supabase
    .from("accounts")
    .update(accountPayload(input))
    .eq("id", accountId)
    .eq("user_id", user.id)
    .select("id")
    .maybeSingle();
  if (error) return { error: error.message };
  if (!data) return { error: "Account not found." };

  revalidatePath("/accounts");
  revalidatePath(`/accounts/${accountId}/edit`);
  return {};
}

export async function deleteAccount(accountId: string): Promise<ActionResult> {
  const { supabase, user } = await authenticatedClient();
  if (!user) return { error: "You must be signed in." };

  const { data, error } = await supabase
    .from("accounts")
    .update({ deleted_at: new Date().toISOString(), is_active: false })
    .eq("id", accountId)
    .eq("user_id", user.id)
    .select("id")
    .maybeSingle();
  if (error) return { error: error.message };
  if (!data) return { error: "Account not found." };

  revalidatePath("/accounts");
  return {};
}
