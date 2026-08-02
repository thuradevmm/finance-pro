"use server";

import { revalidatePath } from "next/cache";

import { nextCreditCardPaymentDate } from "@/lib/accounts/credit-card-dates";
import { buildEmiSchedule, normalizeDebtRepaymentDate } from "@/lib/debts/emi";
import { debtOriginationTransactionType, normalizeDebtNature } from "@/lib/debts/nature";
import { calculateDebtStatus } from "@/lib/debts/status";
import { resolveDebtStoredNumber } from "@/lib/debts/stored-values";
import type { DebtFormData } from "@/lib/debts/supabase";
import {
  debtTransactionLedgerFor,
  isCreditCardDebtInput,
  standaloneDebtPaymentTransactions,
} from "@/lib/debts/transactions";
import { validateDebtInput } from "@/lib/debts/validation";
import { getUserSafely } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/server";
import { isMissingDatabaseObject } from "@/lib/supabase/schema-compat";

type ActionResult = { error?: string };
type DebtPayload = Record<string, unknown>;
type DebtRow = {
  category_id: string | null;
  id: string;
  metadata: unknown;
  monthly_payment: number | string | null;
  name: string;
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
  category_type: string | null;
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

function revalidateDebtViews(debtId?: string) {
  for (const path of [
    "/accounts",
    "/debts",
    "/categories",
    "/dashboard",
    "/future-planning",
    "/notifications",
    "/transactions",
  ]) revalidatePath(path);
  if (debtId) revalidatePath(`/debts/${debtId}/edit`);
}

function recordLabel(input: Pick<DebtFormData, "isCreditCardDebt" | "nature">) {
  return input.isCreditCardDebt ? "Credit card borrowing" : input.nature;
}

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
      debt_nature: input.nature.toLowerCase(),
      interest_rate: input.interestRate,
      interest_rate_period: input.interestRatePeriod.toLowerCase(),
      lender: input.lender.trim(),
      lending_funding_confirmed: input.nature === "Lending" && Boolean(input.paymentAccountId),
      monthly_payment: input.monthlyPayment,
      next_payment_date: input.nextPaymentDate || null,
      notes: input.notes.trim(),
      origination_account_amount_type: input.accountAmountType,
      payment_account_id: input.paymentAccountId || null,
      payoff_date: input.payoffDate || null,
      repayment_frequency: input.repaymentFrequency === "One-time" ? "one_time" : "monthly",
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

function accountAmountTypes(metadataValue: unknown) {
  const metadata = metadataRecord(metadataValue);
  if (!Array.isArray(metadata.amount_types)) return ["Operation"];
  const amountTypes = metadata.amount_types
    .map((value) => metadataRecord(value).type)
    .filter((type): type is string => typeof type === "string" && Boolean(type.trim()))
    .map((type) => type.trim());
  return amountTypes.length > 0 ? amountTypes : ["Operation"];
}

async function syncDebtOriginationTransaction(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  debtId: string,
  input: DebtFormData,
  account: DebtPaymentAccountRow | null,
) {
  const { data: existingRows, error: existingError } = await supabase
    .from("transactions")
    .select("id,metadata")
    .eq("user_id", userId)
    .eq("related_entity_type", "debt")
    .eq("related_entity_id", debtId);
  if (existingError) return existingError.message;

  const existing = (existingRows ?? []).find((transaction) => {
    return metadataRecord(transaction.metadata).financial_event === "debt_origination";
  });
  const isLending = input.nature === "Lending";
  const originationTransactionType = debtOriginationTransactionType(input.nature);
  if (input.isCreditCardDebt || !account || input.totalAmount <= 0) {
    if (!existing) return null;
    const { error } = await supabase
      .from("transactions")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", existing.id)
      .eq("user_id", userId);
    return error?.message ?? null;
  }

  const transactionPayload = {
    account_id: account.id,
    amount: input.totalAmount,
    category_id: input.categoryId || null,
    deleted_at: null,
    description: `${isLending ? "Money lent" : "Borrowed money received"} · ${input.name.trim()}`,
    metadata: {
      account_amount_type: input.accountAmountType,
      accounting_class: isLending ? "financing_payment" : "financing_receipt",
      accounting_version: 1,
      cash_flow_treatment: isLending ? "explicit_funding" : "borrowing_receipt",
      debt_interest_amount: 0,
      debt_principal_amount: input.totalAmount,
      debt_nature: isLending ? "lending" : "borrowing",
      financial_event: "debt_origination",
      lending_funding_confirmed: isLending,
      system_managed: true,
    },
    note: input.notes.trim() || null,
    related_entity_id: debtId,
    related_entity_type: "debt",
    status: "cleared",
    title: `${input.name.trim()} · ${isLending ? "lending funded" : "borrowing received"}`,
    transaction_date: input.startDate,
    transfer_account_id: null,
    type: originationTransactionType,
  };

  if (existing) {
    const { error } = await supabase
      .from("transactions")
      .update(transactionPayload)
      .eq("id", existing.id)
      .eq("user_id", userId);
    return error?.message ?? null;
  }

  const { error } = await supabase
    .from("transactions")
    .insert({ ...transactionPayload, user_id: userId });
  return error?.message ?? null;
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

  if (input.repaymentFrequency === "One-time") {
    const remainingAmount = Math.max(input.totalAmount - input.repaidAmount, 0);
    const repaymentDate = input.payoffDate || input.nextPaymentDate;
    if (!repaymentDate) return { error: `Choose the one-time ${input.nature === "Lending" ? "return" : "repayment"} date.`, input };
    if (repaymentDate < input.startDate) {
      return { error: `The one-time ${input.nature === "Lending" ? "return" : "repayment"} date cannot be before the ${input.nature === "Lending" ? "lending" : "borrowing"} date.`, input };
    }
    if (input.repaidAmount > input.totalAmount + 0.005) {
      return { error: `${input.nature === "Lending" ? "Returned" : "Repaid"} amount cannot exceed the total amount for a one-time ${input.nature.toLowerCase()} record.`, input };
    }
    const nextPaymentDate = remainingAmount <= 0.005 ? "" : repaymentDate;
    return {
      input: {
        ...input,
        durationMonths: 1,
        monthlyPayment: remainingAmount <= 0.005 ? 0 : remainingAmount,
        nextPaymentDate,
        payoffDate: repaymentDate,
        status: calculateDebtStatus({
          dueDate: nextPaymentDate,
          remainingAmount,
          storedStatus: input.status,
        }),
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
    return { error: `${input.nature === "Lending" ? "Returned" : "Repaid"} amount cannot exceed the scheduled total ${input.nature === "Lending" ? "return" : "repayment"}.`, input };
  }

  const remainingAmount = schedule.remainingPrincipal;
  const nextPaymentDate = remainingAmount <= 0.005
    ? ""
    : normalizeDebtRepaymentDate(input.startDate, schedule.nextPaymentDate);
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
    if (input.isCreditCardDebt) {
      return { error: "Select the credit card account for this credit card borrowing." };
    }
    if (input.nature === "Lending") {
      return { error: "Select the account that funds this lending record." };
    }
    return { error: "Select the account that receives the borrowed money." };
  }
  const { data, error } = await supabase
    .from("accounts")
    .select("id,is_active,metadata,type")
    .eq("id", input.paymentAccountId)
    .eq("user_id", userId)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) return { error: error.message };
  if (!data) return { error: "The selected account does not exist." };
  const account = data as DebtPaymentAccountRow;
  if (account.id !== allowedArchivedAccountId && (account.is_active === false || recordStatus(account.metadata) === "archived")) {
    return { error: "Archived accounts cannot be assigned to new borrowing or lending activity." };
  }
  if (input.isCreditCardDebt && normalizeAccountType(account.type) !== "credit_card") {
    return { error: "Credit card borrowing must be linked to a credit card account, not a bank or wallet account." };
  }
  const supportedAmountTypes = normalizeAccountType(account.type) === "credit_card"
    ? ["Credit Card"]
    : accountAmountTypes(account.metadata);
  if (!input.accountAmountType.trim()) {
    return { error: `Select the account amount type that ${input.nature === "Lending" ? "funds the lending" : "receives the borrowing"}.` };
  }
  if (!supportedAmountTypes.some((type) => type.toLowerCase() === input.accountAmountType.trim().toLowerCase())) {
    return { error: "The selected amount type is not available on this account." };
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
      : { error: "Select an active borrowing / lending category." };
  }
  let { data, error } = await supabase
    .from("categories")
    .select("id,name,type,category_type,is_active,metadata")
    .eq("id", input.categoryId)
    .eq("user_id", userId)
    .is("deleted_at", null)
    .maybeSingle();
  if (error && isMissingDatabaseObject(error, ["category_type"])) {
    ({ data, error } = await supabase
      .from("categories")
      .select("id,name,type,is_active,metadata")
      .eq("id", input.categoryId)
      .eq("user_id", userId)
      .is("deleted_at", null)
      .maybeSingle());
  }
  if (error) return { error: error.message };
  if (!data) return { error: "The selected borrowing / lending category does not exist." };
  const category = data as DebtCategoryRow;
  if (category.id !== allowedExistingCategoryId && category.is_active === false) return { error: "Select an active borrowing / lending category." };
  const metadata = metadataRecord(category.metadata);
  const categoryType = String(category.category_type ?? metadata.category_type ?? category.type ?? "").trim().toLowerCase().replace(/[\s_-]+/g, "");
  const scopes = Array.isArray(metadata.scopes) ? metadata.scopes.map((scope) => String(scope).toLowerCase()) : [];
  if (categoryType !== "debt" && !scopes.includes("debts")) return { error: "The selected category is not available for borrowing or lending." };
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
    .select("id,name,category_id,metadata,monthly_payment,next_payment_date,payment_account_id,repaid_amount,start_date,status,total_amount,type")
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
    const { data, error } = await supabase
      .from("debts")
      .insert({ ...debtPayload, user_id: user.id })
      .select("id")
      .maybeSingle();
    if (!error) {
      if (!data?.id) return { error: `${recordLabel(canonical.input)} was saved without a reconciliation identifier.` };
      const originationError = await syncDebtOriginationTransaction(
        supabase,
        user.id,
        data.id as string,
        canonical.input,
        accountResult.account,
      );
      if (originationError) {
        await supabase.from("debts").delete().eq("id", data.id).eq("user_id", user.id);
        return { error: `${recordLabel(canonical.input)} origination could not be reconciled: ${originationError}` };
      }
      revalidateDebtViews();
      return {};
    }

    const column = missingSchemaColumn(error.message);
    if (!column || column === "user_id" || !(column in debtPayload)) return { error: error.message };
    delete debtPayload[column];
  }

  return { error: `${recordLabel(input)} could not be saved because the database schema is not aligned with this form.` };
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

  return { data: null, error: { message: "The borrowing / lending record could not be updated because the database schema is not aligned with this form." } };
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

  return { data: null, error: { message: "The borrowing / lending record could not be deleted because the database schema is not aligned with this form." } };
}

