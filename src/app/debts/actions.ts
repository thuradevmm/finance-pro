"use server";

import { revalidatePath } from "next/cache";

import { nextCreditCardPaymentDate } from "@/lib/accounts/credit-card-dates";
import { buildEmiSchedule } from "@/lib/debts/emi";
import { calculateDebtStatus } from "@/lib/debts/status";
import type { DebtFormData } from "@/lib/debts/supabase";
import {
  debtTransactionLedgerFor,
  isCreditCardDebtInput,
  standaloneDebtPaymentTransactions,
} from "@/lib/debts/transactions";
import { validateDebtInput } from "@/lib/debts/validation";
import { getUserSafely } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/server";

type ActionResult = { error?: string };
type DebtPayload = Record<string, unknown>;
type DebtRow = {
  category_id: string | null;
  id: string;
  metadata: unknown;
  monthly_payment: number | string | null;
  next_payment_date: string | null;
  payment_account_id: string | null;
  repaid_amount: number | string | null;
  status: string | null;
  start_date: string | null;
  total_amount: number | string | null;
  type: string | null;
};
type DebtPaymentAccountRow = {
  id: string;
  is_active: boolean | null;
  metadata: unknown;
  type: string | null;
};
type DebtCategoryRow = {
  id: string;
  is_active: boolean | null;
  metadata: unknown;
  name: string;
  type: string | null;
};

type LinkedTransactionRow = {
  account_id: string | null;
  amount: number | string | null;
  id: string;
  metadata: unknown;
  related_entity_id: string | null;
  related_entity_type: string | null;
  status: string | null;
  transaction_date: string | null;
  transfer_account_id: string | null;
  type: string | null;
};

type DebtLedgerTotals = {
  charges: number;
  repayments: number;
};
type DebtCardTerms = {
  accountId?: string;
  creditLimit?: number;
  dueDate?: string;
  minimumPayment?: number;
  paymentDueDay?: number | null;
  statementDay?: number | null;
};

async function authenticatedClient() {
  const supabase = await createClient();
  const { user } = await getUserSafely(supabase);
  return { supabase, user };
}

