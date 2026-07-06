"use server";

import { randomUUID } from "crypto";
import { revalidatePath } from "next/cache";

import { getCategoryTypeStyle } from "@/lib/categories/category-style";
import { SYSTEM_CURRENCY, formatMmk } from "@/lib/currency";
import { calculateDebtPayoffSummary, type DebtDatedRepayment, type DebtInterestRatePeriod } from "@/lib/debts/emi";
import { buildAccountLedgerActivities, normalizeAmountType } from "@/lib/ledger";
import type { TransactionFormData } from "@/lib/transactions/supabase";
import { getUserSafely } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/server";

type ActionResult = { error?: string; transactionIds?: string[] };

type AccountRow = {
  id: string;
  metadata?: unknown;
  name?: string | null;
  type: string | null;
};

type TransactionRow = {
  account_id: string | null;
  amount: number | string | null;
  category_id: string | null;
  description: string | null;
  id: string;
  metadata: unknown;
  note: string | null;
  related_entity_id: string | null;
  related_entity_type: string | null;
  status: string | null;
  title: string | null;
  transaction_date: string | null;
  transfer_account_id: string | null;
  type: string | null;
};

type MutationTransaction = Pick<TransactionRow, "id" | "metadata" | "related_entity_id" | "related_entity_type" | "type">;

type DebtRow = {
  id: string;
  interest_rate?: number | string | null;
  metadata: unknown;
  monthly_payment?: number | string | null;
  next_payment_date?: string | null;
  payment_account_id: string | null;
  repaid_amount?: number | string | null;
  start_date?: string | null;
  status: string | null;
  total_amount?: number | string | null;
  type?: string | null;
};

type SubscriptionRow = {
  amount: number | string | null;
  billing_cycle: string | null;
  id: string;
  metadata: unknown;
  next_billing_date: string | null;
  status: string | null;
};

type SubscriptionPaymentRow = {
  amount: number | string | null;
  created_at: string | null;
  id: string;
  metadata: unknown;
  note: string | null;
  payment_date: string | null;
  subscription_id: string;
  transaction_id: string | null;
};

type SubscriptionPaymentEvidence = {
  amount: number;
  billedAmount: number;
  billingCurrency: string;
  billingDueDate: string;
  configuredExchangeRate: number;
  exchangeRate: number;
  id: string;
  note: string | null;
  paymentDate: string;
  source: "linked_transaction" | "payment_record";
  transactionId: string | null;
};

type CreditCardDebtImpact = "charge" | "repayment" | "";

type CreditCardDebtResolution = {
  debtId: string;
  input: TransactionFormData;
  metadata: TransactionExtraMetadata;
};

type CategoryRow = {
  id: string;
  is_active: boolean | null;
  metadata: unknown;
  name: string | null;
};

const transactionLinkedPaths = [
  "/transactions",
  "/accounts",
  "/assets",
  "/budgets",
  "/dashboard",
  "/debts",
  "/future-planning",
  "/people-payments",
  "/reports",
  "/savings-goals",
  "/scenario-budgeting",
  "/subscriptions",
];

async function authenticatedClient() {
  const supabase = await createClient();
  const { user } = await getUserSafely(supabase);
  return { supabase, user };
}

function revalidateTransactionLinkedPaths(extraPaths: string[] = []) {
  for (const path of [...transactionLinkedPaths, ...extraPaths]) {
    revalidatePath(path);
  }
}

type TransactionExtraMetadata = Record<string, unknown>;

function singleTransactionPayload(input: TransactionFormData, extraMetadata: TransactionExtraMetadata = {}) {
  return {
    account_id: input.accountId || null,
    amount: input.amount,
    category_id: input.categoryId || null,
    description: input.note.trim() || null,
    note: input.note.trim() || null,
    payment_method: null,
    metadata: {
      account_amount_type: input.accountAmountType,
      transfer_account_amount_type: null,
      ...extraMetadata,
    },
    related_entity_id: input.relatedEntityType === "none" ? null : input.relatedEntityId || null,
    related_entity_type: input.relatedEntityType === "none" ? null : input.relatedEntityType,
    status: input.status.toLowerCase(),
    title: input.title.trim() || `${input.type} transaction`,
    transaction_date: input.date,
    transfer_account_id: null,
    type: input.type.toLowerCase(),
  };
}

function metadataRecord(metadata: unknown) {
  return metadata && typeof metadata === "object" && !Array.isArray(metadata)
    ? metadata as Record<string, unknown>
    : {};
}

function metadataArray(value: unknown) {
  return Array.isArray(value) ? value : [];
}

