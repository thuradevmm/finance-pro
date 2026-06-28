import type { SupabaseClient } from "@supabase/supabase-js";

import { formatMmk, formatMmkPreview } from "@/lib/currency";
import { combineDateWithTimestampTime, formatDisplayDate } from "@/lib/date-format";
import { getAccountOptionLabel, getAccountOptionLabels, type AccountRecord } from "@/lib/accounts/supabase";
import { isTransactionCategoryType } from "@/lib/categories/category-scopes";
import type { CategoryRecord } from "@/lib/categories/supabase";
import type { AccountAmountType, SummaryMetric, Transaction, TransactionFilterOptions, TransactionType } from "@/types/finance";

export type TransactionRecord = Transaction & {
  accountId: string;
  accountAmountType: AccountAmountType;
  amountValue: number;
  categoryId: string;
  dateValue: string;
  relatedEntityId: string;
  relatedEntityType: TransactionRelatedEntityType;
  status: string;
  title: string;
  transferFromAccountId: string;
  transferAccountId: string;
  transferAccountAmountType: AccountAmountType;
  transferToAccountId: string;
};

export type TransactionRelatedEntityType = "asset" | "budget" | "debt" | "none" | "savings_goal" | "subscription";

export type TransactionRelatedOption = {
  label: string;
  type: TransactionRelatedEntityType;
  value: string;
};

export type TransactionFormData = {
  accountId: string;
  accountAmountType: AccountAmountType;
  amount: number;
  categoryId: string;
  date: string;
  note: string;
  relatedEntityId: string;
  relatedEntityType: TransactionRelatedEntityType;
  status: string;
  title: string;
  transferAccountId: string;
  transferAccountAmountType: AccountAmountType;
  type: TransactionType;
};

type TransactionRow = {
  account_id: string | null;
  amount: number | string;
  category_id: string | null;
  created_at: string | null;
  description: string | null;
  id: string;
  note: string | null;
  related_entity_id: string | null;
  related_entity_type: string | null;
  status: string | null;
  title: string | null;
  transaction_date: string;
  transfer_account_id: string | null;
  type: string;
  metadata: unknown;
};

function metadataRecord(metadata: unknown) {
  return metadata && typeof metadata === "object" && !Array.isArray(metadata)
    ? metadata as Record<string, unknown>
    : {};
}

function normalizeAccountAmountType(value: unknown): AccountAmountType {
  return typeof value === "string" && value.trim() ? value.trim() : "General";
}

function normalizeType(value: string): TransactionType {
  const type = value.toLowerCase();
  if (type === "income") return "Income";
  if (type === "transfer") return "Transfer";
  return "Expense";
}

function normalizeRelatedType(value: string | null): TransactionRelatedEntityType {
  if (value === "asset" || value === "budget" || value === "debt" || value === "savings_goal" || value === "subscription") return value;
  return "none";
}

function formatTransactionAmount(value: number, type: TransactionType) {
  if (type === "Income") return formatMmkPreview(value, "positive");
  if (type === "Expense") return formatMmkPreview(value, "negative");
  return formatMmk(value);
}

function transferDirection(metadata: Record<string, unknown>): Transaction["transferDirection"] | undefined {
  const direction = typeof metadata.transfer_direction === "string" ? metadata.transfer_direction.toLowerCase() : "";
  if (direction === "debit") return "Debit";
  if (direction === "credit") return "Credit";

  const legacyRole = typeof metadata.same_account_transfer_role === "string" ? metadata.same_account_transfer_role.toLowerCase() : "";
  if (legacyRole === "out") return "Debit";
  if (legacyRole === "in") return "Credit";
  return undefined;
}

function transferGroupId(metadata: Record<string, unknown>, rowId: string, type: TransactionType) {
  if (typeof metadata.transfer_group_id === "string" && metadata.transfer_group_id) return metadata.transfer_group_id;
  if (typeof metadata.same_account_transfer_group_id === "string" && metadata.same_account_transfer_group_id) return metadata.same_account_transfer_group_id;
  return type === "Transfer" ? rowId : "";
}

function formatTransferAmount(value: number, direction: Transaction["transferDirection"] | undefined) {
  if (direction === "Debit") return formatMmkPreview(value, "negative");
  if (direction === "Credit") return formatMmkPreview(value, "positive");
  return formatMmk(value);
}

