import type { SupabaseClient } from "@supabase/supabase-js";

import { formatMmk, formatMmkPreview } from "@/lib/currency";
import type { AccountRecord } from "@/lib/accounts/supabase";
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
  transferAccountId: string;
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
  paymentMethod: string;
  relatedEntityId: string;
  relatedEntityType: TransactionRelatedEntityType;
  status: string;
  title: string;
  transferAccountId: string;
  type: TransactionType;
};

type TransactionRow = {
  account_id: string | null;
  amount: number | string;
  category_id: string | null;
  description: string | null;
  id: string;
  note: string | null;
  payment_method: string | null;
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
  return value === "Saving" ? "Saving" : "Operation";
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

function formatDisplayDate(value: string) {
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-US", { day: "2-digit", month: "short", year: "numeric" }).format(date);
}

function formatTransactionAmount(value: number, type: TransactionType) {
  if (type === "Income") return formatMmkPreview(value, "positive");
  if (type === "Expense") return formatMmkPreview(value, "negative");
  return formatMmk(value);
}

function mapTransaction(row: TransactionRow, accounts: Map<string, AccountRecord>, categories: Map<string, CategoryRecord>): TransactionRecord {
  const type = normalizeType(row.type);
  const amountValue = Number(row.amount) || 0;
  const account = row.account_id ? accounts.get(row.account_id) : undefined;
  const transferAccount = row.transfer_account_id ? accounts.get(row.transfer_account_id) : undefined;
  const category = row.category_id ? categories.get(row.category_id) : undefined;
  const note = row.note || row.description || row.title || `${type} transaction`;
  const metadata = metadataRecord(row.metadata);

  return {
    account: account?.name ?? "Unknown account",
    accountAmountType: normalizeAccountAmountType(metadata.account_amount_type),
    accountId: row.account_id ?? "",
    amount: formatTransactionAmount(amountValue, type),
    amountValue,
    category: type === "Transfer" ? "Transfer" : category?.name ?? "Uncategorized",
    categoryId: row.category_id ?? "",
    date: formatDisplayDate(row.transaction_date),
    dateValue: row.transaction_date,
    id: row.id,
    note,
    paymentMethod: row.payment_method ?? (type === "Transfer" ? "Internal Transfer" : ""),
    relatedEntityId: row.related_entity_id ?? "",
    relatedEntityType: normalizeRelatedType(row.related_entity_type),
    status: row.status ?? "cleared",
    title: row.title ?? note,
    transferAccountId: row.transfer_account_id ?? "",
    type,
    ...(row.related_entity_type === "asset" ? { linkedAssetId: row.related_entity_id ?? undefined } : {}),
    ...(row.related_entity_type === "budget" ? { linkedBudgetId: row.related_entity_id ?? undefined } : {}),
    ...(row.related_entity_type === "debt" ? { linkedDebtId: row.related_entity_id ?? undefined } : {}),
    ...(row.related_entity_type === "savings_goal" ? { linkedSavingsGoalId: row.related_entity_id ?? undefined } : {}),
    ...(row.related_entity_type === "subscription" ? { linkedSubscriptionId: row.related_entity_id ?? undefined } : {}),
    ...(type === "Transfer" && transferAccount ? { note: `${note} → ${transferAccount.name}` } : {}),
  } as TransactionRecord;
}

export async function getTransactions(supabase: SupabaseClient, userId: string, accounts: AccountRecord[], categories: CategoryRecord[]) {
  const { data, error } = await supabase
    .from("transactions")
    .select("id,transaction_date,type,amount,account_id,transfer_account_id,category_id,payment_method,status,title,description,note,related_entity_type,related_entity_id,metadata")
    .eq("user_id", userId)
    .is("deleted_at", null)
    .order("transaction_date", { ascending: false });

  if (error) throw new Error(error.message);
  return (data as TransactionRow[]).map((row) => mapTransaction(row, new Map(accounts.map((a) => [a.id, a])), new Map(categories.map((c) => [c.id, c]))));
}

export async function getTransaction(supabase: SupabaseClient, userId: string, transactionId: string, accounts: AccountRecord[], categories: CategoryRecord[]) {
  const transactions = await getTransactions(supabase, userId, accounts, categories);
  return transactions.find((transaction) => transaction.id === transactionId) ?? null;
}

export function getTransactionFilterOptions(transactions: TransactionRecord[], accounts: AccountRecord[], categories: CategoryRecord[]): TransactionFilterOptions {
  return {
    account: ["Account", ...accounts.map((account) => account.name)],
    amount: ["Amount", "> MMK 100", "< MMK 100", "MMK 500+"],
    category: ["Category", "Transfer", ...categories.filter((category) => category.scopes.includes("Transactions") && isTransactionCategoryType(category.type)).map((category) => category.name)],
    type: ["Type", "Income", "Expense", "Transfer"],
  };
}

export function getTransactionSummaries(transactions: TransactionRecord[]): SummaryMetric[] {
  const income = transactions.filter((t) => t.type === "Income").reduce((sum, t) => sum + t.amountValue, 0);
  const expenses = transactions.filter((t) => t.type === "Expense").reduce((sum, t) => sum + t.amountValue, 0);
  const transfers = transactions.filter((t) => t.type === "Transfer").reduce((sum, t) => sum + t.amountValue, 0);
  return [
    { label: "Income", value: formatMmkPreview(income, "positive"), icon: "trendingUp", tone: "text-[#047857]", bg: "bg-[#ecfdf5]" },
    { label: "Expenses", value: formatMmkPreview(expenses, "negative"), icon: "trendingDown", tone: "text-[#b42318]", bg: "bg-[#fff1f0]" },
    { label: "Transfers", value: formatMmk(transfers), icon: "sync", tone: "text-[#4f46e5]", bg: "bg-[#eef2ff]" },
    { label: "Net", value: formatMmk(income - expenses), icon: "savings", tone: "text-[#0b1c30]", bg: "bg-[#eff6ff]" },
  ];
}
