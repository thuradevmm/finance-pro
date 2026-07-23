"use server";

import { randomUUID } from "crypto";
import { revalidatePath } from "next/cache";

import { buildCreditCardDueBuckets, nextCreditCardPaymentDate } from "@/lib/accounts/credit-card-dates";
import { accountAvailableAmountForType } from "@/lib/accounts/amount-types";
import { effectiveBudgetEndDate } from "@/lib/budgets/calculations";
import { getCategoryTypeStyle } from "@/lib/categories/category-style";
import { categoryRowSupports } from "@/lib/categories/category-scopes";
import { SYSTEM_CURRENCY, formatMmk } from "@/lib/currency";
import { calculateDebtPayoffSummary, type DebtDatedRepayment, type DebtInterestRatePeriod } from "@/lib/debts/emi";
import { calculateDebtStatus } from "@/lib/debts/status";
import { resolveDebtStoredNumber } from "@/lib/debts/stored-values";
import {
  creditCardOpeningBalancesByAccount,
  debtTransactionLedgerFor,
  standaloneDebtPaymentTransactions,
} from "@/lib/debts/transactions";
import { buildAccountLedgerActivities, deriveCreditCardDebtMetadata, normalizeAmountType, roundCurrencyValue } from "@/lib/ledger";
import {
  calculateLinkedSavingsAmounts,
  calculateSavingsContributionCapacity,
  resolveStoredSavingsAmount,
  type SavingsGoalEntryInput,
} from "@/lib/savings-goals/calculations";
import type { TransactionFormData } from "@/lib/transactions/supabase";
import {
  postedReversalSourceIds,
  transactionMutationIntegrityError,
  transactionReversalIntegrityError,
} from "@/lib/transactions/integrity";
import { normalizeTransactionStatus, transactionStatusIsFinalized, transactionStatusReservesWorkingBalance } from "@/lib/transactions/status";
import { validateTransactionInput } from "@/lib/transactions/validation";
import {
  subscriptionBillingOccurrence,
  subscriptionPaymentCoversCycle,
  subscriptionPaymentIsAfterCutoff,
} from "@/lib/subscriptions/calculations";
import { getUserSafely } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/server";
import { isMissingDatabaseObject } from "@/lib/supabase/schema-compat";

type ActionResult = { error?: string; transactionIds?: string[]; warning?: string };

type AccountRow = {
  id: string;
  is_active?: boolean | null;
  metadata?: unknown;
  name?: string | null;
  type: string | null;
};

type TransactionRow = {
  account_id: string | null;
  amount: number | string | null;
  category_id: string | null;
  created_at?: string | null;
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

type MutationTransaction = Pick<TransactionRow, "account_id" | "category_id" | "id" | "metadata" | "related_entity_id" | "related_entity_type" | "status" | "transfer_account_id" | "type">;

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
  createdAt: string;
  exchangeRate: number;
  id: string;
  note: string | null;
  paymentDate: string;
  source: "linked_transaction" | "payment_record";
  transactionId: string | null;
};

type CreditCardDebtImpact = "charge" | "repayment" | "";

type CreditCardDebtResolution = {
  createdDebtId?: string;
  debtId: string;
  input: TransactionFormData;
  metadata: TransactionExtraMetadata;
};

type CategoryRow = {
  category_type?: string | null;
  id: string;
  is_active: boolean | null;
  metadata: unknown;
  name: string | null;
};
type RelatedReferenceRow = {
  account_id?: string | null;
  id: string;
  metadata: unknown;
  payment_account_id?: string | null;
  status?: string | null;
  type?: string | null;
};

type SavingsGoalReferenceRow = RelatedReferenceRow & {
  current_amount: number | string | null;
  initial_saved_amount: number | string | null;
  saved_amount: number | string | null;
  target_amount: number | string | null;
};

