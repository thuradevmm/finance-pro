"use server";

import { randomUUID } from "crypto";
import { revalidatePath } from "next/cache";

import { formatMmk } from "@/lib/currency";
import type { TransactionFormData } from "@/lib/transactions/supabase";
import { getUserSafely } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/server";

type ActionResult = { error?: string };

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

function payload(input: TransactionFormData) {
  return {
    account_id: input.accountId || null,
    amount: input.amount,
    category_id: input.type === "Transfer" ? null : input.categoryId || null,
    description: input.note.trim() || null,
    note: input.note.trim() || null,
    payment_method: null,
    metadata: {
      account_amount_type: input.accountAmountType,
      transfer_account_amount_type: input.type === "Transfer" ? input.transferAccountAmountType : null,
    },
    related_entity_id: input.relatedEntityType === "none" ? null : input.relatedEntityId || null,
    related_entity_type: input.relatedEntityType === "none" ? null : input.relatedEntityType,
    status: input.status.toLowerCase(),
    title: input.title.trim() || `${input.type} transaction`,
    transaction_date: input.date,
    transfer_account_id: input.type === "Transfer" ? input.transferAccountId || null : null,
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

function isSameAccountAmountTypeTransfer(input: TransactionFormData) {
  return input.type === "Transfer"
    && input.accountId === input.transferAccountId
    && normalizeAmountType(input.accountAmountType) !== normalizeAmountType(input.transferAccountAmountType);
}

function sameAccountTransferPairPayload(input: TransactionFormData, userId: string) {
  const groupId = randomUUID();
  const title = input.title.trim() || "Transfer transaction";
  const note = input.note.trim() || null;
  const base = {
    amount: input.amount,
    category_id: null,
    description: note,
    note,
    payment_method: null,
    related_entity_id: null,
    related_entity_type: null,
    status: input.status.toLowerCase(),
    transaction_date: input.date,
    transfer_account_id: null,
    user_id: userId,
  };

  return [
    {
      ...base,
      account_id: input.accountId || null,
      metadata: {
        account_amount_type: input.accountAmountType,
        same_account_transfer_group_id: groupId,
        same_account_transfer_role: "out",
        transfer_account_amount_type: input.transferAccountAmountType,
        transfer_account_id: input.transferAccountId,
      },
      title,
      type: "expense",
    },
    {
      ...base,
      account_id: input.transferAccountId || null,
      metadata: {
        account_amount_type: input.transferAccountAmountType,
        same_account_transfer_group_id: groupId,
        same_account_transfer_role: "in",
        transfer_account_amount_type: input.accountAmountType,
        transfer_account_id: input.accountId,
      },
      title,
      type: "income",
    },
  ];
}

async function createSameAccountTransferPair(input: TransactionFormData, userId: string): Promise<ActionResult> {
  const { supabase } = await authenticatedClient();
  const { error } = await supabase.from("transactions").insert(sameAccountTransferPairPayload(input, userId));
  if (error) return { error: error.message };
  revalidateTransactionLinkedPaths();
  return {};
}

async function validateAvailableAmount(input: TransactionFormData, userId: string, ignoredTransactionId?: string) {
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
  for (const transaction of transactions as TransactionRow[]) {
    if (transaction.id === ignoredTransactionId) continue;

    const transactionType = String(transaction.type ?? "").toLowerCase();
    const metadata = metadataRecord(transaction.metadata);
    const transactionAmountType = normalizeAmountType(metadata.account_amount_type);
    const transferAmountType = normalizeAmountType(metadata.transfer_account_amount_type ?? metadata.account_amount_type);

    const amount = numericValue(transaction.amount);
    if (transaction.account_id === input.accountId && transactionAmountType === amountType) {
      if (transactionType === "income") availableAmount += amount;
      if (transactionType === "expense" || transactionType === "transfer") availableAmount -= amount;
    }
    if (transactionType === "transfer" && transaction.transfer_account_id === input.accountId && transferAmountType === amountType) {
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

export async function createTransaction(input: TransactionFormData): Promise<ActionResult> {
  const { supabase, user } = await authenticatedClient();
  if (!user) return { error: "You must be signed in." };
  const creditCardLinkError = await validateCreditCardDebtLink(input, user.id);
  if (creditCardLinkError) return { error: creditCardLinkError };
  const validationError = await validateAvailableAmount(input, user.id);
  if (validationError) return { error: validationError };
  const { error } = await supabase.from("transactions").insert({ ...payload(input), user_id: user.id });
  if (error) {
    if (error.message.includes("chk_transaction_transfer_accounts") && isSameAccountAmountTypeTransfer(input)) {
      return createSameAccountTransferPair(input, user.id);
    }
    return { error: transactionMutationError(error.message) };
  }
  revalidateTransactionLinkedPaths();
  return {};
}

export async function updateTransaction(transactionId: string, input: TransactionFormData): Promise<ActionResult> {
  const { supabase, user } = await authenticatedClient();
  if (!user) return { error: "You must be signed in." };
  const creditCardLinkError = await validateCreditCardDebtLink(input, user.id);
  if (creditCardLinkError) return { error: creditCardLinkError };
  const validationError = await validateAvailableAmount(input, user.id, transactionId);
  if (validationError) return { error: validationError };
  const { data, error } = await supabase.from("transactions").update(payload(input)).eq("id", transactionId).eq("user_id", user.id).select("id").maybeSingle();
  if (error) return { error: transactionMutationError(error.message) };
  if (!data) return { error: "Transaction not found." };
  revalidateTransactionLinkedPaths([`/transactions/${transactionId}/edit`]);
  return {};
}

export async function deleteTransaction(transactionId: string): Promise<ActionResult> {
  const { supabase, user } = await authenticatedClient();
  if (!user) return { error: "You must be signed in." };

  const { data: transaction, error: fetchError } = await supabase
    .from("transactions")
    .select("id,metadata")
    .eq("id", transactionId)
    .eq("user_id", user.id)
    .is("deleted_at", null)
    .maybeSingle();

  if (fetchError) return { error: fetchError.message };
  if (!transaction) return { error: "Transaction not found." };

  const groupId = metadataRecord((transaction as Pick<TransactionRow, "metadata">).metadata).same_account_transfer_group_id;
  if (typeof groupId === "string" && groupId) {
    const { error } = await supabase
      .from("transactions")
      .update({ deleted_at: new Date().toISOString() })
      .eq("user_id", user.id)
      .filter("metadata->>same_account_transfer_group_id", "eq", groupId);
    if (error) return { error: error.message };
    revalidateTransactionLinkedPaths();
    return {};
  }

  const { data, error } = await supabase.from("transactions").update({ deleted_at: new Date().toISOString() }).eq("id", transactionId).eq("user_id", user.id).select("id").maybeSingle();
  if (error) return { error: error.message };
  if (!data) return { error: "Transaction not found." };
  revalidateTransactionLinkedPaths();
  return {};
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
  const reversalType = sourceType === "income" ? "expense" : sourceType === "expense" ? "income" : "transfer";
  const reversalNote = `Reversal of ${source.title || source.note || source.id}`;

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
