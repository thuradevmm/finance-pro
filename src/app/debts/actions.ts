"use server";

import { revalidatePath } from "next/cache";

import type { DebtFormData } from "@/lib/debts/supabase";
import { getUserSafely } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/server";

type ActionResult = { error?: string };
type DebtPayload = Record<string, unknown>;
type DebtRow = {
  metadata: unknown;
  payment_account_id: string | null;
  status: string | null;
  type: string | null;
};

type LinkedTransactionRow = {
  account_id: string | null;
  amount: number | string | null;
  metadata: unknown;
  status: string | null;
  transfer_account_id: string | null;
  type: string | null;
};

type DebtLedgerTotals = {
  charges: number;
  repayments: number;
};

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

function metadataRecord(metadata: unknown) {
  return metadata && typeof metadata === "object" && !Array.isArray(metadata)
    ? metadata as Record<string, unknown>
    : {};
}

function normalizeDebtType(value: unknown) {
  return String(value ?? "").trim().toLowerCase().replace(/[\s_-]+/g, "");
}

function isCreditCardDebtRow(row: DebtRow) {
  const metadata = metadataRecord(row.metadata);
  return typeof metadata.credit_card_account_id === "string"
    || typeof metadata.auto_credit_card_account_id === "string"
    || normalizeDebtType(row.type ?? metadata.type) === "creditcard";
}

function numericValue(value: unknown, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function roundCurrencyValue(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function transferDirection(metadata: Record<string, unknown>) {
  const direction = typeof metadata.transfer_direction === "string" ? metadata.transfer_direction.toLowerCase() : "";
  if (direction === "debit" || direction === "credit") return direction;
  const legacyRole = typeof metadata.same_account_transfer_role === "string" ? metadata.same_account_transfer_role.toLowerCase() : "";
  if (legacyRole === "out") return "debit";
  if (legacyRole === "in") return "credit";
  return "";
}

function transactionStatusAffectsDebt(value: unknown) {
  return String(value ?? "cleared").toLowerCase() !== "scheduled";
}

function creditCardAccountIdFromDebt(existingDebt: DebtRow) {
  const metadata = metadataRecord(existingDebt.metadata);
  if (typeof metadata.credit_card_account_id === "string") return metadata.credit_card_account_id;
  if (typeof metadata.auto_credit_card_account_id === "string") return metadata.auto_credit_card_account_id;
  return existingDebt.payment_account_id ?? "";
}

function creditCardDebtImpact(transaction: LinkedTransactionRow, creditCardAccountId: string) {
  const type = String(transaction.type ?? "").toLowerCase();
  const direction = transferDirection(metadataRecord(transaction.metadata));
  const usesCreditCardAccount = transaction.account_id === creditCardAccountId;
  const paysCreditCardAccount = transaction.transfer_account_id === creditCardAccountId;

  if (usesCreditCardAccount && paysCreditCardAccount) return "";
  if (type === "transfer") {
    if (direction) {
      if (!usesCreditCardAccount) return "";
      return direction === "debit" ? "charge" : "repayment";
    }
    if (usesCreditCardAccount) return "charge";
    if (paysCreditCardAccount) return "repayment";
    return "";
  }
  if (usesCreditCardAccount && type === "expense") return "charge";
  if (usesCreditCardAccount && type === "income") return "repayment";
  return "";
}

async function getCreditCardDebtLedgerTotals(
  supabase: Awaited<ReturnType<typeof createClient>>,
  debtId: string,
  userId: string,
  existingDebt: DebtRow,
): Promise<DebtLedgerTotals> {
  const creditCardAccountId = creditCardAccountIdFromDebt(existingDebt);
  if (!creditCardAccountId) return { charges: 0, repayments: 0 };

  const { data, error } = await supabase
    .from("transactions")
    .select("account_id,transfer_account_id,type,amount,metadata,status")
    .eq("user_id", userId)
    .eq("related_entity_type", "debt")
    .eq("related_entity_id", debtId)
    .is("deleted_at", null);

  if (error) throw new Error(error.message);

  let charges = 0;
  let repayments = 0;
  for (const transaction of data as LinkedTransactionRow[]) {
    if (!transactionStatusAffectsDebt(transaction.status)) continue;
    const impact = creditCardDebtImpact(transaction, creditCardAccountId);
    const amount = Math.abs(numericValue(transaction.amount));
    if (impact === "charge") charges = roundCurrencyValue(charges + amount);
    if (impact === "repayment") repayments = roundCurrencyValue(repayments + amount);
  }

  return { charges, repayments };
}

async function fetchExistingDebtForUpdate(
  supabase: Awaited<ReturnType<typeof createClient>>,
  debtId: string,
  userId: string,
) {
  const { data, error } = await supabase
    .from("debts")
    .select("metadata,payment_account_id,status,type")
    .eq("id", debtId)
    .eq("user_id", userId)
    .is("deleted_at", null)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return data as DebtRow | null;
}

function preserveCreditCardDebtMetadata(debtPayload: DebtPayload, existingDebt: DebtRow | null, ledgerTotals: DebtLedgerTotals) {
  if (!existingDebt) return debtPayload;

  const existingMetadata = metadataRecord(existingDebt.metadata);
  if (!isCreditCardDebtRow(existingDebt)) return debtPayload;

  const nextMetadata = metadataRecord(debtPayload.metadata);
  const creditCardAccountId = typeof existingMetadata.credit_card_account_id === "string"
    ? existingMetadata.credit_card_account_id
    : typeof existingMetadata.auto_credit_card_account_id === "string"
      ? existingMetadata.auto_credit_card_account_id
      : existingDebt.payment_account_id ?? null;

  return {
    ...debtPayload,
    metadata: {
      ...nextMetadata,
      auto_credit_card_account_id: creditCardAccountId,
      auto_credit_card_terms: false,
      credit_card_account_id: creditCardAccountId,
      credit_limit: existingMetadata.credit_limit ?? null,
      credit_minimum_payment: existingMetadata.credit_minimum_payment ?? null,
      credit_payment_due_day: existingMetadata.credit_payment_due_day ?? null,
      credit_statement_day: existingMetadata.credit_statement_day ?? null,
      manual_credit_card_terms: true,
      requires_full_payment: false,
      repaid_amount: Math.max(numericValue(debtPayload.repaid_amount) - ledgerTotals.repayments, 0),
      total_amount: Math.max(numericValue(debtPayload.total_amount) - ledgerTotals.charges, 0),
    },
    payment_account_id: creditCardAccountId ?? debtPayload.payment_account_id,
    repaid_amount: Math.max(numericValue(debtPayload.repaid_amount) - ledgerTotals.repayments, 0),
    total_amount: Math.max(numericValue(debtPayload.total_amount) - ledgerTotals.charges, 0),
    type: "Credit Card",
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
  let existingDebt: DebtRow | null;
  try {
    existingDebt = await fetchExistingDebtForUpdate(supabase, debtId, user.id);
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Unable to load debt." };
  }
  let ledgerTotals = { charges: 0, repayments: 0 };
  if (existingDebt && isCreditCardDebtRow(existingDebt)) {
    try {
      ledgerTotals = await getCreditCardDebtLedgerTotals(supabase, debtId, user.id, existingDebt);
    } catch (error) {
      return { error: error instanceof Error ? error.message : "Unable to load linked debt transactions." };
    }
  }
  const { data, error } = await updateDebtPayload(supabase, debtId, user.id, preserveCreditCardDebtMetadata(payload(input), existingDebt, ledgerTotals));
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
