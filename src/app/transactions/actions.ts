"use server";

import { revalidatePath } from "next/cache";

import type { TransactionFormData } from "@/lib/transactions/supabase";
import { getUserSafely } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/server";

type ActionResult = { error?: string };

async function authenticatedClient() {
  const supabase = await createClient();
  const { user } = await getUserSafely(supabase);
  return { supabase, user };
}

function payload(input: TransactionFormData) {
  return {
    account_id: input.accountId || null,
    amount: input.amount,
    category_id: input.type === "Transfer" ? null : input.categoryId || null,
    description: input.note.trim() || null,
    note: input.note.trim() || null,
    payment_method: input.paymentMethod,
    related_entity_id: input.relatedEntityType === "none" ? null : input.relatedEntityId || null,
    related_entity_type: input.relatedEntityType === "none" ? null : input.relatedEntityType,
    status: input.status.toLowerCase(),
    title: input.title.trim() || `${input.type} transaction`,
    transaction_date: input.date,
    transfer_account_id: input.type === "Transfer" ? input.transferAccountId || null : null,
    type: input.type.toLowerCase(),
  };
}

export async function createTransaction(input: TransactionFormData): Promise<ActionResult> {
  const { supabase, user } = await authenticatedClient();
  if (!user) return { error: "You must be signed in." };
  const { error } = await supabase.from("transactions").insert({ ...payload(input), user_id: user.id });
  if (error) return { error: error.message };
  revalidatePath("/transactions");
  revalidatePath("/accounts");
  revalidatePath("/assets");
  revalidatePath("/budgets");
  revalidatePath("/dashboard");
  revalidatePath("/debts");
  revalidatePath("/savings-goals");
  revalidatePath("/subscriptions");
  return {};
}

export async function updateTransaction(transactionId: string, input: TransactionFormData): Promise<ActionResult> {
  const { supabase, user } = await authenticatedClient();
  if (!user) return { error: "You must be signed in." };
  const { data, error } = await supabase.from("transactions").update(payload(input)).eq("id", transactionId).eq("user_id", user.id).select("id").maybeSingle();
  if (error) return { error: error.message };
  if (!data) return { error: "Transaction not found." };
  revalidatePath("/transactions");
  revalidatePath(`/transactions/${transactionId}/edit`);
  revalidatePath("/accounts");
  revalidatePath("/assets");
  revalidatePath("/budgets");
  revalidatePath("/dashboard");
  revalidatePath("/debts");
  revalidatePath("/savings-goals");
  revalidatePath("/subscriptions");
  return {};
}

export async function deleteTransaction(transactionId: string): Promise<ActionResult> {
  const { supabase, user } = await authenticatedClient();
  if (!user) return { error: "You must be signed in." };
  const { data, error } = await supabase.from("transactions").update({ deleted_at: new Date().toISOString() }).eq("id", transactionId).eq("user_id", user.id).select("id").maybeSingle();
  if (error) return { error: error.message };
  if (!data) return { error: "Transaction not found." };
  revalidatePath("/transactions");
  revalidatePath("/accounts");
  revalidatePath("/assets");
  revalidatePath("/budgets");
  revalidatePath("/dashboard");
  revalidatePath("/debts");
  revalidatePath("/savings-goals");
  revalidatePath("/subscriptions");
  return {};
}
