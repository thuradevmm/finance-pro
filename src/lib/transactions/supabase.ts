import type { SupabaseClient } from "@supabase/supabase-js";

import { SYSTEM_CURRENCY, formatCurrencyAmount } from "@/lib/currency";
import { exchangeRateFor, type CurrencySettings } from "@/lib/currency-conversion";
import { getCurrencySettings } from "@/lib/currency-settings";
import { combineDateWithTimestampTime, formatDisplayDate } from "@/lib/date-format";
import { getAccountOptionLabel, getAccountOptionLabels, type AccountRecord } from "@/lib/accounts/supabase";
import { isTransactionCategoryType } from "@/lib/categories/category-scopes";
import type { CategoryRecord } from "@/lib/categories/supabase";
import type { DebtDatedRepayment, DebtInterestRatePeriod } from "@/lib/debts/emi";
import {
  creditCardAccountId,
  creditCardDebtImpact,
  deriveCreditCardDebtMetadata,
  isCreditCardPayment,
  ledgerRelevantMetadata,
  roundCurrencyValue,
  summarizeTransactionCards,
} from "@/lib/ledger";
import { fetchSupabaseRows } from "@/lib/supabase/pagination";
import { normalizeTransactionStatus, transactionStatusFilterLabels, transactionStatusIsFinalized } from "@/lib/transactions/status";
import type { AccountAmountType, SummaryMetric, Transaction, TransactionFilterOptions, TransactionType } from "@/types/finance";

export type TransactionSubscriptionPaymentSnapshot = {
  billedAmount: number;
  billingCurrency: string;
  billingDueDate: string;
  exchangeRate: number;
};

export type TransactionFuturePlan = {
  endDate: string;
  recurrence: "Monthly" | "Once" | "Weekly" | "Yearly";
  status: "Active" | "Paused";
};

export type TransactionRecord = Transaction & {
  accountId: string;
  accountAmountType: AccountAmountType;
  amountValue: number;
  amountBaseValue: number;
  baseCurrency: string;
  categoryId: string;
  creditCardAccount: string;
  creditCardAccountId: string;
  creditCardDebtImpact: "charge" | "repayment" | "";
  creditCardPayment: boolean;
  currency: string;
  dateValue: string;
  futurePlan?: TransactionFuturePlan;
  futurePlanningAmountId: string;
  hasExchangeRate: boolean;
  isReversal: boolean;
  isReversed: boolean;
  ledgerMetadata: Record<string, unknown>;
  relatedEntityId: string;
  relatedEntityType: TransactionRelatedEntityType;
  status: Transaction["status"];
  title: string;
  transferFromAccountId: string;
  transferAccountId: string;
  transferAccountAmountType: AccountAmountType;
  transferAmount?: number;
  transferToAccountId: string;
  subscriptionPayment?: TransactionSubscriptionPaymentSnapshot;
};

export type TransactionRelatedEntityType = "asset" | "debt" | "none" | "savings_goal" | "subscription";

export type TransactionRelatedOption = {
  categoryId?: string;
  creditCardDebt?: {
    accountId: string;
    accountName: string;
  };
  debtPayoff?: {
    durationMonths: number;
    interestRate: number;
    interestRatePeriod: DebtInterestRatePeriod;
    openingRepaidAmount: number;
    repayments: DebtDatedRepayment[];
    settledAt: string;
    settledEarly: boolean;
    startDate: string;
    totalAmount: number;
  };
  debtRepaymentType?: "Expense" | "Income";
  label: string;
  oneTimeDebtPayoff?: {
    amount: number;
    dueDate: string;
  };
  subscriptionPayment?: {
    amount: number;
    billedAmount: number;
    billingCurrency: string;
    billingCycle: string;
    exchangeRate: number;
    nextBillingDate: string;
  };
  type: TransactionRelatedEntityType;
  value: string;
};