export async function updateDebt(debtId: string, input: DebtFormData): Promise<ActionResult> {
  const { supabase, user } = await authenticatedClient();
  if (!user) return { error: "You must be signed in." };
  let existingDebt: DebtRow | null;
  try {
    existingDebt = await fetchExistingDebtForUpdate(supabase, debtId, user.id);
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Unable to load the borrowing / lending record." };
  }
  if (!existingDebt) return { error: "Borrowing / lending record not found." };
  const existingMetadata = metadataRecord(existingDebt.metadata);
  if (isCreditCardDebtRow(existingDebt)
    && existingMetadata.auto_credit_card_terms === true
    && existingMetadata.manual_credit_card_terms !== true) {
    return { error: "Automatic credit card borrowing is managed from the linked account details and cannot be edited directly." };
  }
  if (isCreditCardDebtRow(existingDebt) !== input.isCreditCardDebt) {
    return { error: "A borrowing or lending record cannot be changed between credit-card and installment accounting after creation." };
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
      return { error: error instanceof Error ? error.message : "Unable to load linked borrowing / lending transactions." };
    }
  }
  if (input.repaidAmount + 0.005 < ledgerTotals.repayments) {
    return { error: `${input.nature === "Lending" ? "Returned" : "Repaid"} amount cannot be lower than the posted ${input.nature === "Lending" ? "return" : "repayment"} history linked to this record.` };
  }
  const existingNature = normalizeDebtNature(existingMetadata.debt_nature, existingDebt.name);
  if (existingNature !== input.nature && ledgerTotals.repayments > 0.005) {
    return { error: "Financial nature cannot be changed after linked payment or return transactions have been posted." };
  }
  if (input.isCreditCardDebt && input.totalAmount + 0.005 < ledgerTotals.charges) {
    return { error: "Total amount cannot be lower than the posted charges linked to this credit card borrowing." };
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
  if (!data) return { error: "Borrowing / lending record not found." };
  const originationError = await syncDebtOriginationTransaction(
    supabase,
    user.id,
    debtId,
    canonicalCategoryInput.input,
    accountResult.account,
  );
  if (originationError) {
    return { error: `${recordLabel(canonicalCategoryInput.input)} was updated, but its origination transaction could not be reconciled: ${originationError}` };
  }
  revalidateDebtViews(debtId);
  return {};
}

