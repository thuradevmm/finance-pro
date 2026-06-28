"use server";

import { randomUUID } from "crypto";
import { revalidatePath } from "next/cache";

import { formatMmk } from "@/lib/currency";
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

type DebtRow = {
  id: string;
  metadata: unknown;
  payment_account_id: string | null;
  status: string | null;
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

function singleTransactionPayload(input: TransactionFormData) {
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

function normalizeAmountType(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : "General";
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

function isActiveDebt(row: DebtRow) {
  const status = String(row.status ?? metadataRecord(row.metadata).status ?? "").toLowerCase();
  return status !== "paid" && status !== "archived";
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

function transferPairPayload(input: TransactionFormData, userId: string, groupId: string = randomUUID()) {
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

  if (isCreditCardAccount(account as AccountRow)) {
    const creditLimit = creditLimitFromMetadata(metadataRecord((account as AccountRow).metadata));
    if (creditLimit <= 0) return null;

    let usedAmount = 0;
    const ignoredIds = new Set(ignoredTransactionIds);
    for (const transaction of transactions as TransactionRow[]) {
      if (ignoredIds.has(transaction.id) || transaction.account_id !== input.accountId) continue;
      if (String(transaction.status ?? "cleared").toLowerCase() === "scheduled") continue;

      const transactionType = String(transaction.type ?? "").toLowerCase();
      const direction = transferDirection(metadataRecord(transaction.metadata));
      const amount = numericValue(transaction.amount);
      if (transactionType === "expense") usedAmount += amount;
      if (transactionType === "income") usedAmount -= amount;
      if (transactionType === "transfer") usedAmount += direction === "credit" ? -amount : amount;
    }

    const availableLimit = Math.max(creditLimit - usedAmount, 0);
    return input.amount > availableLimit
      ? `Insufficient credit card limit. Available limit is ${formatMmk(availableLimit)}.`
      : null;
  }

  let availableAmount = 0;
  const ignoredIds = new Set(ignoredTransactionIds);
  for (const transaction of transactions as TransactionRow[]) {
    if (ignoredIds.has(transaction.id)) continue;
    if (String(transaction.status ?? "cleared").toLowerCase() === "scheduled") continue;

    const transactionType = String(transaction.type ?? "").toLowerCase();
    const metadata = metadataRecord(transaction.metadata);
    const transactionAmountType = normalizeAmountType(metadata.account_amount_type);
    const transferAmountType = normalizeAmountType(metadata.transfer_account_amount_type ?? metadata.account_amount_type);
    const direction = transferDirection(metadata);

    const amount = numericValue(transaction.amount);
    if (transaction.account_id === input.accountId && transactionAmountType === amountType) {
      if (transactionType === "income") availableAmount += amount;
      if (transactionType === "expense") availableAmount -= amount;
      if (transactionType === "transfer") {
        availableAmount += direction === "credit" ? amount : -amount;
      }
    }
    if (transactionType === "transfer" && !direction && transaction.transfer_account_id === input.accountId && transferAmountType === amountType) {
      availableAmount += amount;
    }
  }

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

async function findCreditCardDebtId(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  account: AccountRow,
  referenceDateValue?: string,
) {
  const { data: debts, error: debtsError } = await supabase
    .from("debts")
    .select("id,status,payment_account_id,metadata")
    .eq("user_id", userId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false });

  if (debtsError) return { error: debtsError.message };

  const debtRows = (debts as DebtRow[]).filter(isActiveDebt);
  const explicitDebt = debtRows.find((debt) => {
    const metadata = metadataRecord(debt.metadata);
    return metadata.credit_card_account_id === account.id || metadata.auto_credit_card_account_id === account.id;
  });
  if (explicitDebt) return { debtId: explicitDebt.id };

  const { data: linkedTransactions, error: linkedError } = await supabase
    .from("transactions")
    .select("related_entity_id")
    .eq("user_id", userId)
    .eq("related_entity_type", "debt")
    .or(`account_id.eq.${account.id},transfer_account_id.eq.${account.id}`)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(20);

  if (linkedError) return { error: linkedError.message };

  const activeDebtIds = new Set(debtRows.map((debt) => debt.id));
  const linkedDebt = (linkedTransactions as Pick<TransactionRow, "related_entity_id">[])
    .find((transaction) => transaction.related_entity_id && activeDebtIds.has(transaction.related_entity_id));
  if (linkedDebt?.related_entity_id) return { debtId: linkedDebt.related_entity_id };

  const metadata = metadataRecord(account.metadata);
  const creditLimit = creditLimitFromMetadata(metadata);
  const creditStatementDay = dayOfMonthValue(metadata.credit_statement_day);
  const creditPaymentDueDay = dayOfMonthValue(metadata.credit_payment_due_day);
  const creditMinimumPayment = Math.max(numericValue(metadata.credit_minimum_payment), 0);
  const startDate = parseDateInput(referenceDateValue) ?? new Date();
  const startDateValue = formatDateInput(startDate);
  const nextPaymentDateValue = creditPaymentDueDay
    ? formatDateInput(nextMonthlyDateForDay(creditPaymentDueDay, startDate))
    : formatDateInput(addMonths(startDate, 1));
  const debtPayload = {
    description: `Automatically tracks credit card transactions for ${account.name ?? "Credit Card"}.`,
    lender: account.name ?? "Credit Card",
    metadata: {
      auto_credit_card_account_id: account.id,
      credit_card_account_id: account.id,
      credit_minimum_payment: creditMinimumPayment,
      credit_payment_due_day: creditPaymentDueDay,
      credit_statement_day: creditStatementDay,
      duration_months: 0,
      interest_rate: 0,
      interest_rate_period: "yearly",
      lender: account.name ?? "Credit Card",
      monthly_payment: creditMinimumPayment,
      next_payment_date: nextPaymentDateValue,
      notes: `Automatically tracks credit card transactions for ${account.name ?? "Credit Card"}.`,
      payment_account_id: account.id,
      repaid_amount: 0,
      start_date: startDateValue,
      status: "active",
      total_amount: 0,
      type: "Credit Card",
      ...(creditLimit > 0 ? { credit_limit: creditLimit } : {}),
    },
    monthly_payment: creditMinimumPayment,
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

async function resolveCreditCardDebtLink(input: TransactionFormData, userId: string) {
  const accountResult = await getCreditCardAccountForTransaction(input, userId);
  if ("error" in accountResult) return { error: accountResult.error };
  if (!accountResult.account) return input;

  const { supabase } = await authenticatedClient();
  const debtResult = await findCreditCardDebtId(supabase, userId, accountResult.account, input.date);
  if ("error" in debtResult) return { error: debtResult.error };
  if (!debtResult.debtId) return { error: "Unable to link a credit card debt record." };

  return {
    ...input,
    relatedEntityId: debtResult.debtId,
    relatedEntityType: "debt" as const,
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
    .select("id,metadata,type")
    .eq("id", transactionId)
    .eq("user_id", userId)
    .is("deleted_at", null)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return data as Pick<TransactionRow, "id" | "metadata" | "type"> | null;
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

export async function createTransaction(input: TransactionFormData): Promise<ActionResult> {
  const { supabase, user } = await authenticatedClient();
  if (!user) return { error: "You must be signed in." };
  const resolvedInput = await resolveCreditCardDebtLink(input, user.id);
  if ("error" in resolvedInput) return { error: resolvedInput.error };
  const validationError = await validateAvailableAmount(resolvedInput, user.id);
  if (validationError) return { error: validationError };
  if (resolvedInput.type === "Transfer") {
    const { error } = await supabase.from("transactions").insert(transferPairPayload(resolvedInput, user.id));
    if (error) return { error: transactionMutationError(error.message) };
  } else {
    const { error } = await supabase.from("transactions").insert({ ...singleTransactionPayload(resolvedInput), user_id: user.id });
    if (error) return { error: transactionMutationError(error.message) };
  }
  revalidateTransactionLinkedPaths();
  return {};
}

export async function updateTransaction(transactionId: string, input: TransactionFormData): Promise<ActionResult> {
  const { supabase, user } = await authenticatedClient();
  if (!user) return { error: "You must be signed in." };
  let existingTransaction: Pick<TransactionRow, "id" | "metadata" | "type"> | null;
  let ignoredTransactionIds: string[];
  try {
    existingTransaction = await fetchTransactionForMutation(supabase, user.id, transactionId);
    if (!existingTransaction) return { error: "Transaction not found." };
    ignoredTransactionIds = await getLinkedTransactionIds(supabase, user.id, existingTransaction);
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Unable to load transaction." };
  }

  const resolvedInput = await resolveCreditCardDebtLink(input, user.id);
  if ("error" in resolvedInput) return { error: resolvedInput.error };
  const validationError = await validateAvailableAmount(resolvedInput, user.id, ignoredTransactionIds);
  if (validationError) return { error: validationError };

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
      const { error } = await supabase.from("transactions").insert(transferPairPayload(resolvedInput, user.id, existingGroupId || randomUUID()));
      if (error) return { error: transactionMutationError(error.message) };
    } else {
      const { error } = await supabase.from("transactions").insert({ ...singleTransactionPayload(resolvedInput), user_id: user.id });
      if (error) return { error: transactionMutationError(error.message) };
    }
    revalidateTransactionLinkedPaths([`/transactions/${transactionId}/edit`]);
    return {};
  }

  const { data, error } = await supabase.from("transactions").update(singleTransactionPayload(resolvedInput)).eq("id", transactionId).eq("user_id", user.id).select("id").maybeSingle();
  if (error) return { error: transactionMutationError(error.message) };
  if (!data) return { error: "Transaction not found." };
  revalidateTransactionLinkedPaths([`/transactions/${transactionId}/edit`]);
  return {};
}

export async function deleteTransaction(transactionId: string): Promise<ActionResult> {
  const { supabase, user } = await authenticatedClient();
  if (!user) return { error: "You must be signed in." };

  let transaction: Pick<TransactionRow, "id" | "metadata" | "type"> | null;
  try {
    transaction = await fetchTransactionForMutation(supabase, user.id, transactionId);
    if (!transaction) return { error: "Transaction not found." };
    const transactionIds = await archiveLinkedTransactions(supabase, user.id, transaction);
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
  revalidateTransactionLinkedPaths();
  return {};
}

function normalizeRelatedTypeForAction(value: string | null): TransactionFormData["relatedEntityType"] {
  if (value === "asset" || value === "budget" || value === "debt" || value === "savings_goal" || value === "subscription") return value;
  return "none";
}
