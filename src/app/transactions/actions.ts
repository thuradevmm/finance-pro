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

function normalizeAmountType(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : "General";
}

function isCreditCardAccount(account: AccountRow | null) {
  return String(account?.type ?? "").toLowerCase() === "credit_card";
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

  const { supabase } = await authenticatedClient();
  const amountType = normalizeAmountType(input.accountAmountType);
  const { data: account, error: accountError } = await supabase
    .from("accounts")
    .select("id,type")
    .eq("id", input.accountId)
    .eq("user_id", userId)
    .is("deleted_at", null)
    .maybeSingle();

  if (accountError) return accountError.message;
  if (!account) return "Account not found.";
  if (isCreditCardAccount(account as AccountRow)) return null;

  const { data: transactions, error: transactionsError } = await supabase
    .from("transactions")
    .select("id,account_id,transfer_account_id,amount,type,metadata")
    .eq("user_id", userId)
    .is("deleted_at", null);

  if (transactionsError) return transactionsError.message;

  let availableAmount = 0;
  const ignoredIds = new Set(ignoredTransactionIds);
  for (const transaction of transactions as TransactionRow[]) {
    if (ignoredIds.has(transaction.id)) continue;

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

async function validateCreditCardDebtLink(input: TransactionFormData, userId: string) {
  if (input.type !== "Expense" && input.type !== "Transfer") return null;

  const { supabase } = await authenticatedClient();
  const accountIds = [input.accountId, input.transferAccountId].filter(Boolean);
  if (accountIds.length === 0) return null;

  const { data: accounts, error } = await supabase
    .from("accounts")
    .select("id,type")
    .eq("user_id", userId)
    .in("id", accountIds)
    .is("deleted_at", null);

  if (error) return error.message;

  const accountTypes = new Map((accounts as Pick<AccountRow, "id" | "type">[]).map((account) => [account.id, account.type]));
  const usesCreditCard = String(accountTypes.get(input.accountId) ?? "").toLowerCase() === "credit_card";
  const paysCreditCard = input.type === "Transfer" && String(accountTypes.get(input.transferAccountId) ?? "").toLowerCase() === "credit_card";
  if ((usesCreditCard || paysCreditCard) && input.relatedEntityType !== "debt") {
    return "Credit card charges and payments must be linked to a debt record.";
  }

  return null;
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
  const creditCardLinkError = await validateCreditCardDebtLink(input, user.id);
  if (creditCardLinkError) return { error: creditCardLinkError };
  const validationError = await validateAvailableAmount(input, user.id);
  if (validationError) return { error: validationError };
  if (input.type === "Transfer") {
    const { error } = await supabase.from("transactions").insert(transferPairPayload(input, user.id));
    if (error) return { error: transactionMutationError(error.message) };
  } else {
    const { error } = await supabase.from("transactions").insert({ ...singleTransactionPayload(input), user_id: user.id });
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

  const creditCardLinkError = await validateCreditCardDebtLink(input, user.id);
  if (creditCardLinkError) return { error: creditCardLinkError };
  const validationError = await validateAvailableAmount(input, user.id, ignoredTransactionIds);
  if (validationError) return { error: validationError };

  const existingGroupId = transferGroupId(metadataRecord(existingTransaction.metadata));
  const existingType = String(existingTransaction.type ?? "").toLowerCase();
  const shouldReplaceRows = input.type === "Transfer" || existingGroupId || existingType === "transfer";

  if (shouldReplaceRows) {
    try {
      await archiveLinkedTransactions(supabase, user.id, existingTransaction);
    } catch (error) {
      return { error: error instanceof Error ? error.message : "Unable to update transaction." };
    }

    if (input.type === "Transfer") {
      const { error } = await supabase.from("transactions").insert(transferPairPayload(input, user.id, existingGroupId || randomUUID()));
      if (error) return { error: transactionMutationError(error.message) };
    } else {
      const { error } = await supabase.from("transactions").insert({ ...singleTransactionPayload(input), user_id: user.id });
      if (error) return { error: transactionMutationError(error.message) };
    }
    revalidateTransactionLinkedPaths([`/transactions/${transactionId}/edit`]);
    return {};
  }

  const { data, error } = await supabase.from("transactions").update(singleTransactionPayload(input)).eq("id", transactionId).eq("user_id", user.id).select("id").maybeSingle();
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