export async function deleteDebt(debtId: string): Promise<ActionResult> {
  const { supabase, user } = await authenticatedClient();
  if (!user) return { error: "You must be signed in." };
  let existingDebt: DebtRow | null;
  try {
    existingDebt = await fetchExistingDebtForUpdate(supabase, debtId, user.id);
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Unable to load the borrowing / lending record." };
  }
  if (!existingDebt) return { error: "Borrowing / lending record not found." };
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
  const hasStoredRepayment = resolveDebtStoredNumber(existingDebt.repaid_amount, existingMetadata.repaid_amount) > 0.005;
  const hasCardOpeningBalance = isCreditCardDebtRow(existingDebt)
    && Math.abs(
      resolveDebtStoredNumber(existingDebt.total_amount, existingMetadata.total_amount)
      - resolveDebtStoredNumber(existingDebt.repaid_amount, existingMetadata.repaid_amount),
    ) > 0.005;
  if (hasLinkedHistory || (paymentsResult.data?.length ?? 0) > 0 || hasStoredRepayment || hasCardOpeningBalance) {
    const nature = isCreditCardDebtRow(existingDebt)
      ? "credit card borrowing"
      : normalizeDebtNature(existingMetadata.debt_nature, existingDebt.name).toLowerCase();
    return { error: `This ${nature} record has linked financial history and cannot be deleted without breaking account and ${nature === "lending" ? "return" : "repayment"} calculations. Keep the record for reconciliation.` };
  }
  const { data, error } = await archiveDebtPayload(supabase, debtId, user.id);
  if (error) return { error: error.message };
  if (!data) return { error: "Borrowing / lending record not found." };
  revalidateDebtViews();
  return {};
}