export type TransactionFormData = {
  accountId: string;
  accountAmountType: AccountAmountType;
  amount: number;
  categoryId: string;
  date: string;
  externalReference?: {
    externalId: string;
    groupId?: string;
    source: string;
  };
  futurePlanningAmountId: string;
  futurePlan?: TransactionFuturePlan;
  note: string;
  relatedEntityId: string;
  relatedEntityType: TransactionRelatedEntityType;
  status: string;
  subscriptionPayment?: {
    billedAmount: number;
    billingCurrency: string;
    exchangeRate: number;
    billingDueDate: string;
  };
  title: string;
  transferAccountId: string;
  transferAccountAmountType: AccountAmountType;
  transferAmount?: number;
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

type TransactionDebtRow = {
  id: string;
  metadata: unknown;
  payment_account_id: string | null;
  type: string | null;
};

function metadataRecord(metadata: unknown) {
  return metadata && typeof metadata === "object" && !Array.isArray(metadata)
    ? metadata as Record<string, unknown>
    : {};
}

function metadataString(metadata: Record<string, unknown>, key: string) {
  const value = metadata[key];
  return typeof value === "string" ? value : "";
}

function positiveMetadataNumber(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : 0;
}

function normalizeCurrency(value: unknown) {
  const currency = typeof value === "string" ? value.trim().toUpperCase() : "";
  return currency || SYSTEM_CURRENCY;
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
  if (value === "asset" || value === "debt" || value === "savings_goal" || value === "subscription") return value;
  return "none";
}

function formatSignedCurrency(value: number, currency: string, sign: "negative" | "positive") {
  const formatted = formatCurrencyAmount(Math.abs(value), currency);
  const prefix = sign === "positive" ? "+" : "-";
  return formatted.replace(/(\s)/, `$1${prefix}`);
}

function formatTransactionAmount(value: number, type: TransactionType, currency: string) {
  if (type === "Income") return formatSignedCurrency(value, currency, "positive");
  if (type === "Expense") return formatSignedCurrency(value, currency, "negative");
  return formatCurrencyAmount(value, currency);
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
  if (typeof metadata.credit_card_journal_group_id === "string" && metadata.credit_card_journal_group_id) {
    return metadata.credit_card_journal_group_id;
  }
  if (typeof metadata.transfer_group_id === "string" && metadata.transfer_group_id) return metadata.transfer_group_id;
  if (typeof metadata.same_account_transfer_group_id === "string" && metadata.same_account_transfer_group_id) return metadata.same_account_transfer_group_id;
  return type === "Transfer" ? rowId : "";
}

function formatTransferAmount(value: number, direction: Transaction["transferDirection"] | undefined, currency: string) {
  if (direction === "Debit") return formatSignedCurrency(value, currency, "negative");
  if (direction === "Credit") return formatSignedCurrency(value, currency, "positive");
  return formatCurrencyAmount(value, currency);
}

function subscriptionPaymentSnapshot(row: TransactionRow, metadata: Record<string, unknown>): TransactionSubscriptionPaymentSnapshot | undefined {
  if (row.related_entity_type !== "subscription") return undefined;

  const billedAmount = positiveMetadataNumber(metadata.subscription_billed_amount);
  const exchangeRate = positiveMetadataNumber(metadata.subscription_payment_exchange_rate);
  const billingCurrency = metadataString(metadata, "subscription_billing_currency");
  const billingDueDate = metadataString(metadata, "subscription_billing_due_date");
  if (billedAmount <= 0 && exchangeRate <= 0 && !billingCurrency && !billingDueDate) return undefined;

  return {
    billedAmount,
    billingCurrency: normalizeCurrency(billingCurrency),
    billingDueDate,
    exchangeRate,
  };
}

function futurePlanSnapshot(metadata: Record<string, unknown>): TransactionFuturePlan | undefined {
  const hasFuturePlan = metadata.future_plan === true
    || typeof metadata.future_recurrence === "string"
    || typeof metadata.future_end_date === "string";
  if (!hasFuturePlan) return undefined;

  const recurrenceValue = String(metadata.future_recurrence ?? "once").toLowerCase();
  const recurrence: TransactionFuturePlan["recurrence"] = recurrenceValue === "weekly"
    ? "Weekly"
    : recurrenceValue === "monthly"
      ? "Monthly"
      : recurrenceValue === "yearly"
        ? "Yearly"
        : "Once";

  return {
    endDate: typeof metadata.future_end_date === "string" ? metadata.future_end_date : "",
    recurrence,
    status: String(metadata.future_status ?? "active").toLowerCase() === "paused" ? "Paused" : "Active",
  };
}

function mapTransaction(
  row: TransactionRow,
  accounts: Map<string, AccountRecord>,
  accountList: AccountRecord[],
  categories: Map<string, CategoryRecord>,
  reversedGroupIds: Set<string>,
  currencySettings: CurrencySettings,
): TransactionRecord | null {
  const metadata = metadataRecord(row.metadata);
  const direction = transferDirection(metadata);
  const type = direction ? "Transfer" : normalizeType(row.type);
  const amountValue = Math.abs(Number(row.amount) || 0);
  const account = row.account_id ? accounts.get(row.account_id) : undefined;
  const currency = account?.currency ?? SYSTEM_CURRENCY;
  const historicalExchangeRate = exchangeRateFor(currencySettings, currency, row.transaction_date);
  const amountBaseValue = historicalExchangeRate == null
    ? 0
    : roundCurrencyValue(amountValue * historicalExchangeRate);
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
  const subscriptionPayment = subscriptionPaymentSnapshot(row, metadata);
  const futurePlan = futurePlanSnapshot(metadata);
  const linkedCreditCardAccountId = creditCardAccountId(metadata);
  const linkedCreditCardAccount = linkedCreditCardAccountId ? accounts.get(linkedCreditCardAccountId) : undefined;
  const groupId = transferGroupId(metadata, row.id, type);
  const reversalSourceId = metadataString(metadata, "reversed_transaction_id");

  return {
    account: accountLabel,
    accountAmountType: normalizeAccountAmountType(metadata.account_amount_type),
    accountId: row.account_id ?? "",
    amount: type === "Transfer" ? formatTransferAmount(amountValue, direction, currency) : formatTransactionAmount(amountValue, type, currency),
    amountBaseValue,
    amountValue,
    baseCurrency: currencySettings.baseCurrency,
    category: type === "Transfer" ? "Transfer" : category?.name ?? "Uncategorized",
    categoryId: row.category_id ?? "",
    creditCardAccount: linkedCreditCardAccount ? getAccountOptionLabel(linkedCreditCardAccount, accountList) : "",
    creditCardAccountId: linkedCreditCardAccountId,
    creditCardDebtImpact: creditCardDebtImpact(metadata),
    creditCardPayment: isCreditCardPayment(metadata),
    currency,
    date: formatDisplayDate(row.transaction_date),
    dateValue: row.transaction_date,
    dateTimeValue: combineDateWithTimestampTime(row.transaction_date, row.created_at),
    ...(futurePlan ? { futurePlan } : {}),
    futurePlanningAmountId: metadataString(metadata, "future_planning_amount_id"),
    hasExchangeRate: historicalExchangeRate != null,
    id: row.id,
    isReversal: transactionStatusIsFinalized(row.status) && Boolean(reversalSourceId),
    isReversed: reversedGroupIds.has(groupId || row.id),
    ledgerMetadata: ledgerRelevantMetadata(metadata),
    note,
    relatedEntityId: row.related_entity_id ?? "",
    relatedEntityType: normalizeRelatedType(row.related_entity_type),
    status: normalizeTransactionStatus(row.status),
    title: row.title ?? note,
    transferAccountId,
    transferAccount: transferAccountLabel,
    transferAccountAmountType: normalizeAccountAmountType(metadata.transfer_account_amount_type ?? metadata.account_amount_type),
    transferAmount: positiveMetadataNumber(metadata.transfer_counter_amount) || amountValue,
    transferDirection: direction,
    transferFromAccount,
    transferFromAccountId,
    transferGroupId: groupId,
    transferToAccount,
    transferToAccountId,
    type,
    ...(subscriptionPayment ? { subscriptionPayment } : {}),
    ...(row.related_entity_type === "asset" ? { linkedAssetId: row.related_entity_id ?? undefined } : {}),
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
  const [rows, debtRows, currencySettings] = await Promise.all([
    fetchSupabaseRows<TransactionRow>(
      (from, to) => supabase
        .from("transactions")
        .select("id,transaction_date,type,amount,account_id,transfer_account_id,category_id,status,title,description,note,related_entity_type,related_entity_id,metadata,created_at")
        .eq("user_id", userId)
        .is("deleted_at", null)
        .order("transaction_date", { ascending: false })
        .order("created_at", { ascending: false })
        .range(from, to),
      { limit: options.limit },
    ),
    fetchSupabaseRows<TransactionDebtRow>((from, to) => supabase
      .from("debts")
      .select("id,payment_account_id,type,metadata")
      .eq("user_id", userId)
      .is("deleted_at", null)
      .order("created_at", { ascending: true })
      .range(from, to)),
    getCurrencySettings(supabase, userId),
  ]);

  const enrichedRows = rows.map((row) => ({
    ...row,
    metadata: deriveCreditCardDebtMetadata(row, debtRows, accounts),
  }));
  const rowsById = new Map(enrichedRows.map((row) => [row.id, row]));
  const reversedGroupIds = new Set(enrichedRows.flatMap((row) => {
    const metadata = metadataRecord(row.metadata);
    const sourceId = metadataString(metadata, "reversed_transaction_id");
    if (!sourceId || !transactionStatusIsFinalized(row.status)) return [];
    const source = rowsById.get(sourceId);
    if (!source) return [sourceId];
    const sourceMetadata = metadataRecord(source.metadata);
    const sourceType = transferDirection(sourceMetadata) ? "Transfer" : normalizeType(source.type);
    return [transferGroupId(sourceMetadata, source.id, sourceType) || source.id];
  }));
  const accountsById = new Map(accounts.map((account) => [account.id, account]));
  const categoriesById = new Map(categories.map((category) => [category.id, category]));
  return enrichedRows.flatMap((row) => {
    const transaction = mapTransaction(row, accountsById, accounts, categoriesById, reversedGroupIds, currencySettings);
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
    category: ["Category", ...categories.filter((category) => category.scopes.includes("Transactions") && isTransactionCategoryType(category.type)).map((category) => category.name)],
    status: ["Status", ...transactionStatusFilterLabels()],
    type: ["Type", "Credit", "Debit", "Transfer"],
  };
}

export function getTransactionSummaryValues(transactions: TransactionRecord[]) {
  const ledgerTransactions = transactions.map((transaction) => ({
      account_id: transaction.accountId || null,
      amount: transaction.amountBaseValue ?? 0,
      metadata: transaction.ledgerMetadata,
      related_entity_id: transaction.relatedEntityId || null,
      related_entity_type: transaction.relatedEntityType || null,
      status: transaction.status,
      transfer_account_id: transaction.transferAccountId || null,
      type: transaction.type.toLowerCase(),
  }));
  return summarizeTransactionCards(ledgerTransactions);
}

export function getTransactionSummaries(transactions: TransactionRecord[]): SummaryMetric[] {
  const {
    expenses,
    financingPayments,
    financingReceipts,
    income,
    net,
  } = getTransactionSummaryValues(transactions);
  const netFinancing = roundCurrencyValue(financingReceipts - financingPayments);
  const baseCurrency = transactions[0]?.baseCurrency ?? SYSTEM_CURRENCY;
  return [
    { label: "Operating Credits", value: formatSignedCurrency(income, baseCurrency, "positive"), icon: "trendingUp", tone: "text-[#047857]", bg: "bg-[#ecfdf5]" },
    { label: "Operating Debits", value: formatSignedCurrency(expenses, baseCurrency, "negative"), icon: "trendingDown", tone: "text-[#b42318]", bg: "bg-[#fff1f0]" },
    { label: "Net Activity", value: formatCurrencyAmount(net, baseCurrency), icon: "savings", tone: net < 0 ? "text-[#b42318]" : "text-[#0058be]", bg: "bg-[#eff6ff]" },
    { label: "Financing Receipts", value: formatSignedCurrency(financingReceipts, baseCurrency, "positive"), icon: "trendingUp", tone: "text-[#7c3aed]", bg: "bg-[#f5f3ff]" },
    { label: "Financing Payments", value: formatSignedCurrency(financingPayments, baseCurrency, "negative"), icon: "trendingDown", tone: "text-[#b45309]", bg: "bg-[#fffbeb]" },
    { label: "Net Financing", value: formatCurrencyAmount(netFinancing, baseCurrency), icon: "timeline", tone: netFinancing < 0 ? "text-[#b45309]" : "text-[#7c3aed]", bg: "bg-[#f8f9ff]" },
  ];
}