function payload(input: DebtFormData, cardTerms: DebtCardTerms = {}): DebtPayload {
  const isCreditCard = input.isCreditCardDebt;
  const installmentSchedule = !isCreditCard ? buildEmiSchedule({
    interestRate: input.interestRate,
    interestRatePeriod: input.interestRatePeriod,
    numberOfMonths: input.durationMonths,
    principal: input.totalAmount,
    repaidAmount: input.repaidAmount,
    startDate: input.startDate,
  }) : null;
  const creditCardMetadata = isCreditCard ? {
    auto_credit_card_terms: false,
    credit_card_account_id: cardTerms.accountId,
    credit_limit: cardTerms.creditLimit ?? null,
    credit_minimum_payment: cardTerms.minimumPayment ?? null,
    credit_payment_due_day: cardTerms.paymentDueDay ?? null,
    credit_statement_day: cardTerms.statementDay ?? null,
    manual_credit_card_terms: true,
    requires_full_payment: false,
  } : {};
  return {
    category_id: input.categoryId || null,
    description: input.notes.trim() || null,
    lender: input.lender.trim(),
    metadata: {
      category_id: input.categoryId || null,
      ...creditCardMetadata,
      duration_months: input.durationMonths,
      interest_rate: input.interestRate,
      interest_rate_period: input.interestRatePeriod.toLowerCase(),
      lender: input.lender.trim(),
      monthly_payment: input.monthlyPayment,
      next_payment_date: input.nextPaymentDate || null,
      notes: input.notes.trim(),
      payment_account_id: input.paymentAccountId || null,
      payoff_date: input.payoffDate || null,
      principal_paid: installmentSchedule?.principalPaid ?? null,
      repaid_amount: input.repaidAmount,
      remaining_principal: installmentSchedule?.remainingPrincipal ?? null,
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
    type: isCreditCard ? "Credit Card" : input.type,
  };
}

function metadataRecord(metadata: unknown) {
  return metadata && typeof metadata === "object" && !Array.isArray(metadata)
    ? metadata as Record<string, unknown>
    : {};
}

function isCreditCardDebtRow(row: DebtRow) {
  return isCreditCardDebtInput(row);
}

function numericValue(value: unknown, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function normalizeAccountType(value: unknown) {
  return String(value ?? "").trim().toLowerCase().replace(/[\s-]+/g, "_") === "creditcard"
    ? "credit_card"
    : String(value ?? "").trim().toLowerCase().replace(/[\s-]+/g, "_");
}

function recordStatus(metadata: unknown) {
  return String(metadataRecord(metadata).status ?? "").trim().toLowerCase();
}

function optionalDayOfMonth(value: unknown) {
  const day = Number(value);
  return Number.isFinite(day) && Math.trunc(day) >= 1 && Math.trunc(day) <= 31 ? Math.trunc(day) : null;
}

function creditCardTermsForDebt(
  input: DebtFormData,
  account: DebtPaymentAccountRow | null,
  existingDebt?: DebtRow | null,
) {
  if (!input.isCreditCardDebt) return {};
  const accountMetadata = metadataRecord(account?.metadata);
  const existingMetadata = metadataRecord(existingDebt?.metadata);
  const storedDueDate = existingDebt?.next_payment_date
    ?? (typeof existingMetadata.next_payment_date === "string" ? existingMetadata.next_payment_date : "");
  const dueDate = storedDueDate || nextCreditCardPaymentDate({
    paymentDueDay: optionalDayOfMonth(accountMetadata.credit_payment_due_day),
    referenceDate: input.startDate,
    statementDay: optionalDayOfMonth(accountMetadata.credit_statement_day),
  });
  const minimumPayment = existingDebt
    ? numericValue(existingDebt.monthly_payment ?? existingMetadata.monthly_payment)
    : Math.max(numericValue(accountMetadata.credit_minimum_payment), 0);
  return {
    accountId: account?.id,
    creditLimit: Math.max(numericValue(accountMetadata.credit_limit ?? accountMetadata.monthly_budget_limit), 0),
    dueDate,
    minimumPayment,
    paymentDueDay: optionalDayOfMonth(accountMetadata.credit_payment_due_day),
    statementDay: optionalDayOfMonth(accountMetadata.credit_statement_day),
  };
}

function canonicalDebtInput(
  input: DebtFormData,
  cardTerms: DebtCardTerms = {},
): { error?: string; input: DebtFormData } {
  const validationError = validateDebtInput(input);
  if (validationError) return { error: validationError, input };

  if (input.isCreditCardDebt) {
    const remainingAmount = Math.max(input.totalAmount - input.repaidAmount, 0);
    const nextPaymentDate = remainingAmount <= 0.005 ? "" : cardTerms.dueDate ?? input.nextPaymentDate;
    const configuredMinimum = Math.max(cardTerms.minimumPayment ?? input.monthlyPayment, 0) || remainingAmount;
    return {
      input: {
        ...input,
        monthlyPayment: remainingAmount <= 0.005 ? 0 : Math.min(configuredMinimum, remainingAmount),
        nextPaymentDate,
        payoffDate: nextPaymentDate,
        status: calculateDebtStatus({ dueDate: nextPaymentDate, remainingAmount, storedStatus: input.status }),
      },
    };
  }

  const schedule = buildEmiSchedule({
    interestRate: input.interestRate,
    interestRatePeriod: input.interestRatePeriod,
    numberOfMonths: input.durationMonths,
    principal: input.totalAmount,
    repaidAmount: input.repaidAmount,
    startDate: input.startDate,
  });
  if (input.repaidAmount > schedule.totalRepayment + 0.005) {
    return { error: "Repaid amount cannot exceed the scheduled total repayment.", input };
  }

  const remainingAmount = schedule.remainingPrincipal;
  const nextPaymentDate = remainingAmount <= 0.005 ? "" : schedule.nextPaymentDate;
  return {
    input: {
      ...input,
      monthlyPayment: remainingAmount <= 0.005 ? 0 : schedule.monthlyPayment,
      nextPaymentDate,
      payoffDate: schedule.payoffDate,
      status: calculateDebtStatus({
        dueDate: nextPaymentDate,
        remainingAmount,
        storedStatus: input.status,
      }),
    },
  };
}

async function validatePaymentAccount(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  input: DebtFormData,
  allowedArchivedAccountId = "",
) {
  if (!input.paymentAccountId) {
    return input.isCreditCardDebt
      ? { error: "A credit card debt must be linked to a credit card account." }
      : { account: null as DebtPaymentAccountRow | null };
  }
  const { data, error } = await supabase
    .from("accounts")
    .select("id,is_active,metadata,type")
    .eq("id", input.paymentAccountId)
    .eq("user_id", userId)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) return { error: error.message };
  if (!data) return { error: "The selected payment account does not exist." };
  const account = data as DebtPaymentAccountRow;
  if (account.id !== allowedArchivedAccountId && (account.is_active === false || recordStatus(account.metadata) === "archived")) {
    return { error: "Archived accounts cannot be assigned to new debt activity." };
  }
  if (input.isCreditCardDebt && normalizeAccountType(account.type) !== "credit_card") {
    return { error: "A credit card debt must be linked to a credit card account, not a bank or wallet account." };
  }
  return { account };
}

async function validateDebtCategory(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  input: DebtFormData,
  allowedExistingCategoryId = "",
  allowUncategorized = false,
) {
  if (!input.categoryId) {
    return allowUncategorized
      ? { input }
      : { error: "Select an active debt category." };
  }
  const { data, error } = await supabase
    .from("categories")
    .select("id,name,type,is_active,metadata")
    .eq("id", input.categoryId)
    .eq("user_id", userId)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) return { error: error.message };
  if (!data) return { error: "The selected debt category does not exist." };
  const category = data as DebtCategoryRow;
  if (category.id !== allowedExistingCategoryId && category.is_active === false) return { error: "Select an active debt category." };
  const metadata = metadataRecord(category.metadata);
  const categoryType = String(metadata.category_type ?? category.type ?? "").trim().toLowerCase().replace(/[\s_-]+/g, "");
  const scopes = Array.isArray(metadata.scopes) ? metadata.scopes.map((scope) => String(scope).toLowerCase()) : [];
  if (categoryType !== "debt" && !scopes.includes("debts")) return { error: "The selected category is not available for debts." };
  return {
    input: {
      ...input,
      type: input.isCreditCardDebt ? "Credit Card" : category.name,
    },
  };
}

