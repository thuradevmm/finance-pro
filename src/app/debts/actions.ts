"use server";

import { revalidatePath } from "next/cache";

import type { DebtFormData } from "@/lib/debts/supabase";
import { getUserSafely } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/server";

type ActionResult = { error?: string };
type DebtPayload = Record<string, unknown>;

async function authenticatedClient() {
  const supabase = await createClient();
  const { user } = await getUserSafely(supabase);
  return { supabase, user };
}

function payload(input: DebtFormData): DebtPayload {
  return {
    category_id: input.categoryId || null,
    description: input.notes.trim() || null,
    lender: input.lender.trim(),
    metadata: {
      category_id: input.categoryId || null,
      duration_months: input.durationMonths,
      interest_rate: input.interestRate,
      interest_rate_period: input.interestRatePeriod.toLowerCase(),
      lender: input.lender.trim(),
      monthly_payment: input.monthlyPayment,
      next_payment_date: input.nextPaymentDate || null,
      notes: input.notes.trim(),
      payment_account_id: input.paymentAccountId || null,
      payoff_date: input.payoffDate || null,
      repaid_amount: input.repaidAmount,
      start_date: input.startDate,
      status: input.status.toLowerCase(),
      total_amount: input.totalAmount,
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
  };
}

function missingSchemaColumn(message: string) {
  return message.match(/Could not find the '([^']+)' column/)?.[1] ?? null;
}

export async function createDebt(input: DebtFormData): Promise<ActionResult> {
  const { supabase, user } = await authenticatedClient();
  if (!user) return { error: "You must be signed in." };
  const debtPayload = payload(input);

  for (let attempt = 0; attempt < 8; attempt += 1) {
    const { error } = await supabase.from("debts").insert({ ...debtPayload, user_id: user.id });
    if (!error) {
      revalidatePath("/debts");
      return {};
    }

    const column = missingSchemaColumn(error.message);
    if (!column || column === "user_id" || !(column in debtPayload)) return { error: error.message };
    delete debtPayload[column];
  }

  return { error: "Debt could not be saved because the database schema is not aligned with the debt form." };
}

async function updateDebtPayload(
  supabase: Awaited<ReturnType<typeof createClient>>,
  debtId: string,
  userId: string,
  debtPayload: DebtPayload,
) {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const result = await supabase.from("debts").update(debtPayload).eq("id", debtId).eq("user_id", userId).select("id").maybeSingle();
    if (!result.error) return result;

    const column = missingSchemaColumn(result.error.message);
    if (!column || !(column in debtPayload)) return result;
    delete debtPayload[column];
  }

  return { data: null, error: { message: "Debt could not be updated because the database schema is not aligned with the debt form." } };
}

async function archiveDebtPayload(
  supabase: Awaited<ReturnType<typeof createClient>>,
  debtId: string,
  userId: string,
) {
  const archivePayload: DebtPayload = { deleted_at: new Date().toISOString(), status: "archived" };
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const result = await supabase.from("debts").update(archivePayload).eq("id", debtId).eq("user_id", userId).select("id").maybeSingle();
    if (!result.error) return result;

    const column = missingSchemaColumn(result.error.message);
    if (!column || !(column in archivePayload)) return result;
    delete archivePayload[column];
  }

  return { data: null, error: { message: "Debt could not be deleted because the database schema is not aligned with the debt form." } };
}

export async function updateDebt(debtId: string, input: DebtFormData): Promise<ActionResult> {
  const { supabase, user } = await authenticatedClient();
  if (!user) return { error: "You must be signed in." };
  const { data, error } = await updateDebtPayload(supabase, debtId, user.id, payload(input));
  if (error) return { error: error.message };
  if (!data) return { error: "Debt not found." };
  revalidatePath("/debts");
  revalidatePath(`/debts/${debtId}/edit`);
  return {};
}

export async function deleteDebt(debtId: string): Promise<ActionResult> {
  const { supabase, user } = await authenticatedClient();
  if (!user) return { error: "You must be signed in." };
  const { data, error } = await archiveDebtPayload(supabase, debtId, user.id);
  if (error) return { error: error.message };
  if (!data) return { error: "Debt not found." };
  revalidatePath("/debts");
  return {};
}
