"use server";

import { revalidatePath } from "next/cache";

import type { DebtFormData } from "@/lib/debts/supabase";
import { getUserSafely } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/server";

type ActionResult = { error?: string };

async function authenticatedClient() {
  const supabase = await createClient();
  const { user } = await getUserSafely(supabase);
  return { supabase, user };
}

function payload(input: DebtFormData) {
  return {
    category_id: input.categoryId || null,
    description: input.notes.trim() || null,
    interest_rate: input.interestRate,
    lender: input.lender.trim(),
    metadata: {
      category_id: input.categoryId || null,
      notes: input.notes.trim(),
      payment_account_id: input.paymentAccountId || null,
      start_date: input.startDate,
      type: input.type,
    },
    monthly_payment: input.monthlyPayment,
    name: input.name.trim(),
    next_payment_date: input.nextPaymentDate || null,
    payment_account_id: input.paymentAccountId || null,
    repaid_amount: input.repaidAmount,
    start_date: input.startDate || null,
    status: input.status.toLowerCase(),
    total_amount: input.totalAmount,
    type: input.type,
  };
}

export async function createDebt(input: DebtFormData): Promise<ActionResult> {
  const { supabase, user } = await authenticatedClient();
  if (!user) return { error: "You must be signed in." };
  const { error } = await supabase.from("debts").insert({ ...payload(input), user_id: user.id });
  if (error) return { error: error.message };
  revalidatePath("/debts");
  return {};
}

export async function updateDebt(debtId: string, input: DebtFormData): Promise<ActionResult> {
  const { supabase, user } = await authenticatedClient();
  if (!user) return { error: "You must be signed in." };
  const { data, error } = await supabase.from("debts").update(payload(input)).eq("id", debtId).eq("user_id", user.id).select("id").maybeSingle();
  if (error) return { error: error.message };
  if (!data) return { error: "Debt not found." };
  revalidatePath("/debts");
  revalidatePath(`/debts/${debtId}/edit`);
  return {};
}

export async function deleteDebt(debtId: string): Promise<ActionResult> {
  const { supabase, user } = await authenticatedClient();
  if (!user) return { error: "You must be signed in." };
  const { data, error } = await supabase.from("debts").update({ deleted_at: new Date().toISOString(), status: "archived" }).eq("id", debtId).eq("user_id", user.id).select("id").maybeSingle();
  if (error) return { error: error.message };
  if (!data) return { error: "Debt not found." };
  revalidatePath("/debts");
  return {};
}