const transactionLinkedPaths = [
  "/transactions",
  "/accounts",
  "/assets",
  "/budgets",
  "/categories",
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

function futurePlanMetadata(input: TransactionFormData["futurePlan"], amount: number): TransactionExtraMetadata {
  if (!input) return {};
  return {
    future_end_date: input.endDate || null,
    future_plan: true,
    future_predicted_amount: amount,
    future_prediction_mode: "explicit",
    future_recurrence: input.recurrence.toLowerCase(),
    future_status: input.status.toLowerCase(),
  };
}

function preservedFuturePlanMetadata(metadata: unknown, amount: number): TransactionExtraMetadata {
  const source = metadataRecord(metadata);
  if (source.future_plan !== true
    && typeof source.future_recurrence !== "string"
    && typeof source.future_end_date !== "string") return {};

  return {
    future_end_date: source.future_end_date ?? null,
    future_link_amount_snapshot: source.future_link_amount_snapshot ?? null,
    future_link_label: source.future_link_label ?? null,
    future_materialized: source.future_materialized ?? false,
    future_materialization_mode: source.future_materialization_mode ?? null,
    future_occurrence_index: source.future_occurrence_index ?? null,
    future_plan: true,
    future_predicted_amount: amount,
    future_prediction_mode: "explicit",
    future_recurrence: source.future_recurrence ?? "once",
    future_series_end_date: source.future_series_end_date ?? null,
    future_series_id: source.future_series_id ?? null,
    future_series_occurrence_count: source.future_series_occurrence_count ?? null,
    future_series_recurrence: source.future_series_recurrence ?? null,
    future_status: source.future_status ?? "active",
  };
}

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
      future_planning_amount_id: input.futurePlanningAmountId || null,
      transfer_account_amount_type: null,
      ...extraMetadata,
      ...futurePlanMetadata(input.futurePlan, input.amount),
      ...(input.status.toLowerCase() === "scheduled" ? {
        future_predicted_amount: input.amount,
        future_prediction_mode: "explicit",
      } : {}),
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

async function validateFuturePlanningAmount(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  input: TransactionFormData,
) {
  if (!input.futurePlanningAmountId) return "";
  if (input.type === "Transfer") return "Transfers cannot be linked to a future-planning amount.";
  const { data: amount, error } = await supabase
    .from("future_planning_amounts")
    .select("id,column_id,period_month")
    .eq("id", input.futurePlanningAmountId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) return error.message;
  if (!amount) return "The selected predefined amount is no longer available.";
  const { data: column, error: columnError } = await supabase
    .from("future_planning_columns")
    .select("id,direction,is_active")
    .eq("id", amount.column_id)
    .eq("user_id", userId)
    .maybeSingle();
  if (columnError) return columnError.message;
  if (!column || column.is_active === false) return "The selected planning type is no longer available.";
  if (input.date.slice(0, 7) !== amount.period_month.slice(0, 7)) {
    return "The transaction date must be in the same month as the selected predefined amount.";
  }
  const requiredType = column.direction === "income" ? "Income" : "Expense";
  if (input.type !== requiredType) return `${directionLabelForError(column.direction)} planning amounts require an ${requiredType} transaction.`;
  return "";
}

function directionLabelForError(direction: string) {
  return direction === "saving" ? "Saving" : direction === "income" ? "Income" : "Expense";
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

function creditLimitFromMetadata(metadata: Record<string, unknown>) {
  return numericValue(metadata.credit_limit ?? metadata.monthly_budget_limit);
}

function isCreditCardAccount(account: AccountRow | null) {
  return normalizeAccountType(account?.type) === "credit_card";
}

function transactionMutationError(message: string) {
  if (message.includes("duplicate_transaction_reversal")) {
    return "This transaction has already been reversed and cannot be reversed again.";
  }
  if (message.includes("chk_transaction_transfer_accounts")) {
    return "Transfer requires a destination account. Same-account transfers are only allowed when the from and to amount types are different. If this still appears, apply the latest database migration.";
  }

  return message;
}

function recordStatus(metadata: unknown, value: unknown) {
  const columnStatus = String(value ?? "").trim();
  return String(columnStatus || metadataRecord(metadata).status || "").trim().toLowerCase();
}

function storedNumericValue(columnValue: unknown, metadataValue: unknown) {
  if (columnValue !== null && columnValue !== undefined && columnValue !== "") return numericValue(columnValue);
  return numericValue(metadataValue);
}

async function validateAndResolveTransactionReferences(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  input: TransactionFormData,
  allowedArchivedAccountIds: string[] = [],
  allowedExistingCategoryId = "",
  allowedExistingRelated?: { id: string; transactionIds?: string[]; type: string },
): Promise<{ error?: string; input: TransactionFormData }> {
  const preservesExistingRelated = allowedExistingRelated?.id === input.relatedEntityId
    && allowedExistingRelated.type === input.relatedEntityType;
  const accountIds = Array.from(new Set([
    input.accountId,
    input.type === "Transfer" ? input.transferAccountId : "",
  ].filter(Boolean)));
  const { data: accountData, error: accountError } = await supabase
    .from("accounts")
    .select("id,is_active,metadata,type")
    .eq("user_id", userId)
    .in("id", accountIds)
    .is("deleted_at", null);
  if (accountError) return { error: accountError.message, input };
  const accountRows = accountData as AccountRow[];
  if (accountRows.length !== accountIds.length) return { error: "One of the selected accounts does not exist.", input };
  if (accountRows.some((account) => !allowedArchivedAccountIds.includes(account.id)
    && (account.is_active === false || recordStatus(account.metadata, "") === "archived"))) {
    return { error: "Archived accounts cannot be used for new transaction activity.", input };
  }
  if (input.type === "Transfer" && accountRows.length === 2 && accountRows.every(isCreditCardAccount)) {
    return { error: "Direct transfers between two credit cards are not supported because they require two separate liability allocations. Use a bank or wallet settlement account instead.", input };
  }

  if (input.type !== "Transfer") {
    let { data: category, error: categoryError } = await supabase
      .from("categories")
      .select("id,is_active,type,category_type,metadata")
      .eq("id", input.categoryId)
      .eq("user_id", userId)
      .is("deleted_at", null)
      .maybeSingle();
    if (categoryError && isMissingDatabaseObject(categoryError, ["category_type"])) {
      ({ data: category, error: categoryError } = await supabase
        .from("categories")
        .select("id,is_active,type,metadata")
        .eq("id", input.categoryId)
        .eq("user_id", userId)
        .is("deleted_at", null)
        .maybeSingle());
    }
    if (categoryError) return { error: categoryError.message, input };
    if (!category || (category.is_active === false && category.id !== allowedExistingCategoryId)) return { error: "Select an active category that belongs to your account.", input };
    if (!categoryRowSupports(category, "Transactions", input.type)) {
      return { error: `${input.type} transactions require an active ${input.type} category from the Transactions page.`, input };
    }
  }

  if (input.relatedEntityType === "budget" && input.relatedEntityId) {
    const { data: item, error: itemError } = await supabase
      .from("budget_items")
      .select("id,budget_plan_id,category_id")
      .eq("id", input.relatedEntityId)
      .eq("user_id", userId)
      .maybeSingle();
    if (itemError) return { error: itemError.message, input };
    if (!item) return { error: "The selected budget does not exist.", input };
    const { data: plan, error: planError } = await supabase
      .from("budget_plans")
      .select("id,start_date,end_date,status,period_type")
      .eq("id", item.budget_plan_id)
      .eq("user_id", userId)
      .is("deleted_at", null)
      .maybeSingle();
    if (planError) return { error: planError.message, input };
    if (!plan || (!preservesExistingRelated && String(plan.status).toLowerCase() !== "active")) return { error: "Only active budgets can receive new transactions.", input };
    const effectiveEndDate = effectiveBudgetEndDate(
      plan.start_date,
      plan.end_date,
      String(plan.period_type).toLowerCase() === "yearly" ? "Yearly" : "Monthly",
    );
    if (!preservesExistingRelated && (input.date < plan.start_date || input.date > effectiveEndDate)) {
      return { error: "The transaction date must fall within the linked budget period.", input };
    }
    if (input.type !== "Expense") return { error: "Budget activity must be recorded as an Expense.", input };
    return { input: { ...input, categoryId: item.category_id } };
  }

  if (input.relatedEntityType === "none" || !input.relatedEntityId) return { input };

  let relatedRecord: RelatedReferenceRow | null = null;
  let savingsGoalRecord: SavingsGoalReferenceRow | null = null;
  let relatedError: { message: string } | null = null;
  if (input.relatedEntityType === "debt") {
    const result = await supabase.from("debts").select("id,status,metadata,type,payment_account_id").eq("id", input.relatedEntityId).eq("user_id", userId).is("deleted_at", null).maybeSingle();
    relatedRecord = result.data as RelatedReferenceRow | null;
    relatedError = result.error;
  } else if (input.relatedEntityType === "savings_goal") {
    const result = await supabase.from("savings_goals").select("id,status,metadata,account_id,target_amount,current_amount,saved_amount,initial_saved_amount").eq("id", input.relatedEntityId).eq("user_id", userId).is("deleted_at", null).maybeSingle();
    savingsGoalRecord = result.data as SavingsGoalReferenceRow | null;
    relatedRecord = savingsGoalRecord;
    relatedError = result.error;
  } else if (input.relatedEntityType === "subscription") {
    const result = await supabase.from("subscriptions").select("id,status,metadata").eq("id", input.relatedEntityId).eq("user_id", userId).is("deleted_at", null).maybeSingle();
    relatedRecord = result.data as RelatedReferenceRow | null;
    relatedError = result.error;
  } else if (input.relatedEntityType === "asset") {
    const result = await supabase.from("assets").select("id,status,metadata").eq("id", input.relatedEntityId).eq("user_id", userId).is("deleted_at", null).maybeSingle();
    relatedRecord = result.data as RelatedReferenceRow | null;
    relatedError = result.error;
  }
  if (relatedError) return { error: relatedError.message, input };
  if (!relatedRecord) return { error: "The selected linked record does not exist.", input };
  const status = recordStatus(relatedRecord.metadata, relatedRecord.status);
  if (!preservesExistingRelated && input.relatedEntityType === "debt" && ["archived", "paid"].includes(status)) {
    return { error: "Paid or archived debts cannot receive new repayment activity.", input };
  }
  if (!preservesExistingRelated && input.relatedEntityType === "savings_goal" && status === "completed") {
    return { error: "Completed savings goals cannot receive new contributions.", input };
  }
  if (!preservesExistingRelated && input.relatedEntityType === "subscription" && ["cancelled", "canceled", "expired", "paused"].includes(status)) {
    return { error: "Paused or expired subscriptions cannot receive new payments.", input };
  }
  if (!preservesExistingRelated && input.relatedEntityType === "asset" && status && status !== "active") {
    return { error: "Sold or archived assets cannot receive new purchase activity.", input };
  }
  if (input.relatedEntityType === "savings_goal" && input.type === "Transfer" && input.transferAccountId !== relatedRecord.account_id) {
    return { error: "A savings-goal transfer must move money into the account assigned to that goal.", input };
  }
  if (input.relatedEntityType === "debt" && input.type === "Income") {
    const relatedMetadata = metadataRecord(relatedRecord.metadata);
    const cardAccountId = typeof relatedMetadata.credit_card_account_id === "string"
      ? relatedMetadata.credit_card_account_id
      : typeof relatedMetadata.auto_credit_card_account_id === "string"
        ? relatedMetadata.auto_credit_card_account_id
        : relatedRecord.payment_account_id;
    const isCardDebt = normalizeDebtType(relatedRecord.type ?? relatedMetadata.type) === "creditcard";
    if (!isCardDebt || input.accountId !== cardAccountId) {
      return { error: "Income can only link to a credit card debt when it is a credit posted directly to that card account.", input };
    }
  }
  if (["asset", "subscription"].includes(input.relatedEntityType) && input.type !== "Expense") {
    return { error: `${input.relatedEntityType === "asset" ? "Asset purchases" : "Subscription payments"} must be recorded as an Expense.`, input };
  }
  if (input.relatedEntityType === "savings_goal" && input.type === "Income") {
    return { error: "Savings-goal contributions must be an Expense or a Transfer into the goal account.", input };
  }
  if (input.relatedEntityType === "savings_goal" && savingsGoalRecord) {
    const ignoredIds = new Set(preservesExistingRelated ? allowedExistingRelated?.transactionIds ?? [] : []);
    const [entriesResult, transactionsResult] = await Promise.all([
      supabase
        .from("savings_goal_entries")
        .select("savings_goal_id,transaction_id,amount,type")
        .eq("user_id", userId)
        .eq("savings_goal_id", savingsGoalRecord.id),
      supabase
        .from("transactions")
        .select("id,account_id,transfer_account_id,related_entity_id,type,amount,status,metadata")
        .eq("user_id", userId)
        .eq("related_entity_type", "savings_goal")
        .eq("related_entity_id", savingsGoalRecord.id)
        .is("deleted_at", null),
    ]);
    const savingsError = entriesResult.error ?? transactionsResult.error;
    if (savingsError) return { error: savingsError.message, input };
    const linkedAmount = calculateLinkedSavingsAmounts(
      ((entriesResult.data ?? []) as SavingsGoalEntryInput[])
        .filter((entry) => !entry.transaction_id || !ignoredIds.has(entry.transaction_id)),
      (transactionsResult.data ?? []).filter((transaction) => !transaction.id || !ignoredIds.has(transaction.id)),
      new Map([[savingsGoalRecord.id, savingsGoalRecord.account_id ?? ""]]),
    ).progressByGoalId.get(savingsGoalRecord.id) ?? 0;
    const metadata = metadataRecord(savingsGoalRecord.metadata);
    const storedAmount = resolveStoredSavingsAmount({
      currentAmount: savingsGoalRecord.current_amount,
      initialSavedAmount: savingsGoalRecord.initial_saved_amount,
      metadataCurrentAmount: metadata.current_amount,
      metadataSavedAmount: metadata.saved_amount,
      savedAmount: savingsGoalRecord.saved_amount,
    });
    const targetAmount = storedNumericValue(savingsGoalRecord.target_amount, metadata.target_amount);
    const capacity = calculateSavingsContributionCapacity({
      contributionAmount: input.amount,
      linkedSavedAmount: linkedAmount,
      storedSavedAmount: storedAmount,
      targetAmount,
    });
    if (capacity.isComplete) {
      return { error: "This savings goal is already complete based on its linked contributions.", input };
    }
    if (capacity.exceedsRemaining) {
      return { error: `This contribution exceeds the ${formatMmk(capacity.remainingAmount)} remaining on the savings goal.`, input };
    }
  }
  return { input };
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
  if (!transactionStatusReservesWorkingBalance(input.status)) return null;

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
    .select("id,account_id,transfer_account_id,amount,type,metadata,status,related_entity_id,related_entity_type")
    .eq("user_id", userId)
    .is("deleted_at", null);

  if (transactionsError) return transactionsError.message;

  let ledgerTransactions = (transactions as TransactionRow[])
    .filter((transaction) => !ignoredTransactionIds.includes(transaction.id));
  let openingCreditCardBalance = 0;

  if (isCreditCardAccount(account as AccountRow)) {
    const { data: debts, error: debtsError } = await supabase
      .from("debts")
      .select("id,payment_account_id,type,total_amount,repaid_amount,metadata")
      .eq("user_id", userId)
      .is("deleted_at", null);
    if (debtsError) return debtsError.message;
    const debtRows = debts as DebtRow[];
    ledgerTransactions = ledgerTransactions.map((transaction) => ({
      ...transaction,
      metadata: deriveCreditCardDebtMetadata(transaction, debtRows, [account as AccountRow]),
    }));
    openingCreditCardBalance = creditCardOpeningBalancesByAccount(debtRows).get(input.accountId) ?? 0;
  }

  const accountActivities = buildAccountLedgerActivities(ledgerTransactions, [account as AccountRow]);
  const accountActivity = accountActivities.get(input.accountId);

  if (isCreditCardAccount(account as AccountRow)) {
    const creditLimit = creditLimitFromMetadata(metadataRecord((account as AccountRow).metadata));
    if (creditLimit <= 0) return null;

    const usedAmount = Math.max(roundCurrencyValue((accountActivity?.creditUsed ?? 0) + openingCreditCardBalance), 0);
    const availableLimit = Math.min(Math.max(creditLimit - usedAmount, 0), creditLimit);
    return input.amount > availableLimit
      ? `Insufficient credit card limit. Available limit is ${formatMmk(availableLimit)}.`
      : null;
  }

  const availableAmount = accountAvailableAmountForType(
    account.metadata,
    accountActivity?.deltas ?? new Map(),
    amountType,
  );

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
  const categoryType = String(row.category_type ?? metadata.category_type ?? "").trim().toLowerCase();
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
  const enrichedResult = await supabase
    .from("categories")
    .select("id,name,is_active,category_type,metadata")
    .eq("user_id", userId)
    .is("deleted_at", null)
    .order("created_at", { ascending: true });
  let data = enrichedResult.data as CategoryRow[] | null;
  let error = enrichedResult.error;

  if (error && isMissingDatabaseObject(error, ["category_type"])) {
    const legacyResult = await supabase
      .from("categories")
      .select("id,name,is_active,metadata")
      .eq("user_id", userId)
      .is("deleted_at", null)
      .order("created_at", { ascending: true });
    data = legacyResult.data as CategoryRow[] | null;
    error = legacyResult.error;
  }

  if (error) return null;

  const debtCategories = (data as CategoryRow[]).filter(isDebtCategory);
  const preferredCategory = debtCategories.find((category) => normalizeCategoryName(category.name).includes("credit"))
    ?? debtCategories[0];
  if (preferredCategory) return preferredCategory.id;

  const style = getCategoryTypeStyle("Debt");
  for (const name of ["Credit Card Debt", "Credit Card Liability", "Debt"]) {
    const categoryPayload = {
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
    };
    let { data: createdCategory, error: createError } = await supabase
      .from("categories")
      .insert({
        ...categoryPayload,
        category_type: "debt",
      })
      .select("id")
      .maybeSingle();
    if (createError && isMissingDatabaseObject(createError, ["category_type"])) {
      ({ data: createdCategory, error: createError } = await supabase
        .from("categories")
        .insert(categoryPayload)
        .select("id")
        .maybeSingle());
    }

    if (!createError && createdCategory?.id) return createdCategory.id as string;
    if (createError?.code !== "23505") break;
  }

  return null;
}

function creditCardImpactForTransaction(transaction: TransactionRow, creditCardAccountId: string): CreditCardDebtImpact {
  const transactionType = String(transaction.type ?? "").toLowerCase();
  const metadata = metadataRecord(transaction.metadata);
  const explicitImpact = metadataString(metadata, "credit_card_debt_impact");
  const direction = transferDirection(metadata);
  if (explicitImpact === "charge" || explicitImpact === "repayment") {
    // Paired transfers store the metadata on both rows; only the row whose
    // primary account is the card represents the liability movement.
    if (transactionType === "transfer" && direction && transaction.account_id !== creditCardAccountId) return "";
    return explicitImpact;
  }
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
  if (!usesCreditCardAccount && !paysCreditCardAccount && transactionType === "expense") return "repayment";
  if (!usesCreditCardAccount && !paysCreditCardAccount && transactionType === "income" && metadataString(metadata, "reversed_transaction_id")) return "charge";
  return "";
}

async function creditCardDebtBalance(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  debt: DebtRow,
) {
  const [transactionsResult, paymentsResult] = await Promise.all([
    supabase.from("transactions").select("id,account_id,transfer_account_id,amount,type,metadata,status,related_entity_id,related_entity_type,transaction_date").eq("user_id", userId).is("deleted_at", null),
    supabase.from("debt_payments").select("id,debt_id,transaction_id,amount,payment_date").eq("user_id", userId).eq("debt_id", debt.id),
  ]);
  const error = transactionsResult.error ?? paymentsResult.error;
  if (error) return { error: error.message };

  const metadata = metadataRecord(debt.metadata);
  const ledger = debtTransactionLedgerFor([
    ...(transactionsResult.data as TransactionRow[]),
    ...standaloneDebtPaymentTransactions(paymentsResult.data ?? []),
  ], debt);
  const openingChargeAmount = resolveDebtStoredNumber(debt.total_amount, metadata.total_amount);
  const chargedAmount = roundCurrencyValue(openingChargeAmount + ledger.charges);
  const repaidAmount = roundCurrencyValue(resolveDebtStoredNumber(debt.repaid_amount, metadata.repaid_amount) + ledger.repayments);
  const dueBuckets = buildCreditCardDueBuckets({
    chargeActivity: ledger.chargeActivity,
    fallbackDueDate: debt.next_payment_date ?? metadataString(metadata, "next_payment_date"),
    openingChargeAmount,
    paymentDueDay: dayOfMonthValue(metadata.credit_payment_due_day),
    repaymentAmount: repaidAmount,
    statementDay: dayOfMonthValue(metadata.credit_statement_day),
  });

  return {
    chargedAmount,
    dueAmount: dueBuckets[0]?.amountValue ?? 0,
    nextPaymentDate: dueBuckets[0]?.dueDateValue ?? "",
    repaidAmount,
    remainingAmount: roundCurrencyValue(Math.max(chargedAmount - repaidAmount, 0)),
  };
}

async function updateCreditCardDebtSnapshot(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  debt: DebtRow,
  balance: { dueAmount: number; nextPaymentDate: string; remainingAmount: number },
) {
  const metadata = metadataRecord(debt.metadata);
  const isManualTerms = isManualCreditCardDebt(debt);
  const nextStatus = calculateDebtStatus({
    dueDate: isManualTerms
      ? debt.next_payment_date ?? metadataString(metadata, "next_payment_date")
      : balance.nextPaymentDate,
    remainingAmount: balance.remainingAmount,
    storedStatus: debt.status ?? metadata.status,
  }).toLowerCase();
  const monthlyPayment = nextStatus === "paid" ? 0 : balance.dueAmount;
  const currentStatus = String(debt.status ?? metadata.status ?? "").toLowerCase();
  const currentMonthlyPayment = resolveDebtStoredNumber(debt.monthly_payment, metadata.monthly_payment);

  if (isManualTerms) {
    const isPaid = nextStatus === "paid";
    const configuredMinimum = Math.max(
      numericValue(metadata.credit_minimum_payment)
        || currentMonthlyPayment
        || balance.dueAmount,
      0,
    );
    const manualMonthlyPayment = isPaid ? 0 : Math.min(configuredMinimum, balance.dueAmount);
    const nextPaymentDate = isPaid ? null : balance.nextPaymentDate || null;
    const currentNextPaymentDate = (debt.next_payment_date ?? metadataString(metadata, "next_payment_date")) || null;
    if (currentStatus === nextStatus
      && Math.abs(currentMonthlyPayment - manualMonthlyPayment) <= 0.005
      && currentNextPaymentDate === nextPaymentDate) return null;

    const { error } = await supabase
      .from("debts")
      .update({
        metadata: {
          ...metadata,
          monthly_payment: manualMonthlyPayment,
          next_payment_date: nextPaymentDate,
          paid_at: isPaid ? metadataString(metadata, "paid_at") || new Date().toISOString() : null,
          payoff_date: nextPaymentDate,
          status: nextStatus,
        },
        monthly_payment: manualMonthlyPayment,
        next_payment_date: nextPaymentDate,
        status: nextStatus,
      })
      .eq("id", debt.id)
      .eq("user_id", userId);

    return error?.message ?? null;
  }

  const currentNextPaymentDate = debt.next_payment_date ?? metadataString(metadata, "next_payment_date");
  if (currentStatus === nextStatus
    && Math.abs(currentMonthlyPayment - monthlyPayment) <= 0.005
    && currentNextPaymentDate === balance.nextPaymentDate) return null;

  const payload = {
    metadata: {
      ...metadata,
      duration_months: 1,
      auto_credit_card_terms: true,
      manual_credit_card_terms: false,
      monthly_payment: monthlyPayment,
      next_payment_date: nextStatus === "paid" ? null : balance.nextPaymentDate || null,
      paid_at: nextStatus === "paid" ? metadataString(metadata, "paid_at") || new Date().toISOString() : null,
      payoff_date: nextStatus === "paid" ? null : balance.nextPaymentDate || null,
      requires_full_payment: true,
      status: nextStatus,
    },
    monthly_payment: monthlyPayment,
    next_payment_date: nextStatus === "paid" ? null : balance.nextPaymentDate || null,
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
    .select("id,status,payment_account_id,total_amount,repaid_amount,metadata,type,next_payment_date,monthly_payment")
    .eq("id", debtId)
    .eq("user_id", userId)
    .is("deleted_at", null)
    .maybeSingle();

  if (debtError) return debtError.message;
  if (!debtData) return null;

  const debt = debtData as DebtRow;
  if (!isCreditCardDebt(debt) || debtStatusKey(debt) === "archived") return null;
  const accountId = creditCardDebtAccountId(debt);
  if (!accountId) return null;

  const balance = await creditCardDebtBalance(supabase, userId, debt);
  if ("error" in balance) return balance.error;
  return updateCreditCardDebtSnapshot(supabase, userId, debt, balance);
}

async function reconcileCreditCardDebtIds(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  debtIds: Array<string | null | undefined>,
) {
  for (const debtId of Array.from(new Set(debtIds.filter((id): id is string => Boolean(id))))) {
    const error = await reconcileCreditCardDebt(supabase, userId, debtId);
    if (error) return error;
  }
  return null;
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

async function standardDebtRepayments(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  debt: DebtRow,
): Promise<{ error?: string; repayments: DebtDatedRepayment[] }> {
  const [transactionsResult, paymentsResult] = await Promise.all([
    supabase.from("transactions").select("id,transaction_date,type,amount,account_id,transfer_account_id,category_id,status,title,description,note,related_entity_type,related_entity_id,metadata").eq("user_id", userId).eq("related_entity_type", "debt").eq("related_entity_id", debt.id).is("deleted_at", null),
    supabase.from("debt_payments").select("id,debt_id,transaction_id,amount,payment_date").eq("user_id", userId).eq("debt_id", debt.id),
  ]);
  const error = transactionsResult.error ?? paymentsResult.error;
  if (error) return { error: error.message, repayments: [] };

  return { repayments: debtTransactionLedgerFor([
    ...(transactionsResult.data as TransactionRow[]),
    ...standaloneDebtPaymentTransactions(paymentsResult.data ?? []),
  ], debt).repaymentActivity };
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
  const principal = resolveDebtStoredNumber(debt.total_amount, metadata.total_amount);
  const startDate = debt.start_date ?? metadataString(metadata, "start_date");
  if (principal <= 0 || !startDate) return null;

  const repaymentsResult = await standardDebtRepayments(supabase, userId, debt);
  if (repaymentsResult.error) return repaymentsResult.error;

  const payoffDate = metadataString(metadata, "payoff_date");
  const durationMonths = Math.max(numericValue(metadata.duration_months, wholeMonthsBetween(startDate, payoffDate)), 0);
  const currentStatus = debtStatusKey(debt);
  const settledAt = metadataString(metadata, "early_payoff_date") || metadataString(metadata, "paid_at").slice(0, 10);
  const hasEarlyPayoffSettlement = metadata.early_payoff === true
    || (currentStatus === "paid" && numericValue(metadata.remaining_principal) <= 0.005 && Boolean(settledAt));
  const summary = calculateDebtPayoffSummary({
    interestRate: resolveDebtStoredNumber(debt.interest_rate, metadata.interest_rate),
    interestRatePeriod: normalizeDebtInterestRatePeriod(metadata.interest_rate_period),
    numberOfMonths: durationMonths,
    openingRepaidAmount: resolveDebtStoredNumber(debt.repaid_amount, metadata.repaid_amount),
    principal,
    referenceDate: formatDateInput(new Date()),
    repayments: repaymentsResult.repayments,
    settledAt,
    settledEarly: hasEarlyPayoffSettlement,
    startDate,
  });
  const nextStatus = calculateDebtStatus({
    dueDate: debt.next_payment_date ?? metadataString(metadata, "next_payment_date"),
    remainingAmount: summary.remainingPrincipal,
    storedStatus: currentStatus,
  }).toLowerCase();

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
      monthly_payment: summary.isPaidOff ? 0 : resolveDebtStoredNumber(debt.monthly_payment, metadata.monthly_payment),
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
    const error = await reconcileStandardDebt(supabase, userId, debtId);
    if (error) return error;
  }
  return null;
}

async function reconcileDebtIds(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  debtIds: Array<string | null | undefined>,
) {
  const uniqueDebtIds = Array.from(new Set(debtIds.filter((id): id is string => Boolean(id))));
  return await reconcileCreditCardDebtIds(supabase, userId, uniqueDebtIds)
    ?? await reconcileStandardDebtIds(supabase, userId, uniqueDebtIds);
}

async function creditCardContextForTransaction(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  transaction: TransactionRow,
) {
  const transactionMetadata = metadataRecord(transaction.metadata);
  const debtId = transaction.related_entity_type === "debt" && transaction.related_entity_id
    ? transaction.related_entity_id
    : metadataString(transactionMetadata, "credit_card_debt_id");
  if (!debtId) return null;

  const { data, error } = await supabase
    .from("debts")
    .select("id,status,payment_account_id,total_amount,repaid_amount,metadata,type,next_payment_date,monthly_payment")
    .eq("id", debtId)
    .eq("user_id", userId)
    .is("deleted_at", null)
    .maybeSingle();

  if (error || !data) return null;
  const debt = data as DebtRow;
  if (!isCreditCardDebt(debt)) return null;
  const accountId = creditCardDebtAccountId(debt);
  if (!accountId) return null;
  const physicallyTouchesCard = transaction.account_id === accountId || transaction.transfer_account_id === accountId;
  const transactionType = String(transaction.type ?? "").toLowerCase();
  const impact = creditCardImpactForTransaction(transaction, accountId)
    || (!physicallyTouchesCard && transactionType === "expense" ? "repayment" : "")
    || (!physicallyTouchesCard && transactionType === "income" && metadataString(transactionMetadata, "reversed_transaction_id") ? "charge" : "");
  if (!impact) return null;
  return { accountId, debtId, impact, isPayment: impact === "repayment" && !physicallyTouchesCard };
}

function creditCardReversalMetadata(
  context: Awaited<ReturnType<typeof creditCardContextForTransaction>>,
  sourceMetadata: Record<string, unknown>,
  sourceType: string,
) {
  if (!context) return {};
  const reversedImpact: CreditCardDebtImpact = context.impact === "charge" ? "repayment" : "charge";
  const reversedPayment = context.isPayment
    || sourceMetadata.credit_card_payment === true
    || sourceMetadata.financial_event === "credit_card_payment";
  return {
    credit_card_account_id: context.accountId,
    credit_card_debt_id: context.debtId,
    credit_card_debt_impact: reversedImpact,
    credit_card_payment: false,
    financial_event: reversedPayment ? "credit_card_payment_reversal" : "credit_card_activity_reversal",
    reversed_credit_card_payment: reversedPayment,
    reversed_transaction_type: sourceType,
  };
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
    .select("id,status,payment_account_id,total_amount,repaid_amount,metadata,type,next_payment_date")
    .eq("user_id", userId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false });

  if (debtsError) return { error: debtsError.message };

  const debtRows = (debts as DebtRow[]).filter((debt) => debtStatusKey(debt) !== "archived");
  const creditCardDebtIds = new Set(debtRows
    .filter((debt) => isCreditCardDebt(debt) && creditCardDebtAccountId(debt) === account.id)
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

  const debtById = new Map(debtRows.map((debt) => [debt.id, debt]));
  for (const transaction of linkedTransactions as Pick<TransactionRow, "related_entity_id">[]) {
    const debt = transaction.related_entity_id ? debtById.get(transaction.related_entity_id) : undefined;
    if (debt && isCreditCardDebt(debt)) creditCardDebtIds.add(debt.id);
  }

  const creditCardDebtRows = debtRows.filter((debt) => creditCardDebtIds.has(debt.id));

  const balancesByDebtId = new Map<string, { chargedAmount: number; repaidAmount: number; remainingAmount: number }>();
  for (const debt of creditCardDebtRows) {
    const balance = await creditCardDebtBalance(supabase, userId, debt);
    if ("error" in balance) return { error: balance.error };
    balancesByDebtId.set(debt.id, balance);
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
  const nextPaymentDateValue = nextCreditCardPaymentDate({
    paymentDueDay: creditPaymentDueDay,
    referenceDate: startDate,
    statementDay: creditStatementDay,
  }) || null;

  // Reuse the most recent automatic card ledger after payoff. This preserves
  // issuer credit from an overpayment, so future charges consume that credit
  // instead of opening a second debt that disagrees with the Accounts page.
  // Refresh cycle dates so a later charge cannot reactivate with an old due
  // date from the previous paid cycle.
  const reusableCreditDebt = creditCardDebtRows.find((debt) => {
    const balance = balancesByDebtId.get(debt.id);
    return balance && balance.repaidAmount - balance.chargedAmount > 0.005;
  });
  if (reusableCreditDebt && isManualCreditCardDebt(reusableCreditDebt)) return { debtId: reusableCreditDebt.id };
  const reusableAutomaticDebt = reusableCreditDebt
    ?? creditCardDebtRows.find((debt) => !isManualCreditCardDebt(debt));
  if (reusableAutomaticDebt) {
    return { debtId: reusableAutomaticDebt.id };
  }

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
  return { createdDebtId: createdDebt.id as string, debtId: createdDebt.id as string };
}

async function resolveCreditCardDebtLink(input: TransactionFormData, userId: string): Promise<CreditCardDebtResolution | { error: string }> {
  const { supabase } = await authenticatedClient();
  if (input.relatedEntityType === "debt" && input.relatedEntityId) {
    const { data: selectedDebtData, error: selectedDebtError } = await supabase
      .from("debts")
      .select("id,status,payment_account_id,total_amount,repaid_amount,metadata,type")
      .eq("id", input.relatedEntityId)
      .eq("user_id", userId)
      .is("deleted_at", null)
      .maybeSingle();

    if (selectedDebtError) return { error: selectedDebtError.message };
    if (selectedDebtData) {
      const selectedDebt = selectedDebtData as DebtRow;
      const selectedCardAccountId = creditCardDebtAccountId(selectedDebt);
      if (isCreditCardDebt(selectedDebt) && selectedCardAccountId) {
        const { data: selectedCardAccount, error: selectedCardError } = await supabase
          .from("accounts")
          .select("id,name,type,metadata")
          .eq("id", selectedCardAccountId)
          .eq("user_id", userId)
          .is("deleted_at", null)
          .maybeSingle();

        if (selectedCardError) return { error: selectedCardError.message };
        if (!selectedCardAccount || !isCreditCardAccount(selectedCardAccount as AccountRow)) {
          return { error: "The selected credit card debt is not linked to an active credit card account." };
        }

        const involvedCardResult = await getCreditCardAccountForTransaction(input, userId);
        if ("error" in involvedCardResult) return { error: involvedCardResult.error ?? "Unable to validate the credit card account." };
        if (involvedCardResult.account && involvedCardResult.account.id !== selectedCardAccountId) {
          return { error: "A credit card cannot be used to pay a different credit card debt. Record the payment from a bank or wallet account instead." };
        }

        const physicallyTouchesCard = input.accountId === selectedCardAccountId
          || (input.type === "Transfer" && input.transferAccountId === selectedCardAccountId);
        const impact = physicallyTouchesCard
          ? creditCardImpactForInput(input, selectedCardAccountId)
          : input.type === "Expense" ? "repayment" : "";

        if (!impact) {
          return { error: "Settle a credit card debt with an Expense from the payment account or a Transfer to the credit card." };
        }

        const isExternalPayment = impact === "repayment" && !physicallyTouchesCard;
        return {
          debtId: selectedDebt.id,
          input,
          metadata: {
            credit_card_account_id: selectedCardAccountId,
            credit_card_debt_id: selectedDebt.id,
            credit_card_debt_impact: impact,
            credit_card_payment: isExternalPayment,
            financial_event: impact === "charge"
              ? "credit_card_charge"
              : isExternalPayment ? "credit_card_payment" : "credit_card_credit",
          },
        };
      }
    }
  }

  const accountResult = await getCreditCardAccountForTransaction(input, userId);
  if ("error" in accountResult) return { error: accountResult.error ?? "Unable to load credit card account." };
  if (!accountResult.account) {
    return input.relatedEntityType === "debt" && !input.relatedEntityId
      ? { error: "Automatic credit card debt is only available when the transaction uses a credit card account." }
      : { debtId: "", input, metadata: {} };
  }

  const impact = creditCardImpactForInput(input, accountResult.account.id);
  if (!impact) return { debtId: "", input, metadata: {} };

  const debtResult = await findCreditCardDebtId(supabase, userId, accountResult.account, input.date, {
    createIfMissing: true,
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

  const isPayment = impact === "repayment" && (input.type === "Income" || input.transferAccountId === accountResult.account.id);
  const cardMetadata = {
    credit_card_account_id: accountResult.account.id,
    credit_card_debt_id: debtResult.debtId,
    credit_card_debt_impact: impact,
    credit_card_payment: isPayment,
    financial_event: impact === "charge" ? "credit_card_charge" : isPayment ? "credit_card_payment" : "credit_card_credit",
  };

  if (input.relatedEntityType === "none" || (input.relatedEntityType === "debt" && !input.relatedEntityId)) {
    return {
      createdDebtId: debtResult.createdDebtId,
      debtId: debtResult.debtId,
      input: {
        ...input,
        relatedEntityId: debtResult.debtId,
        relatedEntityType: "debt" as const,
      },
      metadata: cardMetadata,
    };
  }

  return {
    createdDebtId: debtResult.createdDebtId,
    debtId: debtResult.debtId,
    input,
    metadata: {
      ...cardMetadata,
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

async function hasPostedReversalForTransactionIds(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  transactionIds: string[],
) {
  if (transactionIds.length === 0) return false;
  const { data, error } = await supabase
    .from("transactions")
    .select("metadata,status")
    .eq("user_id", userId)
    .is("deleted_at", null);
  if (error) throw new Error(error.message);
  const reversedSourceIds = postedReversalSourceIds(data as Pick<TransactionRow, "metadata" | "status">[]);
  return transactionIds.some((id) => reversedSourceIds.has(id));
}

async function fetchTransactionForMutation(supabase: Awaited<ReturnType<typeof createClient>>, userId: string, transactionId: string) {
  const { data, error } = await supabase
    .from("transactions")
    .select("id,account_id,transfer_account_id,category_id,metadata,related_entity_id,related_entity_type,status,type")
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

async function restoreArchivedTransactions(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  transactionIds: string[],
) {
  if (transactionIds.length === 0) return null;
  const { error } = await supabase
    .from("transactions")
    .update({ deleted_at: null })
    .eq("user_id", userId)
    .in("id", transactionIds);
  return error?.message ?? null;
}

async function cleanupCreatedCreditCardDebt(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  debtId: string | undefined,
) {
  if (!debtId) return null;
  const { error } = await supabase.from("debts").delete().eq("id", debtId).eq("user_id", userId);
  return error?.message ?? null;
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

  if (!subscriptionPaymentCoversCycle(input.amount, expectedPaymentAmount)) {
    return {
      error: `Subscription payment must be at least ${formatMmk(expectedPaymentAmount)} for this billing cycle.`,
      metadata: {},
    };
  }

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

function isReversalTransaction(transaction: Pick<TransactionRow, "metadata" | "status">) {
  const metadata = metadataRecord(transaction.metadata);
  return transactionStatusIsFinalized(transaction.status) && typeof metadata.reversed_transaction_id === "string" && metadata.reversed_transaction_id;
}

function isPostedSubscriptionExpense(transaction: TransactionRow, reversedTransactionIds: Set<string>) {
  return (
    String(transaction.type ?? "").toLowerCase() === "expense" &&
    transactionStatusIsFinalized(transaction.status) &&
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
    createdAt: transaction.created_at ?? `${transaction.transaction_date ?? formatDateInput(new Date())}T00:00:00.000Z`,
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
    createdAt: payment.created_at ?? `${payment.payment_date ?? formatDateInput(new Date())}T00:00:00.000Z`,
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
  const configuredPaymentAmount = positiveNumber(subscription.amount);
  const sortedPayments = payments
    .filter((payment) => subscriptionPaymentIsAfterCutoff(payment, cutoffDate))
    .filter((payment) => subscriptionPaymentCoversCycle(
      payment.amount,
      payment.billedAmount > 0 && payment.exchangeRate > 0
        ? roundCurrencyValue(payment.billedAmount * payment.exchangeRate)
        : configuredPaymentAmount,
    ))
    .sort(compareSubscriptionPayments);
  const snapshots = sortedPayments.map((payment, index) => {
    const billingDueDate = payment.billingDueDate
      || subscriptionBillingOccurrence(anchorValue, cycle, index)
      || anchorValue;
    return {
      billingDueDate,
      payment,
    };
  });

  return {
    anchorDate: anchorValue,
    cutoffDate,
    nextBillingDate: subscriptionBillingOccurrence(anchorValue, cycle, snapshots.length) || anchorValue,
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
    .select("id,transaction_date,type,amount,account_id,transfer_account_id,category_id,status,title,description,note,related_entity_type,related_entity_id,metadata,created_at")
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
  const transactionById = new Map(transactionRows.map((transaction) => [transaction.id, transaction]));
  const manualPaymentEvidences = existingPaymentRows
    .filter((payment) => !isGeneratedSubscriptionPayment(payment))
    .filter((payment) => {
      if (!payment.transaction_id) return true;
      const transaction = transactionById.get(payment.transaction_id);
      return Boolean(transaction && isPostedSubscriptionExpense(transaction, reversedTransactionIds));
    })
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
    const error = await reconcileSubscriptionPayments(supabase, userId, subscriptionId);
    if (error) return error;
  }
  return null;
}

function reconciliationWarning(debtError: string | null, subscriptionError: string | null) {
  const details = [debtError && `debt: ${debtError}`, subscriptionError && `subscription: ${subscriptionError}`].filter(Boolean).join("; ");
  return details ? `The transaction was saved, but linked data reconciliation needs attention (${details}).` : undefined;
}

export async function createTransaction(input: TransactionFormData): Promise<ActionResult> {
  const { supabase, user } = await authenticatedClient();
  if (!user) return { error: "You must be signed in." };
  const inputError = validateTransactionInput(input);
  if (inputError) return { error: inputError };
  const planningError = await validateFuturePlanningAmount(supabase, user.id, input);
  if (planningError) return { error: planningError };
  const referenceResult = await validateAndResolveTransactionReferences(supabase, user.id, input);
  if (referenceResult.error) return { error: referenceResult.error };
  const validatedInput = referenceResult.input;
  const validationError = await validateAvailableAmount(validatedInput, user.id);
  if (validationError) return { error: validationError };
  const creditCardDebtResolution = await resolveCreditCardDebtLink(validatedInput, user.id);
  if ("error" in creditCardDebtResolution) return { error: creditCardDebtResolution.error };
  const resolvedInput = creditCardDebtResolution.input;
  const subscriptionMetadataResult = await subscriptionPaymentMetadataForInput(supabase, user.id, resolvedInput);
  if (subscriptionMetadataResult.error) {
    const cleanupError = await cleanupCreatedCreditCardDebt(supabase, user.id, creditCardDebtResolution.createdDebtId);
    return { error: cleanupError ? `${subscriptionMetadataResult.error} Automatic card-debt cleanup also failed: ${cleanupError}` : subscriptionMetadataResult.error };
  }
  const extraMetadata = {
    ...creditCardDebtResolution.metadata,
    ...subscriptionMetadataResult.metadata,
  };
  let transactionIds: string[] = [];
  if (resolvedInput.type === "Transfer") {
    const { data, error } = await supabase.from("transactions").insert(transferPairPayload(resolvedInput, user.id, randomUUID(), extraMetadata)).select("id");
    if (error) {
      const cleanupError = await cleanupCreatedCreditCardDebt(supabase, user.id, creditCardDebtResolution.createdDebtId);
      const message = transactionMutationError(error.message);
      return { error: cleanupError ? `${message} Automatic card-debt cleanup also failed: ${cleanupError}` : message };
    }
    transactionIds = (data as Pick<TransactionRow, "id">[] | null)?.map((transaction) => transaction.id) ?? [];
  } else {
    const { data, error } = await supabase.from("transactions").insert({ ...singleTransactionPayload(resolvedInput, extraMetadata), user_id: user.id }).select("id").maybeSingle();
    if (error) {
      const cleanupError = await cleanupCreatedCreditCardDebt(supabase, user.id, creditCardDebtResolution.createdDebtId);
      const message = transactionMutationError(error.message);
      return { error: cleanupError ? `${message} Automatic card-debt cleanup also failed: ${cleanupError}` : message };
    }
    if (data?.id) transactionIds = [data.id as string];
  }
  const [debtReconciliationError, subscriptionReconciliationError] = await Promise.all([
    reconcileDebtIds(supabase, user.id, [linkedDebtIdFromInput(resolvedInput), creditCardDebtResolution.debtId]),
    reconcileSubscriptionIds(supabase, user.id, [linkedSubscriptionIdFromInput(resolvedInput)]),
  ]);
  revalidateTransactionLinkedPaths();
  return { transactionIds, warning: reconciliationWarning(debtReconciliationError, subscriptionReconciliationError) };
}

export async function updateTransaction(transactionId: string, input: TransactionFormData): Promise<ActionResult> {
  const { supabase, user } = await authenticatedClient();
  if (!user) return { error: "You must be signed in." };
  const inputError = validateTransactionInput(input);
  if (inputError) return { error: inputError };
  const planningError = await validateFuturePlanningAmount(supabase, user.id, input);
  if (planningError) return { error: planningError };
  let existingTransaction: MutationTransaction | null;
  let ignoredTransactionIds: string[];
  let previousDebtIds: string[];
  let previousSubscriptionIds: string[];
  try {
    existingTransaction = await fetchTransactionForMutation(supabase, user.id, transactionId);
    if (!existingTransaction) return { error: "Transaction not found." };
    ignoredTransactionIds = await getLinkedTransactionIds(supabase, user.id, existingTransaction);
    const integrityError = transactionMutationIntegrityError(
      existingTransaction,
      await hasPostedReversalForTransactionIds(supabase, user.id, ignoredTransactionIds),
    );
    if (integrityError) return { error: integrityError };
    previousDebtIds = await getDebtIdsForTransactionIds(supabase, user.id, ignoredTransactionIds);
    previousSubscriptionIds = await getSubscriptionIdsForTransactionIds(supabase, user.id, ignoredTransactionIds);
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Unable to load transaction." };
  }

  const allowedArchivedAccountIds = [existingTransaction.account_id, existingTransaction.transfer_account_id]
    .filter((id): id is string => Boolean(id));
  const referenceResult = await validateAndResolveTransactionReferences(
    supabase,
    user.id,
    input,
    allowedArchivedAccountIds,
    existingTransaction.category_id ?? "",
    existingTransaction.related_entity_id && existingTransaction.related_entity_type
      ? {
        id: existingTransaction.related_entity_id,
        transactionIds: ignoredTransactionIds,
        type: existingTransaction.related_entity_type,
      }
      : undefined,
  );
  if (referenceResult.error) return { error: referenceResult.error };
  const validatedInput = referenceResult.input;
  const validationError = await validateAvailableAmount(validatedInput, user.id, ignoredTransactionIds);
  if (validationError) return { error: validationError };
  const creditCardDebtResolution = await resolveCreditCardDebtLink(validatedInput, user.id);
  if ("error" in creditCardDebtResolution) return { error: creditCardDebtResolution.error };
  const resolvedInput = creditCardDebtResolution.input;
  const subscriptionMetadataResult = await subscriptionPaymentMetadataForInput(supabase, user.id, resolvedInput);
  if (subscriptionMetadataResult.error) {
    const cleanupError = await cleanupCreatedCreditCardDebt(supabase, user.id, creditCardDebtResolution.createdDebtId);
    return { error: cleanupError ? `${subscriptionMetadataResult.error} Automatic card-debt cleanup also failed: ${cleanupError}` : subscriptionMetadataResult.error };
  }
  const extraMetadata = {
    ...preservedFuturePlanMetadata(existingTransaction.metadata, resolvedInput.amount),
    ...creditCardDebtResolution.metadata,
    ...subscriptionMetadataResult.metadata,
  };

  const existingGroupId = transferGroupId(metadataRecord(existingTransaction.metadata));
  const existingType = String(existingTransaction.type ?? "").toLowerCase();
  const shouldReplaceRows = resolvedInput.type === "Transfer" || existingGroupId || existingType === "transfer";

  if (shouldReplaceRows) {
    let archivedIds: string[] = [];
    try {
      archivedIds = await archiveLinkedTransactions(supabase, user.id, existingTransaction);
    } catch (error) {
      const cleanupError = await cleanupCreatedCreditCardDebt(supabase, user.id, creditCardDebtResolution.createdDebtId);
      const message = error instanceof Error ? error.message : "Unable to update transaction.";
      return { error: cleanupError ? `${message} Automatic card-debt cleanup also failed: ${cleanupError}` : message };
    }

    if (resolvedInput.type === "Transfer") {
      const { error } = await supabase.from("transactions").insert(transferPairPayload(resolvedInput, user.id, existingGroupId || randomUUID(), extraMetadata));
      if (error) {
        const [restoreError, cleanupError] = await Promise.all([
          restoreArchivedTransactions(supabase, user.id, archivedIds),
          cleanupCreatedCreditCardDebt(supabase, user.id, creditCardDebtResolution.createdDebtId),
        ]);
        const compensationError = [restoreError && `Original restoration failed: ${restoreError}`, cleanupError && `Automatic card-debt cleanup failed: ${cleanupError}`].filter(Boolean).join(" ");
        return { error: `${transactionMutationError(error.message)}${compensationError ? ` ${compensationError}` : ""}` };
      }
    } else {
      const { error } = await supabase.from("transactions").insert({ ...singleTransactionPayload(resolvedInput, extraMetadata), user_id: user.id });
      if (error) {
        const [restoreError, cleanupError] = await Promise.all([
          restoreArchivedTransactions(supabase, user.id, archivedIds),
          cleanupCreatedCreditCardDebt(supabase, user.id, creditCardDebtResolution.createdDebtId),
        ]);
        const compensationError = [restoreError && `Original restoration failed: ${restoreError}`, cleanupError && `Automatic card-debt cleanup failed: ${cleanupError}`].filter(Boolean).join(" ");
        return { error: `${transactionMutationError(error.message)}${compensationError ? ` ${compensationError}` : ""}` };
      }
    }
    const [debtReconciliationError, subscriptionReconciliationError] = await Promise.all([
      reconcileDebtIds(supabase, user.id, [...previousDebtIds, linkedDebtIdFromInput(resolvedInput), creditCardDebtResolution.debtId]),
      reconcileSubscriptionIds(supabase, user.id, [...previousSubscriptionIds, linkedSubscriptionIdFromInput(resolvedInput)]),
    ]);
    revalidateTransactionLinkedPaths([`/transactions/${transactionId}/edit`]);
    return { warning: reconciliationWarning(debtReconciliationError, subscriptionReconciliationError) };
  }

  const { data, error } = await supabase.from("transactions").update(singleTransactionPayload(resolvedInput, extraMetadata)).eq("id", transactionId).eq("user_id", user.id).select("id").maybeSingle();
  if (error || !data) {
    const cleanupError = await cleanupCreatedCreditCardDebt(supabase, user.id, creditCardDebtResolution.createdDebtId);
    const message = error ? transactionMutationError(error.message) : "Transaction not found.";
    return { error: cleanupError ? `${message} Automatic card-debt cleanup also failed: ${cleanupError}` : message };
  }
  const [debtReconciliationError, subscriptionReconciliationError] = await Promise.all([
    reconcileDebtIds(supabase, user.id, [...previousDebtIds, linkedDebtIdFromInput(resolvedInput), creditCardDebtResolution.debtId]),
    reconcileSubscriptionIds(supabase, user.id, [...previousSubscriptionIds, linkedSubscriptionIdFromInput(resolvedInput)]),
  ]);
  revalidateTransactionLinkedPaths([`/transactions/${transactionId}/edit`]);
  return { warning: reconciliationWarning(debtReconciliationError, subscriptionReconciliationError) };
}

export async function markTransactionCleared(transactionId: string): Promise<ActionResult> {
  const { supabase, user } = await authenticatedClient();
  if (!user) return { error: "You must be signed in." };

  try {
    const transaction = await fetchTransactionForMutation(supabase, user.id, transactionId);
    if (!transaction) return { error: "Transaction not found." };
    const status = normalizeTransactionStatus(transaction.status);
    if (status === "cleared") return { transactionIds: [transactionId] };
    if (status !== "pending") {
      return { error: "Only pending transactions can be marked as cleared. Complete a scheduled transaction through Edit so available funds and references are validated." };
    }

    const transactionIds = await getLinkedTransactionIds(supabase, user.id, transaction);
    const integrityError = transactionMutationIntegrityError(
      transaction,
      await hasPostedReversalForTransactionIds(supabase, user.id, transactionIds),
    );
    if (integrityError) return { error: integrityError };
    const debtIds = await getDebtIdsForTransactionIds(supabase, user.id, transactionIds);
    const subscriptionIds = await getSubscriptionIdsForTransactionIds(supabase, user.id, transactionIds);
    const { error } = await supabase
      .from("transactions")
      .update({ status: "cleared" })
      .eq("user_id", user.id)
      .is("deleted_at", null)
      .in("id", transactionIds);
    if (error) return { error: transactionMutationError(error.message) };

    const [debtReconciliationError, subscriptionReconciliationError] = await Promise.all([
      reconcileDebtIds(supabase, user.id, debtIds),
      reconcileSubscriptionIds(supabase, user.id, subscriptionIds),
    ]);
    revalidateTransactionLinkedPaths();
    return { transactionIds, warning: reconciliationWarning(debtReconciliationError, subscriptionReconciliationError) };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Unable to clear transaction." };
  }
}

export async function deleteTransaction(transactionId: string): Promise<ActionResult> {
  const { supabase, user } = await authenticatedClient();
  if (!user) return { error: "You must be signed in." };

  let transaction: MutationTransaction | null;
  try {
    transaction = await fetchTransactionForMutation(supabase, user.id, transactionId);
    if (!transaction) return { error: "Transaction not found." };
    const linkedIds = await getLinkedTransactionIds(supabase, user.id, transaction);
    const integrityError = transactionMutationIntegrityError(
      transaction,
      await hasPostedReversalForTransactionIds(supabase, user.id, linkedIds),
    );
    if (integrityError) return { error: integrityError };
    const previousDebtIds = await getDebtIdsForTransactionIds(supabase, user.id, linkedIds);
    const previousSubscriptionIds = await getSubscriptionIdsForTransactionIds(supabase, user.id, linkedIds);
    const transactionIds = await archiveLinkedTransactions(supabase, user.id, transaction);
    const [debtReconciliationError, subscriptionReconciliationError] = await Promise.all([
      reconcileDebtIds(supabase, user.id, previousDebtIds),
      reconcileSubscriptionIds(supabase, user.id, previousSubscriptionIds),
    ]);
    revalidateTransactionLinkedPaths();
    return { transactionIds, warning: reconciliationWarning(debtReconciliationError, subscriptionReconciliationError) };
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
  const initialIntegrityError = transactionReversalIntegrityError(source, false);
  if (initialIntegrityError) return { error: initialIntegrityError };
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

    const sourceTransactionIds = [debitRow.id, creditRow?.id].filter((id): id is string => Boolean(id));
    let alreadyReversed: boolean;
    try {
      alreadyReversed = await hasPostedReversalForTransactionIds(supabase, user.id, sourceTransactionIds);
    } catch (error) {
      return { error: error instanceof Error ? error.message : "Unable to verify transaction reversal." };
    }
    const integrityError = transactionReversalIntegrityError(debitRow, alreadyReversed);
    if (integrityError) return { error: integrityError };

    const debitMetadata = metadataRecord(debitRow.metadata);
    const creditMetadata = metadataRecord(creditRow?.metadata);
    const reverseInput: TransactionFormData = {
      accountId: creditRow?.account_id ?? debitRow.transfer_account_id ?? "",
      accountAmountType: normalizeAmountType(creditMetadata.account_amount_type ?? debitMetadata.transfer_account_amount_type ?? debitMetadata.account_amount_type),
      amount: numericValue(debitRow.amount),
      categoryId: "",
      date: new Date().toISOString().slice(0, 10),
      futurePlanningAmountId: "",
      note: reversalNote,
      relatedEntityId: debitRow.related_entity_id ?? "",
      relatedEntityType: normalizeRelatedTypeForAction(debitRow.related_entity_type),
      status: "cleared",
      title: reversalNote,
      transferAccountId: debitRow.account_id ?? "",
      transferAccountAmountType: normalizeAmountType(debitMetadata.account_amount_type),
      type: "Transfer",
    };

    const creditCardContext = await creditCardContextForTransaction(supabase, user.id, debitRow)
      ?? (creditRow ? await creditCardContextForTransaction(supabase, user.id, creditRow) : null);
    const reversalMetadata = creditCardReversalMetadata(creditCardContext, debitMetadata, sourceType);

    const { error } = await supabase.from("transactions").insert(transferPairPayload(reverseInput, user.id, randomUUID(), {
      ...reversalMetadata,
      reversed_transaction_id: debitRow.id,
    }));
    if (error) return { error: transactionMutationError(error.message) };
    const [debtReconciliationError, subscriptionReconciliationError] = await Promise.all([
      reconcileDebtIds(supabase, user.id, [linkedDebtIdFromInput(reverseInput), creditCardContext?.debtId]),
      reconcileSubscriptionIds(supabase, user.id, [linkedSubscriptionIdFromInput(reverseInput)]),
    ]);
    revalidateTransactionLinkedPaths();
    return { warning: reconciliationWarning(debtReconciliationError, subscriptionReconciliationError) };
  }


  let alreadyReversed: boolean;
  try {
    alreadyReversed = await hasPostedReversalForTransactionIds(supabase, user.id, [source.id]);
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Unable to verify transaction reversal." };
  }
  const integrityError = transactionReversalIntegrityError(source, alreadyReversed);
  if (integrityError) return { error: integrityError };

  const creditCardContext = await creditCardContextForTransaction(supabase, user.id, source);
  const reversalMetadata = creditCardReversalMetadata(creditCardContext, metadata, sourceType);
  const { error } = await supabase.from("transactions").insert({
    account_id: sourceType === "transfer" ? source.transfer_account_id : source.account_id,
    amount: numericValue(source.amount),
    category_id: reversalType === "transfer" ? null : source.category_id,
    description: reversalNote,
    metadata: {
      ...metadata,
      ...reversalMetadata,
      account_amount_type: sourceType === "transfer"
        ? normalizeAmountType(metadata.transfer_account_amount_type ?? metadata.account_amount_type)
        : normalizeAmountType(metadata.account_amount_type),
      reversed_transaction_id: source.id,
      reversed_transaction_type: sourceType,
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
  const [debtReconciliationError, subscriptionReconciliationError] = await Promise.all([
    reconcileDebtIds(supabase, user.id, [
      source.related_entity_type === "debt" ? source.related_entity_id : "",
      metadataString(metadata, "credit_card_debt_id"),
    ]),
    reconcileSubscriptionIds(supabase, user.id, [source.related_entity_type === "subscription" ? source.related_entity_id : ""]),
  ]);
  revalidateTransactionLinkedPaths();
  return { warning: reconciliationWarning(debtReconciliationError, subscriptionReconciliationError) };
}

function normalizeRelatedTypeForAction(value: string | null): TransactionFormData["relatedEntityType"] {
  if (value === "asset" || value === "budget" || value === "debt" || value === "savings_goal" || value === "subscription") return value;
  return "none";
}