async function getDebtLedgerTotals(
  supabase: Awaited<ReturnType<typeof createClient>>,
  debtId: string,
  userId: string,
  existingDebt: DebtRow,
): Promise<DebtLedgerTotals> {
  const [transactionsResult, paymentsResult] = await Promise.all([
    supabase.from("transactions").select("id,account_id,transfer_account_id,type,amount,metadata,status,transaction_date,related_entity_id,related_entity_type").eq("user_id", userId).is("deleted_at", null),
    supabase.from("debt_payments").select("id,debt_id,transaction_id,amount,payment_date").eq("user_id", userId).eq("debt_id", debtId),
  ]);
  const error = transactionsResult.error ?? paymentsResult.error;
  if (error) throw new Error(error.message);

  const ledger = debtTransactionLedgerFor([
    ...(transactionsResult.data as LinkedTransactionRow[]),
    ...standaloneDebtPaymentTransactions(paymentsResult.data ?? []),
  ], { ...existingDebt, id: debtId });
  return { charges: ledger.charges, repayments: ledger.repayments };
}

async function fetchExistingDebtForUpdate(
  supabase: Awaited<ReturnType<typeof createClient>>,
  debtId: string,
  userId: string,
) {
  const { data, error } = await supabase
    .from("debts")
    .select("id,category_id,metadata,monthly_payment,next_payment_date,payment_account_id,repaid_amount,start_date,status,total_amount,type")
    .eq("id", debtId)
    .eq("user_id", userId)
    .is("deleted_at", null)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return data as DebtRow | null;
}