function isPostedTransaction(transaction: Pick<TransactionRecord, "status">) {
  return String(transaction.status ?? "cleared").toLowerCase() !== "scheduled";
}

function isCreditCardAccount(account: AccountRecord | undefined) {
  return account?.type === "Credit Card";
}

function roundCurrencyValue(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function mapTransaction(row: TransactionRow, accounts: Map<string, AccountRecord>, accountList: AccountRecord[], categories: Map<string, CategoryRecord>): TransactionRecord | null {
  const metadata = metadataRecord(row.metadata);
  const direction = transferDirection(metadata);
  const type = direction ? "Transfer" : normalizeType(row.type);
  const amountValue = Number(row.amount) || 0;
  const account = row.account_id ? accounts.get(row.account_id) : undefined;
  const metadataTransferAccountId = typeof metadata.transfer_account_id === "string" ? metadata.transfer_account_id : "";
  const counterAccountId = typeof metadata.counter_account_id === "string" ? metadata.counter_account_id : "";
  const transferAccountId = row.transfer_account_id ?? (counterAccountId || metadataTransferAccountId);
  const transferAccount = transferAccountId ? accounts.get(transferAccountId) : undefined;
  const accountLabel = account ? getAccountOptionLabel(account, accountList) : "Unknown account";
  const transferAccountLabel = transferAccount ? getAccountOptionLabel(transferAccount, accountList) : "";
  const transferFromAccount = type === "Transfer"
    ? direction === "Credit" ? transferAccountLabel : accountLabel
    : undefined;
  const transferToAccount = type === "Transfer"
    ? direction === "Credit" ? accountLabel : transferAccountLabel
    : undefined;
  const transferFromAccountId = type === "Transfer"
    ? direction === "Credit" ? transferAccountId : row.account_id ?? ""
    : "";
  const transferToAccountId = type === "Transfer"
    ? direction === "Credit" ? row.account_id ?? "" : transferAccountId
    : "";
  const category = row.category_id ? categories.get(row.category_id) : undefined;
  const note = row.note || row.description || row.title || `${type} transaction`;

  return {
    account: accountLabel,
    accountAmountType: normalizeAccountAmountType(metadata.account_amount_type),
    accountId: row.account_id ?? "",
    amount: type === "Transfer" ? formatTransferAmount(amountValue, direction) : formatTransactionAmount(amountValue, type),
    amountValue,
    category: type === "Transfer" ? "Transfer" : category?.name ?? "Uncategorized",
    categoryId: row.category_id ?? "",
    date: formatDisplayDate(row.transaction_date),
    dateValue: row.transaction_date,
    dateTimeValue: combineDateWithTimestampTime(row.transaction_date, row.created_at),
    id: row.id,
    note,
    relatedEntityId: row.related_entity_id ?? "",
    relatedEntityType: normalizeRelatedType(row.related_entity_type),
    status: row.status ?? "cleared",
    title: row.title ?? note,
    transferAccountId,
    transferAccount: transferAccountLabel,
    transferAccountAmountType: normalizeAccountAmountType(metadata.transfer_account_amount_type ?? metadata.account_amount_type),
    transferDirection: direction,
    transferFromAccount,
    transferFromAccountId,
    transferGroupId: transferGroupId(metadata, row.id, type),
    transferToAccount,
    transferToAccountId,
    type,
    ...(row.related_entity_type === "asset" ? { linkedAssetId: row.related_entity_id ?? undefined } : {}),
    ...(row.related_entity_type === "budget" ? { linkedBudgetId: row.related_entity_id ?? undefined } : {}),
    ...(row.related_entity_type === "debt" ? { linkedDebtId: row.related_entity_id ?? undefined } : {}),
    ...(row.related_entity_type === "savings_goal" ? { linkedSavingsGoalId: row.related_entity_id ?? undefined } : {}),
    ...(row.related_entity_type === "subscription" ? { linkedSubscriptionId: row.related_entity_id ?? undefined } : {}),
    ...(type === "Transfer" && transferFromAccount && transferToAccount ? { note: `${note} · ${transferFromAccount} → ${transferToAccount}` } : {}),
  } as TransactionRecord;
}

export async function getTransactions(
  supabase: SupabaseClient,
  userId: string,
  accounts: AccountRecord[],
  categories: CategoryRecord[],
  options: { limit?: number } = {},
) {
  let query = supabase
    .from("transactions")
    .select("id,transaction_date,type,amount,account_id,transfer_account_id,category_id,status,title,description,note,related_entity_type,related_entity_id,metadata,created_at")
    .eq("user_id", userId)
    .is("deleted_at", null)
    .order("transaction_date", { ascending: false })
    .order("created_at", { ascending: false });

  if (options.limit) query = query.limit(options.limit);

  const { data, error } = await query;

  if (error) throw new Error(error.message);
  return (data as TransactionRow[]).flatMap((row) => {
    const transaction = mapTransaction(row, new Map(accounts.map((a) => [a.id, a])), accounts, new Map(categories.map((c) => [c.id, c])));
    return transaction ? [transaction] : [];
  });
}

export async function getTransaction(supabase: SupabaseClient, userId: string, transactionId: string, accounts: AccountRecord[], categories: CategoryRecord[]) {
  const transactions = await getTransactions(supabase, userId, accounts, categories);
  return transactions.find((transaction) => transaction.id === transactionId) ?? null;
}

export function getTransactionFilterOptions(transactions: TransactionRecord[], accounts: AccountRecord[], categories: CategoryRecord[]): TransactionFilterOptions {
  return {
    account: ["Account", ...getAccountOptionLabels(accounts)],
    amount: ["Amount", "> MMK 100", "< MMK 100", "MMK 500+"],
    category: ["Category", ...categories.filter((category) => category.scopes.includes("Transactions") && isTransactionCategoryType(category.type)).map((category) => category.name)],
    type: ["Type", "Income", "Expense", "Transfer"],
  };
}

export function getTransactionSummaries(transactions: TransactionRecord[], accounts: AccountRecord[] = []): SummaryMetric[] {
  const accountsById = new Map(accounts.map((account) => [account.id, account]));
  let income = 0;
  let expenses = 0;
  let net = 0;

  for (const transaction of transactions) {
    if (!isPostedTransaction(transaction)) continue;

    const amount = transaction.amountValue ?? 0;
    const account = accountsById.get(transaction.accountId);
    const transferAccount = accountsById.get(transaction.transferAccountId);

    if (transaction.type === "Income") {
      if (!isCreditCardAccount(account)) {
        income = roundCurrencyValue(income + amount);
        net = roundCurrencyValue(net + amount);
      }
    } else if (transaction.type === "Expense") {
      if (!isCreditCardAccount(account)) {
        expenses = roundCurrencyValue(expenses + amount);
        net = roundCurrencyValue(net - amount);
      }
    } else if (transaction.type === "Transfer") {
      if (transaction.transferDirection === "Credit") {
        if (!isCreditCardAccount(account)) net = roundCurrencyValue(net + amount);
      } else if (transaction.transferDirection === "Debit") {
        if (!isCreditCardAccount(account)) net = roundCurrencyValue(net - amount);
      } else {
        if (!isCreditCardAccount(account)) net = roundCurrencyValue(net - amount);
        if (!isCreditCardAccount(transferAccount)) net = roundCurrencyValue(net + amount);
      }
    }
  }

  const transferGroups = new Set<string>();
  const transfers = transactions
    .filter((transaction) => {
      if (!isPostedTransaction(transaction)) return false;
      if (transaction.type !== "Transfer") return false;
      const groupId = transaction.transferGroupId ?? transaction.id;
      if (transferGroups.has(groupId)) return false;
      transferGroups.add(groupId);
      return true;
    })
    .reduce((sum, t) => sum + (t.amountValue ?? 0), 0);
  return [
    { label: "Income", value: formatMmkPreview(income, "positive"), icon: "trendingUp", tone: "text-[#047857]", bg: "bg-[#ecfdf5]" },
    { label: "Expenses", value: formatMmkPreview(expenses, "negative"), icon: "trendingDown", tone: "text-[#b42318]", bg: "bg-[#fff1f0]" },
    { label: "Transfers", value: formatMmk(transfers), icon: "sync", tone: "text-[#4f46e5]", bg: "bg-[#eef2ff]" },
    { label: "Net", value: formatMmk(net), icon: "savings", tone: "text-[#0b1c30]", bg: "bg-[#eff6ff]" },
  ];
}