function numericValue(value: unknown, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function roundCurrencyValue(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function postedStatusAffectsBalance(value: unknown) {
  const status = String(value ?? "cleared").trim().toLowerCase();
  return !["scheduled", "cancelled", "canceled", "void", "failed"].includes(status);
}

function optionalNumericValue(value: unknown) {
  if (value == null || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function dayOfMonthValue(value: unknown) {
  const number = optionalNumericValue(value);
  if (number == null) return null;
  const day = Math.trunc(number);
  return day >= 1 && day <= 31 ? day : null;
}

function normalizeAccountType(value: unknown) {
  const key = String(value ?? "").trim().toLowerCase().replace(/[\s-]+/g, "_");
  if (key === "creditcard") return "credit_card";
  return key;
}

function formatDateInput(value: Date) {
  if (Number.isNaN(value.getTime())) return "";
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`;
}

function parseDateInput(value: string | null | undefined) {
  if (!value) return null;
  const dateValue = value.includes("T") ? value.slice(0, 10) : value;
  const date = new Date(`${dateValue}T00:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function addMonths(date: Date, monthCount: number) {
  const next = new Date(date);
  const day = next.getDate();
  next.setMonth(next.getMonth() + monthCount);
  if (next.getDate() !== day) next.setDate(0);
  return next;
}

function addDays(date: Date, dayCount: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + dayCount);
  return next;
}

function addYears(date: Date, yearCount: number) {
  const next = new Date(date);
  const month = next.getMonth();
  next.setFullYear(next.getFullYear() + yearCount);
  if (next.getMonth() !== month) next.setDate(0);
  return next;
}

function daysInMonth(year: number, monthIndex: number) {
  return new Date(year, monthIndex + 1, 0).getDate();
}

function dateForDay(year: number, monthIndex: number, day: number) {
  return new Date(year, monthIndex, Math.min(day, daysInMonth(year, monthIndex)));
}

function nextMonthlyDateForDay(day: number, fromDate: Date) {
  const today = new Date(fromDate);
  today.setHours(0, 0, 0, 0);
  const candidate = dateForDay(today.getFullYear(), today.getMonth(), day);
  return candidate < today ? dateForDay(today.getFullYear(), today.getMonth() + 1, day) : candidate;
}

function creditLimitFromMetadata(metadata: Record<string, unknown>) {
  return numericValue(metadata.credit_limit ?? metadata.monthly_budget_limit);
}

function isCreditCardAccount(account: AccountRow | null) {
  return normalizeAccountType(account?.type) === "credit_card";
}

function transactionMutationError(message: string) {
  if (message.includes("chk_transaction_transfer_accounts")) {
    return "Transfer requires a destination account. Same-account transfers are only allowed when the from and to amount types are different. If this still appears, apply the latest database migration.";
  }

  return message;
}

function transferGroupId(metadata: Record<string, unknown>) {
  if (typeof metadata.transfer_group_id === "string" && metadata.transfer_group_id) return metadata.transfer_group_id;
  if (typeof metadata.same_account_transfer_group_id === "string" && metadata.same_account_transfer_group_id) return metadata.same_account_transfer_group_id;
  return "";
}

function transferDirection(metadata: Record<string, unknown>) {
  const direction = typeof metadata.transfer_direction === "string" ? metadata.transfer_direction.toLowerCase() : "";
  if (direction === "debit" || direction === "credit") return direction;
  const legacyRole = typeof metadata.same_account_transfer_role === "string" ? metadata.same_account_transfer_role.toLowerCase() : "";
  if (legacyRole === "out") return "debit";
  if (legacyRole === "in") return "credit";
  return "";
}

function transferPairPayload(input: TransactionFormData, userId: string, groupId: string = randomUUID(), extraMetadata: TransactionExtraMetadata = {}) {
  const title = input.title.trim() || "Transfer transaction";
  const note = input.note.trim() || null;
  const relatedEntityId = input.relatedEntityType === "none" ? null : input.relatedEntityId || null;
  const relatedEntityType = input.relatedEntityType === "none" ? null : input.relatedEntityType;
  const base = {
    amount: input.amount,
    category_id: null,
    description: note,
    note,
    payment_method: null,
    related_entity_id: relatedEntityId,
    related_entity_type: relatedEntityType,
    status: input.status.toLowerCase(),
    transaction_date: input.date,
    title,
    type: "transfer",
    user_id: userId,
  };

  return [
    {
      ...base,
      account_id: input.accountId || null,
      transfer_account_id: input.transferAccountId || null,
      metadata: {
        account_amount_type: input.accountAmountType,
        counter_account_amount_type: input.transferAccountAmountType,
        counter_account_id: input.transferAccountId,
        ...extraMetadata,
        transfer_direction: "debit",
        transfer_group_id: groupId,
        transfer_account_amount_type: input.transferAccountAmountType,
      },
    },
    {
      ...base,
      account_id: input.transferAccountId || null,
      transfer_account_id: input.accountId || null,
      metadata: {
        account_amount_type: input.transferAccountAmountType,
        counter_account_amount_type: input.accountAmountType,
        counter_account_id: input.accountId,
        ...extraMetadata,
        transfer_direction: "credit",
        transfer_group_id: groupId,
        transfer_account_amount_type: input.accountAmountType,
      },
    },
  ];
}

async function validateAvailableAmount(input: TransactionFormData, userId: string, ignoredTransactionIds: string[] = []) {
  if (input.type !== "Expense" && input.type !== "Transfer") return null;
  if (input.status.toLowerCase() === "scheduled") return null;

  const { supabase } = await authenticatedClient();
  const amountType = normalizeAmountType(input.accountAmountType);
  const { data: account, error: accountError } = await supabase
    .from("accounts")
    .select("id,type,metadata")
    .eq("id", input.accountId)
    .eq("user_id", userId)
    .is("deleted_at", null)
    .maybeSingle();

  if (accountError) return accountError.message;
  if (!account) return "Account not found.";

  const { data: transactions, error: transactionsError } = await supabase
    .from("transactions")
    .select("id,account_id,transfer_account_id,amount,type,metadata,status")
    .eq("user_id", userId)
    .is("deleted_at", null);

  if (transactionsError) return transactionsError.message;

  const accountActivities = buildAccountLedgerActivities(
    (transactions as TransactionRow[]).filter((transaction) => !ignoredTransactionIds.includes(transaction.id)),
    [account as AccountRow],
  );
  const accountActivity = accountActivities.get(input.accountId);

  if (isCreditCardAccount(account as AccountRow)) {
    const creditLimit = creditLimitFromMetadata(metadataRecord((account as AccountRow).metadata));
    if (creditLimit <= 0) return null;

    const usedAmount = accountActivity?.creditUsed ?? 0;
    const availableLimit = Math.max(creditLimit - usedAmount, 0);
    return input.amount > availableLimit
      ? `Insufficient credit card limit. Available limit is ${formatMmk(availableLimit)}.`
      : null;
  }

  const availableAmount = accountActivity?.deltas.get(amountType) ?? 0;

  return input.amount > availableAmount
    ? `Insufficient ${amountType} available amount. Available amount is ${formatMmk(availableAmount)}.`
    : null;
}

async function getCreditCardAccountForTransaction(input: TransactionFormData, userId: string) {
  const { supabase } = await authenticatedClient();
  const accountIds = [input.accountId, input.transferAccountId].filter(Boolean);
  if (accountIds.length === 0) return { account: null as AccountRow | null };

  const { data: accounts, error } = await supabase
    .from("accounts")
    .select("id,name,type,metadata")
    .eq("user_id", userId)
    .in("id", accountIds)
    .is("deleted_at", null);

  if (error) return { error: error.message };

  const accountRows = accounts as AccountRow[];
  const accountById = new Map(accountRows.map((account) => [account.id, account]));
  const primaryAccount = accountById.get(input.accountId) ?? null;
  if (isCreditCardAccount(primaryAccount)) return { account: primaryAccount };

  const transferAccount = input.type === "Transfer" ? accountById.get(input.transferAccountId) ?? null : null;
  return { account: isCreditCardAccount(transferAccount) ? transferAccount : null };
}

function creditCardDebtAccountId(debt: DebtRow) {
  const metadata = metadataRecord(debt.metadata);
  if (typeof metadata.credit_card_account_id === "string") return metadata.credit_card_account_id;
  if (typeof metadata.auto_credit_card_account_id === "string") return metadata.auto_credit_card_account_id;
  return debt.payment_account_id ?? "";
}

function normalizeDebtType(value: unknown) {
  return String(value ?? "").trim().toLowerCase().replace(/[\s_-]+/g, "");
}

function isCreditCardDebt(debt: DebtRow) {
  const metadata = metadataRecord(debt.metadata);
  return typeof metadata.credit_card_account_id === "string"
    || typeof metadata.auto_credit_card_account_id === "string"
    || normalizeDebtType(debt.type ?? metadata.type) === "creditcard";
}

function isManualCreditCardDebt(debt: DebtRow) {
  const metadata = metadataRecord(debt.metadata);
  if (metadata.manual_credit_card_terms === true || metadata.auto_credit_card_terms === false) return true;
  if (metadata.auto_credit_card_account_id || metadata.auto_credit_card_terms === true) return false;
  return true;
}

function metadataString(metadata: Record<string, unknown>, key: string) {
  const value = metadata[key];
  return typeof value === "string" ? value : "";
}

function debtStatusKey(debt: DebtRow) {
  return String(debt.status ?? metadataRecord(debt.metadata).status ?? "").toLowerCase();
}

function creditCardImpactForInput(input: TransactionFormData, creditCardAccountId: string): CreditCardDebtImpact {
  const transactionType = input.type.toLowerCase();
  const usesCreditCardAccount = input.accountId === creditCardAccountId;
  const paysCreditCardAccount = input.type === "Transfer" && input.transferAccountId === creditCardAccountId;

  if (usesCreditCardAccount && paysCreditCardAccount) return "";
  if (usesCreditCardAccount && transactionType === "expense") return "charge";
  if (usesCreditCardAccount && transactionType === "income") return "repayment";
  if (usesCreditCardAccount && transactionType === "transfer") return "charge";
  if (paysCreditCardAccount) return "repayment";
  return "";
}

function isDebtCategory(row: CategoryRow) {
  if (row.is_active === false) return false;
  const metadata = metadataRecord(row.metadata);
  const categoryType = String(metadata.category_type ?? "").trim().toLowerCase();
  if (categoryType === "debt" || categoryType === "debts") return true;
  return metadataArray(metadata.scopes).some((scope) => String(scope).toLowerCase() === "debts");
}

function normalizeCategoryName(value: unknown) {
  return String(value ?? "").trim().toLowerCase();
}

async function findOrCreateCreditCardDebtCategoryId(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
) {
  const { data, error } = await supabase
    .from("categories")
    .select("id,name,is_active,metadata")
    .eq("user_id", userId)
    .is("deleted_at", null)
    .order("created_at", { ascending: true });

  if (error) return null;

  const debtCategories = (data as CategoryRow[]).filter(isDebtCategory);
  const preferredCategory = debtCategories.find((category) => normalizeCategoryName(category.name).includes("credit"))
    ?? debtCategories[0];
  if (preferredCategory) return preferredCategory.id;

  const style = getCategoryTypeStyle("Debt");
  for (const name of ["Credit Card Debt", "Credit Card Liability", "Debt"]) {
    const { data: createdCategory, error: createError } = await supabase
      .from("categories")
      .insert({
        color: style.color,
        icon: style.icon,
        is_active: true,
        is_default: false,
        metadata: {
          category_type: "Debt",
          description: "Automatically created for credit card debt tracking.",
          scopes: ["Debts", "Reports"],
          system_created: true,
        },
        name,
        type: "expense",
        user_id: userId,
      })
      .select("id")
      .maybeSingle();

    if (!createError && createdCategory?.id) return createdCategory.id as string;
    if (createError?.code !== "23505") break;
  }

  return null;
}

function creditCardImpactForTransaction(transaction: TransactionRow, creditCardAccountId: string): CreditCardDebtImpact {
  const transactionType = String(transaction.type ?? "").toLowerCase();
  const metadata = metadataRecord(transaction.metadata);
  const direction = transferDirection(metadata);
  const usesCreditCardAccount = transaction.account_id === creditCardAccountId;
  const paysCreditCardAccount = transaction.transfer_account_id === creditCardAccountId;

  if (usesCreditCardAccount && paysCreditCardAccount) return "";
  if (transactionType === "transfer") {
    if (direction) {
      if (!usesCreditCardAccount) return "";
      return direction === "debit" ? "charge" : "repayment";
    }
    if (usesCreditCardAccount) return "charge";
    if (paysCreditCardAccount) return "repayment";
    return "";
  }
  if (usesCreditCardAccount && transactionType === "expense") return "charge";
  if (usesCreditCardAccount && transactionType === "income") return "repayment";
  return "";
}

async function creditCardDebtBalance(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  debt: DebtRow,
  creditCardAccountId: string,
) {
  const { data, error } = await supabase
    .from("transactions")
    .select("id,account_id,transfer_account_id,amount,type,metadata,status,related_entity_id,related_entity_type")
    .eq("user_id", userId)
    .or(`account_id.eq.${creditCardAccountId},transfer_account_id.eq.${creditCardAccountId}`)
    .is("deleted_at", null);

  if (error) return { error: error.message };

  const metadata = metadataRecord(debt.metadata);
  let chargedAmount = numericValue(debt.total_amount) || numericValue(metadata.total_amount);
  let repaidAmount = numericValue(debt.repaid_amount) || numericValue(metadata.repaid_amount);

  for (const transaction of data as TransactionRow[]) {
    if (!postedStatusAffectsBalance(transaction.status)) continue;
    const transactionMetadata = metadataRecord(transaction.metadata);
    const primaryDebtLink = transaction.related_entity_type === "debt" && transaction.related_entity_id === debt.id;
    const secondaryDebtLink = metadataString(transactionMetadata, "credit_card_debt_id") === debt.id;
    if (!primaryDebtLink && !secondaryDebtLink) continue;

    const impact = creditCardImpactForTransaction(transaction, creditCardAccountId);
    const amount = Math.abs(numericValue(transaction.amount));
    if (impact === "charge") chargedAmount = roundCurrencyValue(chargedAmount + amount);
    if (impact === "repayment") repaidAmount = roundCurrencyValue(repaidAmount + amount);
  }

  return {
    chargedAmount,
    repaidAmount,
    remainingAmount: roundCurrencyValue(Math.max(chargedAmount - repaidAmount, 0)),
  };
}

async function updateCreditCardDebtSnapshot(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  debt: DebtRow,
  balance: { remainingAmount: number },
) {
  const metadata = metadataRecord(debt.metadata);
  const isManualTerms = isManualCreditCardDebt(debt);
  const nextStatus = balance.remainingAmount <= 0.005 ? "paid" : "active";
  const monthlyPayment = nextStatus === "paid" ? 0 : balance.remainingAmount;
  const currentStatus = String(debt.status ?? metadata.status ?? "").toLowerCase();
  const currentMonthlyPayment = numericValue(metadata.monthly_payment);

  if (isManualTerms) {
    if (balance.remainingAmount > 0.005 || currentStatus === "paid") return null;

    const { error } = await supabase
      .from("debts")
      .update({
        metadata: {
          ...metadata,
          paid_at: new Date().toISOString(),
          status: "paid",
        },
        status: "paid",
      })
      .eq("id", debt.id)
      .eq("user_id", userId);

    return error?.message ?? null;
  }

  if (currentStatus === nextStatus && Math.abs(currentMonthlyPayment - monthlyPayment) <= 0.005) return null;

  const payload = {
    metadata: {
      ...metadata,
      duration_months: 1,
      auto_credit_card_terms: true,
      manual_credit_card_terms: false,
      monthly_payment: monthlyPayment,
      requires_full_payment: true,
      status: nextStatus,
      ...(nextStatus === "paid" ? { paid_at: new Date().toISOString() } : {}),
    },
    monthly_payment: monthlyPayment,
    status: nextStatus,
  };

  const { error } = await supabase
    .from("debts")
    .update(payload)
    .eq("id", debt.id)
    .eq("user_id", userId);

  return error?.message ?? null;
}

async function reconcileCreditCardDebt(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  debtId: string,
) {
  if (!debtId) return null;

  const { data: debtData, error: debtError } = await supabase
    .from("debts")
    .select("id,status,payment_account_id,total_amount,repaid_amount,metadata")
    .eq("id", debtId)
    .eq("user_id", userId)
    .is("deleted_at", null)
    .maybeSingle();

  if (debtError) return debtError.message;
  if (!debtData) return null;

  const debt = debtData as DebtRow;
  const accountId = creditCardDebtAccountId(debt);
  if (!accountId) return null;

  const balance = await creditCardDebtBalance(supabase, userId, debt, accountId);
  if ("error" in balance) return balance.error;
  return updateCreditCardDebtSnapshot(supabase, userId, debt, balance);
}

async function reconcileCreditCardDebtIds(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  debtIds: Array<string | null | undefined>,
) {
  for (const debtId of Array.from(new Set(debtIds.filter((id): id is string => Boolean(id))))) {
    await reconcileCreditCardDebt(supabase, userId, debtId);
  }
}

function normalizeDebtInterestRatePeriod(value: unknown): DebtInterestRatePeriod {
  return String(value ?? "").toLowerCase() === "monthly" ? "Monthly" : "Yearly";
}

function wholeMonthsBetween(startValue: string, endValue: string) {
  const start = parseDateInput(startValue);
  const end = parseDateInput(endValue);
  if (!start || !end || end <= start) return 0;

  const monthCount = (end.getFullYear() - start.getFullYear()) * 12 + end.getMonth() - start.getMonth();
  return Math.max(monthCount + (end.getDate() > start.getDate() ? 1 : 0), 1);
}

function standardDebtTransactionImpact(transaction: TransactionRow) {
  const type = String(transaction.type ?? "").toLowerCase();
  const direction = transferDirection(metadataRecord(transaction.metadata));
  if (type === "transfer" && direction === "credit") return "";
  if (type === "expense" || type === "income" || type === "transfer") return "repayment";
  return "";
}

async function standardDebtRepayments(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  debtId: string,
): Promise<{ error?: string; repayments: DebtDatedRepayment[] }> {
  const { data, error } = await supabase
    .from("transactions")
    .select("id,transaction_date,type,amount,account_id,transfer_account_id,category_id,status,title,description,note,related_entity_type,related_entity_id,metadata")
    .eq("user_id", userId)
    .eq("related_entity_type", "debt")
    .eq("related_entity_id", debtId)
    .is("deleted_at", null);

  if (error) return { error: error.message, repayments: [] };

  return {
    repayments: (data as TransactionRow[]).flatMap((transaction) => {
      if (!postedStatusAffectsBalance(transaction.status)) return [];
      if (!standardDebtTransactionImpact(transaction)) return [];
      const amountValue = Math.abs(numericValue(transaction.amount));
      const dateValue = transaction.transaction_date ?? "";
      if (amountValue <= 0 || !dateValue) return [];
      return [{ amountValue, dateValue }];
    }),
  };
}

async function reconcileStandardDebt(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  debtId: string,
) {
  if (!debtId) return null;

  const { data: debtData, error: debtError } = await supabase
    .from("debts")
    .select("id,status,payment_account_id,total_amount,repaid_amount,metadata,type,interest_rate,start_date,next_payment_date,monthly_payment")
    .eq("id", debtId)
    .eq("user_id", userId)
    .is("deleted_at", null)
    .maybeSingle();

  if (debtError) return debtError.message;
  if (!debtData) return null;

  const debt = debtData as DebtRow;
  if (isCreditCardDebt(debt) || debtStatusKey(debt) === "archived") return null;

  const metadata = metadataRecord(debt.metadata);
  const principal = numericValue(debt.total_amount) || numericValue(metadata.total_amount);
  const startDate = debt.start_date ?? metadataString(metadata, "start_date");
  if (principal <= 0 || !startDate) return null;

  const repaymentsResult = await standardDebtRepayments(supabase, userId, debtId);
  if (repaymentsResult.error) return repaymentsResult.error;

  const payoffDate = metadataString(metadata, "payoff_date");
  const durationMonths = Math.max(numericValue(metadata.duration_months, wholeMonthsBetween(startDate, payoffDate)), 0);
  const currentStatus = debtStatusKey(debt);
  const settledAt = metadataString(metadata, "early_payoff_date") || metadataString(metadata, "paid_at").slice(0, 10);
  const hasEarlyPayoffSettlement = metadata.early_payoff === true
    || (currentStatus === "paid" && numericValue(metadata.remaining_principal) <= 0.005 && Boolean(settledAt));
  const summary = calculateDebtPayoffSummary({
    interestRate: numericValue(debt.interest_rate) || numericValue(metadata.interest_rate),
    interestRatePeriod: normalizeDebtInterestRatePeriod(metadata.interest_rate_period),
    numberOfMonths: durationMonths,
    openingRepaidAmount: numericValue(debt.repaid_amount) || numericValue(metadata.repaid_amount),
    principal,
    referenceDate: formatDateInput(new Date()),
    repayments: repaymentsResult.repayments,
    settledAt,
    settledEarly: hasEarlyPayoffSettlement,
    startDate,
  });
  const nextStatus = summary.isPaidOff ? "paid" : "active";
  if (!summary.isPaidOff && currentStatus !== "paid") return null;

  const reconciledAt = new Date().toISOString();
  const nextMetadata = {
    ...metadata,
    early_payoff: summary.isEarlyPayoff,
    early_payoff_amount: summary.isEarlyPayoff ? summary.settlementAmount : null,
    early_payoff_date: summary.isEarlyPayoff ? summary.paidAt : null,
    early_payoff_interest_amount: summary.isEarlyPayoff ? summary.settlementInterestAmount : null,
    early_payoff_principal_amount: summary.isEarlyPayoff ? summary.settlementPrincipalAmount : null,
    last_debt_reconciled_at: reconciledAt,
    paid_at: summary.isPaidOff ? metadataString(metadata, "paid_at") || (summary.paidAt ? `${summary.paidAt}T00:00:00.000Z` : reconciledAt) : null,
    principal_paid: summary.principalPaid,
    remaining_principal: summary.remainingPrincipal,
    status: nextStatus,
  };

  const { error } = await supabase
    .from("debts")
    .update({
      metadata: nextMetadata,
      monthly_payment: summary.isPaidOff ? 0 : numericValue(debt.monthly_payment) || numericValue(metadata.monthly_payment),
      next_payment_date: summary.isPaidOff ? null : debt.next_payment_date ?? (metadataString(metadata, "next_payment_date") || null),
      status: nextStatus,
    })
    .eq("id", debtId)
    .eq("user_id", userId);

  return error?.message ?? null;
}

async function reconcileStandardDebtIds(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  debtIds: Array<string | null | undefined>,
) {
  for (const debtId of Array.from(new Set(debtIds.filter((id): id is string => Boolean(id))))) {
    await reconcileStandardDebt(supabase, userId, debtId);
  }
}

async function reconcileDebtIds(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  debtIds: Array<string | null | undefined>,
) {
  const uniqueDebtIds = Array.from(new Set(debtIds.filter((id): id is string => Boolean(id))));
  await reconcileCreditCardDebtIds(supabase, userId, uniqueDebtIds);
  await reconcileStandardDebtIds(supabase, userId, uniqueDebtIds);
}

async function getDebtIdsForTransactionIds(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  transactionIds: string[],
) {
  if (transactionIds.length === 0) return [];

  const { data, error } = await supabase
    .from("transactions")
    .select("metadata,related_entity_id,related_entity_type")
    .eq("user_id", userId)
    .in("id", transactionIds);

  if (error) throw new Error(error.message);
  const debtIds = new Set<string>();
  for (const transaction of data as Pick<TransactionRow, "metadata" | "related_entity_id" | "related_entity_type">[]) {
    if (transaction.related_entity_type === "debt" && transaction.related_entity_id) debtIds.add(transaction.related_entity_id);
    const creditCardDebtId = metadataString(metadataRecord(transaction.metadata), "credit_card_debt_id");
    if (creditCardDebtId) debtIds.add(creditCardDebtId);
  }
  return [...debtIds];
}

async function findCreditCardDebtId(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  account: AccountRow,
  referenceDateValue: string | undefined,
  options: { createIfMissing: boolean; initialChargeAmount?: number },
) {
  const { data: debts, error: debtsError } = await supabase
    .from("debts")
    .select("id,status,payment_account_id,total_amount,repaid_amount,metadata")
    .eq("user_id", userId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false });

  if (debtsError) return { error: debtsError.message };

  const debtRows = (debts as DebtRow[]).filter((debt) => debtStatusKey(debt) !== "archived");
  const creditCardDebtIds = new Set(debtRows
    .filter((debt) => creditCardDebtAccountId(debt) === account.id)
    .map((debt) => debt.id));
  const { data: linkedTransactions, error: linkedError } = await supabase
    .from("transactions")
    .select("related_entity_id")
    .eq("user_id", userId)
    .eq("related_entity_type", "debt")
    .or(`account_id.eq.${account.id},transfer_account_id.eq.${account.id}`)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(50);

  if (linkedError) return { error: linkedError.message };

  for (const transaction of linkedTransactions as Pick<TransactionRow, "related_entity_id">[]) {
    if (transaction.related_entity_id) creditCardDebtIds.add(transaction.related_entity_id);
  }

  const creditCardDebtRows = debtRows.filter((debt) => creditCardDebtIds.has(debt.id));

  for (const debt of creditCardDebtRows.filter((row) => debtStatusKey(row) !== "paid")) {
    const balance = await creditCardDebtBalance(supabase, userId, debt, account.id);
    if ("error" in balance) return { error: balance.error };
    const snapshotError = await updateCreditCardDebtSnapshot(supabase, userId, debt, balance);
    if (snapshotError) return { error: snapshotError };
    if (balance.remainingAmount > 0.005) return { debtId: debt.id };
  }

  if (!options.createIfMissing) return { debtId: null };

  const metadata = metadataRecord(account.metadata);
  const creditLimit = creditLimitFromMetadata(metadata);
  const creditStatementDay = dayOfMonthValue(metadata.credit_statement_day);
  const creditPaymentDueDay = dayOfMonthValue(metadata.credit_payment_due_day);
  const creditMinimumPayment = Math.max(numericValue(metadata.credit_minimum_payment), 0);
  const monthlyPayment = Math.max(numericValue(options.initialChargeAmount), 0);
  const startDate = parseDateInput(referenceDateValue) ?? new Date();
  const startDateValue = formatDateInput(startDate);
  const nextPaymentDateValue = creditPaymentDueDay
    ? formatDateInput(nextMonthlyDateForDay(creditPaymentDueDay, startDate))
    : formatDateInput(addMonths(startDate, 1));
  const categoryId = await findOrCreateCreditCardDebtCategoryId(supabase, userId);
  const debtPayload = {
    category_id: categoryId,
    description: `Automatically tracks credit card transactions for ${account.name ?? "Credit Card"}.`,
    lender: account.name ?? "Credit Card",
    metadata: {
      auto_credit_card_account_id: account.id,
      auto_credit_card_terms: true,
      category_id: categoryId,
      credit_card_account_id: account.id,
      credit_minimum_payment: creditMinimumPayment,
      credit_payment_due_day: creditPaymentDueDay,
      credit_statement_day: creditStatementDay,
      duration_months: 1,
      interest_rate: 0,
      interest_rate_period: "yearly",
      lender: account.name ?? "Credit Card",
      monthly_payment: monthlyPayment,
      next_payment_date: nextPaymentDateValue,
      notes: `Automatically tracks credit card transactions for ${account.name ?? "Credit Card"}.`,
      payment_account_id: account.id,
      payoff_date: nextPaymentDateValue,
      repaid_amount: 0,
      requires_full_payment: true,
      manual_credit_card_terms: false,
      start_date: startDateValue,
      status: "active",
      total_amount: 0,
      type: "Credit Card",
      ...(creditLimit > 0 ? { credit_limit: creditLimit } : {}),
    },
    monthly_payment: monthlyPayment,
    name: `${account.name ?? "Credit Card"} Credit Card Debt`,
    next_payment_date: nextPaymentDateValue,
    payment_account_id: account.id,
    repaid_amount: 0,
    start_date: startDateValue,
    status: "active",
    total_amount: 0,
    type: "Credit Card",
    user_id: userId,
  };

  const { data: createdDebt, error: createError } = await supabase
    .from("debts")
    .insert(debtPayload)
    .select("id")
    .single();

  if (createError) return { error: createError.message };
  return { debtId: createdDebt.id as string };
}

async function resolveCreditCardDebtLink(input: TransactionFormData, userId: string): Promise<CreditCardDebtResolution | { error: string }> {
  const accountResult = await getCreditCardAccountForTransaction(input, userId);
  if ("error" in accountResult) return { error: accountResult.error ?? "Unable to load credit card account." };
  if (!accountResult.account) return { debtId: "", input, metadata: {} };

  const impact = creditCardImpactForInput(input, accountResult.account.id);
  if (!impact) return { debtId: "", input, metadata: {} };

  const { supabase } = await authenticatedClient();
  const debtResult = await findCreditCardDebtId(supabase, userId, accountResult.account, input.date, {
    createIfMissing: impact === "charge",
    initialChargeAmount: impact === "charge" ? input.amount : 0,
  });
  if ("error" in debtResult) return { error: debtResult.error ?? "Unable to load credit card debt." };
  if (!debtResult.debtId) {
    return {
      debtId: "",
      input: input.relatedEntityType === "debt" && !input.relatedEntityId
        ? { ...input, relatedEntityId: "", relatedEntityType: "none" as const }
        : input,
      metadata: {},
    };
  }

  if (input.relatedEntityType === "debt" || input.relatedEntityType === "none") {
    return {
      debtId: debtResult.debtId,
      input: {
        ...input,
        relatedEntityId: debtResult.debtId,
        relatedEntityType: "debt" as const,
      },
      metadata: {},
    };
  }

  return {
    debtId: debtResult.debtId,
    input,
    metadata: {
      credit_card_account_id: accountResult.account.id,
      credit_card_debt_id: debtResult.debtId,
      credit_card_debt_impact: impact,
      secondary_related_entity_id: debtResult.debtId,
      secondary_related_entity_type: "debt",
    },
  };
}

async function getLinkedTransactionIds(supabase: Awaited<ReturnType<typeof createClient>>, userId: string, transaction: Pick<TransactionRow, "id" | "metadata">) {
  const metadata = metadataRecord(transaction.metadata);
  const groupId = transferGroupId(metadata);
  if (!groupId) return [transaction.id];

  const { data, error } = await supabase
    .from("transactions")
    .select("id")
    .eq("user_id", userId)
    .is("deleted_at", null)
    .or(`metadata->>transfer_group_id.eq.${groupId},metadata->>same_account_transfer_group_id.eq.${groupId}`);

  if (error) throw new Error(error.message);
  const ids = (data as Pick<TransactionRow, "id">[]).map((row) => row.id);
  return ids.length > 0 ? ids : [transaction.id];
}

async function fetchTransactionForMutation(supabase: Awaited<ReturnType<typeof createClient>>, userId: string, transactionId: string) {
  const { data, error } = await supabase
    .from("transactions")
    .select("id,metadata,related_entity_id,related_entity_type,type")
    .eq("id", transactionId)
    .eq("user_id", userId)
    .is("deleted_at", null)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return data as MutationTransaction | null;
}

async function archiveLinkedTransactions(supabase: Awaited<ReturnType<typeof createClient>>, userId: string, transaction: Pick<TransactionRow, "id" | "metadata">) {
  const linkedIds = await getLinkedTransactionIds(supabase, userId, transaction);
  const { error } = await supabase
    .from("transactions")
    .update({ deleted_at: new Date().toISOString() })
    .eq("user_id", userId)
    .in("id", linkedIds);

  if (error) throw new Error(error.message);
  return linkedIds;
}

function linkedDebtIdFromInput(input: TransactionFormData) {
  return input.relatedEntityType === "debt" ? input.relatedEntityId : "";
}

function linkedSubscriptionIdFromInput(input: TransactionFormData) {
  return input.relatedEntityType === "subscription" ? input.relatedEntityId : "";
}

async function getSubscriptionIdsForTransactionIds(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  transactionIds: string[],
) {
  if (transactionIds.length === 0) return [];

  const { data, error } = await supabase
    .from("transactions")
    .select("related_entity_id,related_entity_type")
    .eq("user_id", userId)
    .in("id", transactionIds);

  if (error) throw new Error(error.message);
  return (data as Pick<TransactionRow, "related_entity_id" | "related_entity_type">[])
    .filter((transaction) => transaction.related_entity_type === "subscription" && transaction.related_entity_id)
    .map((transaction) => transaction.related_entity_id as string);
}

function normalizeBillingCycle(value: unknown) {
  const cycle = String(value ?? "").trim().toLowerCase();
  if (cycle === "weekly") return "weekly";
  if (cycle === "yearly" || cycle === "annual") return "yearly";
  return "monthly";
}

function normalizeCurrency(value: unknown) {
  const currency = typeof value === "string" ? value.trim().toUpperCase() : "";
  return currency || SYSTEM_CURRENCY;
}

function positiveNumber(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : 0;
}

async function subscriptionPaymentMetadataForInput(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  input: TransactionFormData,
): Promise<{ error?: string; metadata: TransactionExtraMetadata }> {
  if (input.relatedEntityType !== "subscription" || !input.relatedEntityId) return { metadata: {} };

  const { data, error } = await supabase
    .from("subscriptions")
    .select("id,amount,billing_cycle,next_billing_date,status,metadata")
    .eq("id", input.relatedEntityId)
    .eq("user_id", userId)
    .is("deleted_at", null)
    .maybeSingle();

  if (error) return { error: error.message, metadata: {} };
  if (!data) return { metadata: {} };

  const subscription = data as SubscriptionRow;
  const metadata = metadataRecord(subscription.metadata);
  const billingCurrency = normalizeCurrency(input.subscriptionPayment?.billingCurrency ?? metadata.billing_currency);
  const configuredBilledAmount = positiveNumber(metadata.billed_amount) || positiveNumber(subscription.amount);
  const configuredExchangeRate = billingCurrency === SYSTEM_CURRENCY
    ? 1
    : positiveNumber(metadata.exchange_rate) || (configuredBilledAmount > 0 ? roundCurrencyValue(positiveNumber(subscription.amount) / configuredBilledAmount) : 0);
  const billedAmount = positiveNumber(input.subscriptionPayment?.billedAmount) || configuredBilledAmount;
  const exchangeRate = billingCurrency === SYSTEM_CURRENCY
    ? 1
    : positiveNumber(input.subscriptionPayment?.exchangeRate) || configuredExchangeRate;
  const expectedPaymentAmount = roundCurrencyValue(billedAmount * exchangeRate);
  const configuredPaymentAmount = roundCurrencyValue(billedAmount * configuredExchangeRate);
  const billingDueDate = input.subscriptionPayment?.billingDueDate
    || subscription.next_billing_date
    || metadataString(metadata, "next_billing_date")
    || metadataString(metadata, "billing_anchor_date")
    || input.date;

  return {
    metadata: {
      subscription_billed_amount: billedAmount,
      subscription_billing_currency: billingCurrency,
      subscription_billing_cycle: normalizeBillingCycle(subscription.billing_cycle ?? metadata.billing_cycle),
      subscription_billing_due_date: billingDueDate,
      subscription_configured_exchange_rate: configuredExchangeRate,
      subscription_exchange_difference_amount: roundCurrencyValue(input.amount - configuredPaymentAmount),
      subscription_expected_payment_amount: expectedPaymentAmount,
      subscription_payment_amount: input.amount,
      subscription_payment_exchange_rate: exchangeRate,
    },
  };
}

function addBillingCycle(date: Date, cycle: string) {
  if (cycle === "weekly") return addDays(date, 7);
  if (cycle === "yearly") return addYears(date, 1);
  return addMonths(date, 1);
}

function isReversalTransaction(transaction: Pick<TransactionRow, "metadata" | "status">) {
  const metadata = metadataRecord(transaction.metadata);
  return postedStatusAffectsBalance(transaction.status) && typeof metadata.reversed_transaction_id === "string" && metadata.reversed_transaction_id;
}

function isPostedSubscriptionExpense(transaction: TransactionRow, reversedTransactionIds: Set<string>) {
  return (
    String(transaction.type ?? "").toLowerCase() === "expense" &&
    postedStatusAffectsBalance(transaction.status) &&
    !reversedTransactionIds.has(transaction.id)
  );
}

function compareSubscriptionPayments(first: SubscriptionPaymentEvidence, second: SubscriptionPaymentEvidence) {
  if (first.paymentDate !== second.paymentDate) return first.paymentDate.localeCompare(second.paymentDate);
  return first.id.localeCompare(second.id);
}

function subscriptionBillingAnchor(subscription: SubscriptionRow, metadata: Record<string, unknown>) {
  return metadataString(metadata, "billing_anchor_date")
    || subscription.next_billing_date
    || metadataString(metadata, "next_billing_date")
    || metadataString(metadata, "start_date")
    || formatDateInput(new Date());
}

function previousBillingCycleDate(date: Date, cycle: string) {
  if (cycle === "weekly") return addDays(date, -7);
  if (cycle === "yearly") return addYears(date, -1);
  return addMonths(date, -1);
}

function paymentEvidenceFromTransaction(transaction: TransactionRow): SubscriptionPaymentEvidence {
  const metadata = metadataRecord(transaction.metadata);
  const amount = Math.abs(numericValue(transaction.amount));
  const billedAmount = positiveNumber(metadata.subscription_billed_amount);
  const exchangeRate = positiveNumber(metadata.subscription_payment_exchange_rate);
  return {
    amount,
    billedAmount,
    billingCurrency: metadataString(metadata, "subscription_billing_currency"),
    billingDueDate: metadataString(metadata, "subscription_billing_due_date"),
    configuredExchangeRate: positiveNumber(metadata.subscription_configured_exchange_rate),
    exchangeRate: exchangeRate || (billedAmount > 0 ? roundCurrencyValue(amount / billedAmount) : 0),
    id: transaction.id,
    note: transaction.note ?? transaction.description ?? transaction.title ?? null,
    paymentDate: transaction.transaction_date ?? formatDateInput(new Date()),
    source: "linked_transaction",
    transactionId: transaction.id,
  };
}

function paymentEvidenceFromPaymentRow(payment: SubscriptionPaymentRow): SubscriptionPaymentEvidence {
  const metadata = metadataRecord(payment.metadata);
  const amount = Math.abs(numericValue(payment.amount));
  const billedAmount = positiveNumber(metadata.billed_amount);
  const exchangeRate = positiveNumber(metadata.payment_exchange_rate);
  return {
    amount,
    billedAmount,
    billingCurrency: metadataString(metadata, "billing_currency"),
    billingDueDate: metadataString(metadata, "billing_due_date"),
    configuredExchangeRate: positiveNumber(metadata.configured_exchange_rate),
    exchangeRate: exchangeRate || (billedAmount > 0 ? roundCurrencyValue(amount / billedAmount) : 0),
    id: payment.id,
    note: payment.note,
    paymentDate: payment.payment_date ?? formatDateInput(new Date()),
    source: "payment_record",
    transactionId: payment.transaction_id,
  };
}

function isGeneratedSubscriptionPayment(payment: SubscriptionPaymentRow) {
  return metadataRecord(payment.metadata).source === "linked_transaction";
}

function legacySubscriptionPaymentCutoff(subscription: SubscriptionRow, metadata: Record<string, unknown>, cycle: string, anchorValue: string) {
  const existingCutoff = metadataString(metadata, "subscription_payment_cutoff_date");
  if (existingCutoff) return existingCutoff;
  if (metadataString(metadata, "billing_anchor_date")) return "";

  const anchorDate = parseDateInput(anchorValue) ?? parseDateInput(subscription.next_billing_date);
  return anchorDate ? formatDateInput(previousBillingCycleDate(anchorDate, cycle)) : "";
}

function buildSubscriptionPaymentSchedule(subscription: SubscriptionRow, payments: SubscriptionPaymentEvidence[]) {
  const metadata = metadataRecord(subscription.metadata);
  const cycle = normalizeBillingCycle(subscription.billing_cycle ?? metadata.billing_cycle);
  const anchorValue = subscriptionBillingAnchor(subscription, metadata);
  const cutoffDate = legacySubscriptionPaymentCutoff(subscription, metadata, cycle, anchorValue);
  let dueDate = parseDateInput(anchorValue) ?? new Date();
  const sortedPayments = payments
    .filter((payment) => payment.billingDueDate || !cutoffDate || payment.paymentDate >= cutoffDate)
    .sort(compareSubscriptionPayments);
  const snapshots = sortedPayments.map((payment) => {
    const billingDueDate = payment.billingDueDate || formatDateInput(dueDate);
    const explicitDueDate = parseDateInput(billingDueDate);
    dueDate = addBillingCycle(explicitDueDate && explicitDueDate > dueDate ? explicitDueDate : dueDate, cycle);
    return {
      billingDueDate,
      payment,
    };
  });

  return {
    anchorDate: anchorValue,
    cutoffDate,
    nextBillingDate: formatDateInput(dueDate),
    snapshots,
  };
}

async function reconcileSubscriptionPayments(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  subscriptionId: string,
) {
  if (!subscriptionId) return null;

  const { data: subscriptionData, error: subscriptionError } = await supabase
    .from("subscriptions")
    .select("id,amount,billing_cycle,next_billing_date,status,metadata")
    .eq("id", subscriptionId)
    .eq("user_id", userId)
    .is("deleted_at", null)
    .maybeSingle();

  if (subscriptionError) return subscriptionError.message;
  if (!subscriptionData) return null;

  const subscription = subscriptionData as SubscriptionRow;
  const { data: transactionData, error: transactionError } = await supabase
    .from("transactions")
    .select("id,transaction_date,type,amount,account_id,transfer_account_id,category_id,status,title,description,note,related_entity_type,related_entity_id,metadata")
    .eq("user_id", userId)
    .eq("related_entity_type", "subscription")
    .eq("related_entity_id", subscriptionId)
    .is("deleted_at", null);

  if (transactionError) return transactionError.message;

  const { data: paymentData, error: paymentError } = await supabase
    .from("subscription_payments")
    .select("id,subscription_id,transaction_id,amount,payment_date,note,metadata,created_at")
    .eq("user_id", userId)
    .eq("subscription_id", subscriptionId);

  if (paymentError) return paymentError.message;

  const transactionRows = transactionData as TransactionRow[];
  const reversedTransactionIds = new Set(
    transactionRows
      .map((transaction) => isReversalTransaction(transaction))
      .filter((id): id is string => Boolean(id)),
  );
  const existingPaymentRows = paymentData as SubscriptionPaymentRow[];
  const manualPaymentEvidences = existingPaymentRows
    .filter((payment) => !isGeneratedSubscriptionPayment(payment))
    .map(paymentEvidenceFromPaymentRow);
  const manualPaymentTransactionIds = new Set(manualPaymentEvidences.map((payment) => payment.transactionId).filter((id): id is string => Boolean(id)));
  const linkedPaymentEvidences = transactionRows
    .filter((transaction) => isPostedSubscriptionExpense(transaction, reversedTransactionIds))
    .filter((transaction) => !manualPaymentTransactionIds.has(transaction.id))
    .map(paymentEvidenceFromTransaction);
  const paymentSchedule = buildSubscriptionPaymentSchedule(subscription, [...manualPaymentEvidences, ...linkedPaymentEvidences]);
  const paymentSnapshots = paymentSchedule.snapshots;
  const metadata = metadataRecord(subscription.metadata);
  const defaultBillingCurrency = normalizeCurrency(metadata.billing_currency);
  const defaultBilledAmount = positiveNumber(metadata.billed_amount) || positiveNumber(subscription.amount);
  const defaultExchangeRate = defaultBillingCurrency === SYSTEM_CURRENCY
    ? 1
    : positiveNumber(metadata.exchange_rate) || (defaultBilledAmount > 0 ? roundCurrencyValue(positiveNumber(subscription.amount) / defaultBilledAmount) : 0);
  const lastSnapshot = paymentSnapshots[paymentSnapshots.length - 1];
  const lastPayment = lastSnapshot?.payment;

  const { error: deletePaymentError } = await supabase
    .from("subscription_payments")
    .delete()
    .eq("user_id", userId)
    .eq("subscription_id", subscriptionId)
    .eq("metadata->>source", "linked_transaction");

  if (deletePaymentError) return deletePaymentError.message;

  const linkedPaymentSnapshots = paymentSnapshots.filter(({ payment }) => payment.source === "linked_transaction" && payment.transactionId);
  if (linkedPaymentSnapshots.length > 0) {
    const { error: insertPaymentError } = await supabase.from("subscription_payments").insert(
      linkedPaymentSnapshots.map(({ billingDueDate, payment }) => {
        const billingCurrency = payment.billingCurrency || defaultBillingCurrency;
        const billedAmount = payment.billedAmount || defaultBilledAmount;
        const exchangeRate = billingCurrency === SYSTEM_CURRENCY ? 1 : payment.exchangeRate || defaultExchangeRate;
        const configuredExchangeRate = billingCurrency === SYSTEM_CURRENCY ? 1 : payment.configuredExchangeRate || defaultExchangeRate;

        return {
          amount: payment.amount,
          metadata: {
            billed_amount: billedAmount,
            billing_currency: billingCurrency,
            billing_due_date: billingDueDate,
            billing_cycle: normalizeBillingCycle(subscription.billing_cycle ?? metadata.billing_cycle),
            configured_exchange_rate: configuredExchangeRate,
            exchange_difference_amount: roundCurrencyValue(payment.amount - (billedAmount * configuredExchangeRate)),
            payment_exchange_rate: exchangeRate,
            source: "linked_transaction",
          },
          note: payment.note,
          payment_date: payment.paymentDate,
          subscription_id: subscriptionId,
          transaction_id: payment.transactionId,
          user_id: userId,
        };
      }),
    );

    if (insertPaymentError) return insertPaymentError.message;
  }

  const { error: updateSubscriptionError } = await supabase
    .from("subscriptions")
    .update({
      metadata: {
        ...metadata,
        billing_anchor_date: paymentSchedule.anchorDate,
        last_paid_billing_date: lastSnapshot?.billingDueDate ?? null,
        last_payment_billed_amount: lastPayment?.billedAmount || defaultBilledAmount || null,
        last_payment_billing_currency: lastPayment?.billingCurrency || defaultBillingCurrency,
        last_payment_configured_exchange_rate: lastPayment?.configuredExchangeRate || defaultExchangeRate || null,
        last_payment_exchange_rate: lastPayment?.exchangeRate || defaultExchangeRate || null,
        last_payment_amount: lastPayment?.amount ?? null,
        last_payment_date: lastPayment?.paymentDate ?? null,
        last_payment_transaction_id: lastPayment?.transactionId ?? null,
        last_subscription_reconciled_at: new Date().toISOString(),
        next_billing_date: paymentSchedule.nextBillingDate,
        paid_cycle_count: paymentSnapshots.length,
        subscription_payment_cutoff_date: paymentSchedule.cutoffDate || null,
      },
      next_billing_date: paymentSchedule.nextBillingDate,
    })
    .eq("id", subscriptionId)
    .eq("user_id", userId);

  return updateSubscriptionError?.message ?? null;
}

async function reconcileSubscriptionIds(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  subscriptionIds: Array<string | null | undefined>,
) {
  for (const subscriptionId of Array.from(new Set(subscriptionIds.filter((id): id is string => Boolean(id))))) {
    await reconcileSubscriptionPayments(supabase, userId, subscriptionId);
  }
}

export async function createTransaction(input: TransactionFormData): Promise<ActionResult> {
  const { supabase, user } = await authenticatedClient();
  if (!user) return { error: "You must be signed in." };
  const validationError = await validateAvailableAmount(input, user.id);
  if (validationError) return { error: validationError };
  const creditCardDebtResolution = await resolveCreditCardDebtLink(input, user.id);
  if ("error" in creditCardDebtResolution) return { error: creditCardDebtResolution.error };
  const resolvedInput = creditCardDebtResolution.input;
  const subscriptionMetadataResult = await subscriptionPaymentMetadataForInput(supabase, user.id, resolvedInput);
  if (subscriptionMetadataResult.error) return { error: subscriptionMetadataResult.error };
  const extraMetadata = {
    ...creditCardDebtResolution.metadata,
    ...subscriptionMetadataResult.metadata,
  };
  let transactionIds: string[] = [];
  if (resolvedInput.type === "Transfer") {
    const { data, error } = await supabase.from("transactions").insert(transferPairPayload(resolvedInput, user.id, randomUUID(), extraMetadata)).select("id");
    if (error) return { error: transactionMutationError(error.message) };
    transactionIds = (data as Pick<TransactionRow, "id">[] | null)?.map((transaction) => transaction.id) ?? [];
  } else {
    const { data, error } = await supabase.from("transactions").insert({ ...singleTransactionPayload(resolvedInput, extraMetadata), user_id: user.id }).select("id").maybeSingle();
    if (error) return { error: transactionMutationError(error.message) };
    if (data?.id) transactionIds = [data.id as string];
  }
  await reconcileDebtIds(supabase, user.id, [linkedDebtIdFromInput(resolvedInput), creditCardDebtResolution.debtId]);
  await reconcileSubscriptionIds(supabase, user.id, [linkedSubscriptionIdFromInput(resolvedInput)]);
  revalidateTransactionLinkedPaths();
  return { transactionIds };
}

export async function updateTransaction(transactionId: string, input: TransactionFormData): Promise<ActionResult> {
  const { supabase, user } = await authenticatedClient();
  if (!user) return { error: "You must be signed in." };
  let existingTransaction: MutationTransaction | null;
  let ignoredTransactionIds: string[];
  let previousDebtIds: string[];
  let previousSubscriptionIds: string[];
  try {
    existingTransaction = await fetchTransactionForMutation(supabase, user.id, transactionId);
    if (!existingTransaction) return { error: "Transaction not found." };
    ignoredTransactionIds = await getLinkedTransactionIds(supabase, user.id, existingTransaction);
    previousDebtIds = await getDebtIdsForTransactionIds(supabase, user.id, ignoredTransactionIds);
    previousSubscriptionIds = await getSubscriptionIdsForTransactionIds(supabase, user.id, ignoredTransactionIds);
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Unable to load transaction." };
  }

  const validationError = await validateAvailableAmount(input, user.id, ignoredTransactionIds);
  if (validationError) return { error: validationError };
  const creditCardDebtResolution = await resolveCreditCardDebtLink(input, user.id);
  if ("error" in creditCardDebtResolution) return { error: creditCardDebtResolution.error };
  const resolvedInput = creditCardDebtResolution.input;
  const subscriptionMetadataResult = await subscriptionPaymentMetadataForInput(supabase, user.id, resolvedInput);
  if (subscriptionMetadataResult.error) return { error: subscriptionMetadataResult.error };
  const extraMetadata = {
    ...creditCardDebtResolution.metadata,
    ...subscriptionMetadataResult.metadata,
  };

  const existingGroupId = transferGroupId(metadataRecord(existingTransaction.metadata));
  const existingType = String(existingTransaction.type ?? "").toLowerCase();
  const shouldReplaceRows = resolvedInput.type === "Transfer" || existingGroupId || existingType === "transfer";

  if (shouldReplaceRows) {
    try {
      await archiveLinkedTransactions(supabase, user.id, existingTransaction);
    } catch (error) {
      return { error: error instanceof Error ? error.message : "Unable to update transaction." };
    }

    if (resolvedInput.type === "Transfer") {
      const { error } = await supabase.from("transactions").insert(transferPairPayload(resolvedInput, user.id, existingGroupId || randomUUID(), extraMetadata));
      if (error) return { error: transactionMutationError(error.message) };
    } else {
      const { error } = await supabase.from("transactions").insert({ ...singleTransactionPayload(resolvedInput, extraMetadata), user_id: user.id });
      if (error) return { error: transactionMutationError(error.message) };
    }
    await reconcileDebtIds(supabase, user.id, [...previousDebtIds, linkedDebtIdFromInput(resolvedInput), creditCardDebtResolution.debtId]);
    await reconcileSubscriptionIds(supabase, user.id, [...previousSubscriptionIds, linkedSubscriptionIdFromInput(resolvedInput)]);
    revalidateTransactionLinkedPaths([`/transactions/${transactionId}/edit`]);
    return {};
  }

  const { data, error } = await supabase.from("transactions").update(singleTransactionPayload(resolvedInput, extraMetadata)).eq("id", transactionId).eq("user_id", user.id).select("id").maybeSingle();
  if (error) return { error: transactionMutationError(error.message) };
  if (!data) return { error: "Transaction not found." };
  await reconcileDebtIds(supabase, user.id, [...previousDebtIds, linkedDebtIdFromInput(resolvedInput), creditCardDebtResolution.debtId]);
  await reconcileSubscriptionIds(supabase, user.id, [...previousSubscriptionIds, linkedSubscriptionIdFromInput(resolvedInput)]);
  revalidateTransactionLinkedPaths([`/transactions/${transactionId}/edit`]);
  return {};
}

export async function deleteTransaction(transactionId: string): Promise<ActionResult> {
  const { supabase, user } = await authenticatedClient();
  if (!user) return { error: "You must be signed in." };

  let transaction: MutationTransaction | null;
  try {
    transaction = await fetchTransactionForMutation(supabase, user.id, transactionId);
    if (!transaction) return { error: "Transaction not found." };
    const linkedIds = await getLinkedTransactionIds(supabase, user.id, transaction);
    const previousDebtIds = await getDebtIdsForTransactionIds(supabase, user.id, linkedIds);
    const previousSubscriptionIds = await getSubscriptionIdsForTransactionIds(supabase, user.id, linkedIds);
    const transactionIds = await archiveLinkedTransactions(supabase, user.id, transaction);
    await reconcileDebtIds(supabase, user.id, previousDebtIds);
    await reconcileSubscriptionIds(supabase, user.id, previousSubscriptionIds);
    revalidateTransactionLinkedPaths();
    return { transactionIds };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Unable to delete transaction." };
  }
}

export async function reverseTransaction(transactionId: string): Promise<ActionResult> {
  const { supabase, user } = await authenticatedClient();
  if (!user) return { error: "You must be signed in." };

  const { data, error: fetchError } = await supabase
    .from("transactions")
    .select("id,transaction_date,type,amount,account_id,transfer_account_id,category_id,status,title,description,note,related_entity_type,related_entity_id,metadata")
    .eq("id", transactionId)
    .eq("user_id", user.id)
    .is("deleted_at", null)
    .maybeSingle();

  if (fetchError) return { error: fetchError.message };
  if (!data) return { error: "Transaction not found." };

  const source = data as TransactionRow;
  const sourceType = String(source.type ?? "").toLowerCase();
  const metadata = metadataRecord(source.metadata);
  const groupId = transferGroupId(metadata);
  const reversalType = sourceType === "income" ? "expense" : sourceType === "expense" ? "income" : "transfer";
  const reversalNote = `Reversal of ${source.title || source.note || source.id}`;

  if (sourceType === "transfer") {
    let debitRow = source;
    let creditRow: TransactionRow | null = null;

    if (groupId) {
      const { data: groupRows, error: groupError } = await supabase
        .from("transactions")
        .select("id,transaction_date,type,amount,account_id,transfer_account_id,category_id,status,title,description,note,related_entity_type,related_entity_id,metadata")
        .eq("user_id", user.id)
        .is("deleted_at", null)
        .or(`metadata->>transfer_group_id.eq.${groupId},metadata->>same_account_transfer_group_id.eq.${groupId}`);

      if (groupError) return { error: groupError.message };
      const rows = groupRows as TransactionRow[];
      debitRow = rows.find((row) => transferDirection(metadataRecord(row.metadata)) === "debit") ?? source;
      creditRow = rows.find((row) => transferDirection(metadataRecord(row.metadata)) === "credit") ?? null;
    }

    const debitMetadata = metadataRecord(debitRow.metadata);
    const creditMetadata = metadataRecord(creditRow?.metadata);
    const reverseInput: TransactionFormData = {
      accountId: creditRow?.account_id ?? debitRow.transfer_account_id ?? "",
      accountAmountType: normalizeAmountType(creditMetadata.account_amount_type ?? debitMetadata.transfer_account_amount_type ?? debitMetadata.account_amount_type),
      amount: numericValue(debitRow.amount),
      categoryId: "",
      date: new Date().toISOString().slice(0, 10),
      note: reversalNote,
      relatedEntityId: debitRow.related_entity_id ?? "",
      relatedEntityType: normalizeRelatedTypeForAction(debitRow.related_entity_type),
      status: "cleared",
      title: reversalNote,
      transferAccountId: debitRow.account_id ?? "",
      transferAccountAmountType: normalizeAmountType(debitMetadata.account_amount_type),
      type: "Transfer",
    };

    const { error } = await supabase.from("transactions").insert(transferPairPayload(reverseInput, user.id));
    if (error) return { error: transactionMutationError(error.message) };
    await reconcileDebtIds(supabase, user.id, [linkedDebtIdFromInput(reverseInput)]);
    await reconcileSubscriptionIds(supabase, user.id, [linkedSubscriptionIdFromInput(reverseInput)]);
    revalidateTransactionLinkedPaths();
    return {};
  }

  const { error } = await supabase.from("transactions").insert({
    account_id: sourceType === "transfer" ? source.transfer_account_id : source.account_id,
    amount: numericValue(source.amount),
    category_id: reversalType === "transfer" ? null : source.category_id,
    description: reversalNote,
    metadata: {
      ...metadata,
      account_amount_type: sourceType === "transfer"
        ? normalizeAmountType(metadata.transfer_account_amount_type ?? metadata.account_amount_type)
        : normalizeAmountType(metadata.account_amount_type),
      reversed_transaction_id: source.id,
      transfer_account_amount_type: sourceType === "transfer" ? normalizeAmountType(metadata.account_amount_type) : null,
    },
    note: reversalNote,
    related_entity_id: source.related_entity_id,
    related_entity_type: source.related_entity_type,
    status: "cleared",
    title: reversalNote,
    transaction_date: new Date().toISOString().slice(0, 10),
    transfer_account_id: sourceType === "transfer" ? source.account_id : null,
    type: reversalType,
    user_id: user.id,
  });

  if (error) return { error: transactionMutationError(error.message) };
  await reconcileDebtIds(supabase, user.id, [
    source.related_entity_type === "debt" ? source.related_entity_id : "",
    metadataString(metadata, "credit_card_debt_id"),
  ]);
  await reconcileSubscriptionIds(supabase, user.id, [source.related_entity_type === "subscription" ? source.related_entity_id : ""]);
  revalidateTransactionLinkedPaths();
  return {};
}

function normalizeRelatedTypeForAction(value: string | null): TransactionFormData["relatedEntityType"] {
  if (value === "asset" || value === "budget" || value === "debt" || value === "savings_goal" || value === "subscription") return value;
  return "none";
}