function preserveDebtLedgerAmounts(debtPayload: DebtPayload, existingDebt: DebtRow | null, ledgerTotals: DebtLedgerTotals) {
  if (!existingDebt) return debtPayload;

  const existingMetadata = metadataRecord(existingDebt.metadata);
  if (!isCreditCardDebtRow(existingDebt)) {
    const storedRepaidAmount = Math.max(numericValue(debtPayload.repaid_amount) - ledgerTotals.repayments, 0);
    return {
      ...debtPayload,
      metadata: {
        ...metadataRecord(debtPayload.metadata),
        repaid_amount: storedRepaidAmount,
      },
      repaid_amount: storedRepaidAmount,
    };
  }

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
  const categoryResult = await validateDebtCategory(supabase, user.id, input);
  if ("error" in categoryResult) return { error: categoryResult.error };
  const accountResult = await validatePaymentAccount(supabase, user.id, categoryResult.input);
  if ("error" in accountResult) return { error: accountResult.error };
  const canonical = canonicalDebtInput(
    categoryResult.input,
    creditCardTermsForDebt(categoryResult.input, accountResult.account),
  );
  if (canonical.error) return { error: canonical.error };
  const debtPayload = payload(
    canonical.input,
    canonical.input.isCreditCardDebt ? creditCardTermsForDebt(canonical.input, accountResult.account) : {},
  );

  for (let attempt = 0; attempt < 8; attempt += 1) {
    const { error } = await supabase.from("debts").insert({ ...debtPayload, user_id: user.id });
    if (!error) {
      revalidatePath("/debts");
      revalidatePath("/future-planning");
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
  if (!existingDebt) return { error: "Debt not found." };
  const existingMetadata = metadataRecord(existingDebt.metadata);
  if (isCreditCardDebtRow(existingDebt)
    && existingMetadata.auto_credit_card_terms === true
    && existingMetadata.manual_credit_card_terms !== true) {
    return { error: "Automatic credit card debt is managed from the linked Accounts card details and cannot be edited directly." };
  }
  if (isCreditCardDebtRow(existingDebt) !== input.isCreditCardDebt) {
    return { error: "A debt cannot be changed between credit-card and installment-loan accounting after creation." };
  }
  const categoryResult = await validateDebtCategory(
    supabase,
    user.id,
    input,
    existingDebt.category_id ?? "",
    existingDebt.category_id == null,
  );
  if ("error" in categoryResult) return { error: categoryResult.error };
  let ledgerTotals = { charges: 0, repayments: 0 };
  if (existingDebt) {
    try {
      ledgerTotals = await getDebtLedgerTotals(supabase, debtId, user.id, existingDebt);
    } catch (error) {
      return { error: error instanceof Error ? error.message : "Unable to load linked debt transactions." };
    }
  }
  if (input.repaidAmount + 0.005 < ledgerTotals.repayments) {
    return { error: "Repaid amount cannot be lower than the posted repayment history linked to this debt." };
  }
  if (input.isCreditCardDebt && input.totalAmount + 0.005 < ledgerTotals.charges) {
    return { error: "Total amount cannot be lower than the posted credit card charges linked to this debt." };
  }
  const accountResult = await validatePaymentAccount(
    supabase,
    user.id,
    categoryResult.input,
    existingDebt?.payment_account_id ?? "",
  );
  if ("error" in accountResult) return { error: accountResult.error };
  const canonicalCategoryInput = canonicalDebtInput(
    categoryResult.input,
    creditCardTermsForDebt(categoryResult.input, accountResult.account, existingDebt),
  );
  if (canonicalCategoryInput.error) return { error: canonicalCategoryInput.error };
  const { data, error } = await updateDebtPayload(
    supabase,
    debtId,
    user.id,
    preserveDebtLedgerAmounts(
      payload(
        canonicalCategoryInput.input,
        canonicalCategoryInput.input.isCreditCardDebt
          ? creditCardTermsForDebt(canonicalCategoryInput.input, accountResult.account, existingDebt)
          : {},
      ),
      existingDebt,
      ledgerTotals,
    ),
  );
  if (error) return { error: error.message };
  if (!data) return { error: "Debt not found." };
  revalidatePath("/debts");
  revalidatePath("/future-planning");
  revalidatePath(`/debts/${debtId}/edit`);
  return {};
}

export async function deleteDebt(debtId: string): Promise<ActionResult> {
  const { supabase, user } = await authenticatedClient();
  if (!user) return { error: "You must be signed in." };
  let existingDebt: DebtRow | null;
  try {
    existingDebt = await fetchExistingDebtForUpdate(supabase, debtId, user.id);
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Unable to load debt." };
  }
  if (!existingDebt) return { error: "Debt not found." };
  const [transactionsResult, paymentsResult] = await Promise.all([
    supabase
      .from("transactions")
      .select("id,metadata,related_entity_id,related_entity_type")
      .eq("user_id", user.id)
      .is("deleted_at", null),
    supabase
      .from("debt_payments")
      .select("id")
      .eq("user_id", user.id)
      .eq("debt_id", debtId)
      .limit(1),
  ]);
  const linkedError = transactionsResult.error ?? paymentsResult.error;
  if (linkedError) return { error: linkedError.message };
  const linkedTransactions = transactionsResult.data ?? [];
  const hasLinkedHistory = linkedTransactions.some((transaction) => {
    const metadata = metadataRecord(transaction.metadata);
    return (transaction.related_entity_type === "debt" && transaction.related_entity_id === debtId)
      || metadata.credit_card_debt_id === debtId;
  });
  const existingMetadata = metadataRecord(existingDebt.metadata);
  const hasStoredRepayment = numericValue(existingDebt.repaid_amount ?? existingMetadata.repaid_amount) > 0.005;
  const hasCardOpeningBalance = isCreditCardDebtRow(existingDebt)
    && Math.abs(
      numericValue(existingDebt.total_amount ?? existingMetadata.total_amount)
      - numericValue(existingDebt.repaid_amount ?? existingMetadata.repaid_amount),
    ) > 0.005;
  if (hasLinkedHistory || (paymentsResult.data?.length ?? 0) > 0 || hasStoredRepayment || hasCardOpeningBalance) {
    return { error: "This debt has linked financial history and cannot be deleted without breaking account and repayment calculations. Keep the record for reconciliation." };
  }
  const { data, error } = await archiveDebtPayload(supabase, debtId, user.id);
  if (error) return { error: error.message };
  if (!data) return { error: "Debt not found." };
  revalidatePath("/debts");
  revalidatePath("/future-planning");
  return {};
}
