import type { SupabaseClient } from "@supabase/supabase-js";

import { SYSTEM_CURRENCY, formatCurrencyAmount, formatMmk } from "@/lib/currency";
import { combineDateWithTimestampTime, dateTimeSortValue, formatDisplayDate } from "@/lib/date-format";
import type { AccountRecord } from "@/lib/accounts/supabase";
import type { CategoryRecord } from "@/lib/categories/supabase";
import {
  annualizedSubscriptionCost,
  isOngoingSubscriptionStatus,
  nextSubscriptionBillingDate,
  subscriptionPaymentIsAfterCutoff,
} from "@/lib/subscriptions/calculations";
import type { BillingCycle, SubscriptionPaymentStatus, SubscriptionRecord, SubscriptionStatus, SummaryMetric, UpcomingSubscriptionBilling } from "@/types/finance";

export type SubscriptionFormData = {
  accountId: string;
  amount: number;
  billedAmount: number;
  billingCycle: BillingCycle;
  billingCurrency: string;
  categoryId: string;
  exchangeRate: number;
  name: string;
  nextBillingDate: string;
  reminderDaysBefore: number;
  reminderEnabled: boolean;
  status: SubscriptionStatus;
};

export type SubscriptionRecordWithValues = SubscriptionRecord & {
  accountId: string;
  amountValue: number;
  billedAmountValue: number;
  categoryId: string;
  createdAtValue: string;
  nextBillingDateValue: string;
};

type SubscriptionRow = {
  account_id?: string | null;
  amount?: number | string | null;
  billing_cycle?: string | null;
  category_id?: string | null;
  created_at?: string | null;
  id: string;
  metadata?: unknown;
  name: string;
  next_billing_date?: string | null;
  reminder_days_before?: number | string | null;
  reminder_enabled?: boolean | null;
  status?: string | null;
};

type SubscriptionPaymentRow = {
  amount: number | string | null;
  created_at: string | null;
  id: string;
  metadata: unknown;
  payment_date: string | null;
  subscription_id: string;
  transaction_id: string | null;
};

type SubscriptionTransactionPaymentRow = {
  amount: number | string | null;
  created_at: string | null;
  id: string;
  metadata: unknown;
  related_entity_id: string | null;
  status: string | null;
  transaction_date: string | null;
  type: string | null;
};

type SubscriptionPaymentFallback = {
  amount: number;
  billedAmount: number;
  billingCurrency: string;
  billingDueDate: string;
  configuredExchangeRate: number;
  createdAt: string;
  exchangeRate: number;
  id: string;
  paymentDate: string;
  sortValue: string;
  transactionId: string;
};

function metadataRecord(metadata: unknown) {
  return metadata && typeof metadata === "object" && !Array.isArray(metadata) ? metadata as Record<string, unknown> : {};
}

function numericValue(value: unknown, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function normalizeCycle(value: unknown): BillingCycle {
  const cycle = String(value ?? "").toLowerCase();
  if (cycle === "weekly") return "Weekly";
  if (cycle === "yearly" || cycle === "annual") return "Yearly";
  return "Monthly";
}

function normalizeStatus(value: unknown): SubscriptionStatus {
  const status = String(value ?? "").toLowerCase();
  if (status === "paused") return "Paused";
  if (status === "expiring") return "Expiring";
  return "Active";
}

function formatDate(value: string) {
  return formatDisplayDate(value);
}

function normalizeCurrency(value: unknown) {
  const currency = typeof value === "string" ? value.trim().toUpperCase() : "";
  return currency || SYSTEM_CURRENCY;
}

function dateOnly(value: string) {
  if (!value) return null;
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function todayOnly() {
  const today = new Date();
  return new Date(today.getFullYear(), today.getMonth(), today.getDate());
}

function daysUntil(value: string) {
  const date = dateOnly(value);
  if (!date) return null;
  return Math.ceil((date.getTime() - todayOnly().getTime()) / 86_400_000);
}

function reminderStatus(nextBillingDate: string, reminderEnabled: boolean, reminderDaysBefore: number) {
  if (!reminderEnabled) return "Off";
  const days = daysUntil(nextBillingDate);
  if (days === null) return "No date";
  if (days < 0) return "Overdue";
  if (days === 0) return "Due today";
  if (days <= reminderDaysBefore) return `Due in ${days} day${days === 1 ? "" : "s"}`;
  return `${reminderDaysBefore} day${reminderDaysBefore === 1 ? "" : "s"} before`;
}

function normalizeReminderEnabled(rowValue: boolean | null | undefined, metadataValue: unknown) {
  if (typeof rowValue === "boolean") return rowValue;
  if (typeof metadataValue === "boolean") return metadataValue;
  return true;
}

function normalizeReminderDays(value: unknown) {
  const days = numericValue(value, 3);
  return Math.min(30, Math.max(0, Math.round(days)));
}

function exchangeRateLabel(currency: string, exchangeRate: number) {
  if (currency === SYSTEM_CURRENCY) return "No conversion";
  return `1 ${currency} = ${formatMmk(exchangeRate)}`;
}

function metadataString(metadata: Record<string, unknown>, key: string) {
  const value = metadata[key];
  return typeof value === "string" ? value : "";
}

function paidCycleLabel(cycle: BillingCycle) {
  if (cycle === "Weekly") return "Paid this week";
  if (cycle === "Yearly") return "Paid this year";
  return "Paid this month";
}

function paymentStatusDetail(status: SubscriptionPaymentStatus, days: number | null, lastPaidDate: string, nextBillingDate: string) {
  if (status === "Paid") return lastPaidDate ? `Last paid ${lastPaidDate}. Next billing ${nextBillingDate}.` : `Next billing ${nextBillingDate}.`;
  if (status === "Paused") return "Billing is paused for this subscription.";
  if (status === "No schedule") return "Add a next billing date to track this subscription.";
  if (status === "Overdue") return days === null ? "Billing date is overdue." : `${Math.abs(days)} day${Math.abs(days) === 1 ? "" : "s"} overdue.`;
  if (status === "Due soon") return days === 0 ? "Due today." : `Due in ${days} day${days === 1 ? "" : "s"}.`;
  return `Upcoming on ${nextBillingDate}.`;
}

function paymentStatus({
  billingAnchorDate,
  billingCycle,
  lastPaidBillingDate,
  lastPaidDate,
  nextBillingDate,
  status,
}: {
  billingAnchorDate: string;
  billingCycle: BillingCycle;
  lastPaidBillingDate: string;
  lastPaidDate: string;
  nextBillingDate: string;
  status: SubscriptionStatus;
}) {
  const nextDate = dateOnly(nextBillingDate);
  const days = daysUntil(nextBillingDate);
  const nextBillingDisplay = nextBillingDate ? formatDate(nextBillingDate) : "-";
  const lastPaidDisplay = lastPaidDate ? formatDate(lastPaidDate) : "";
  const expectedNextBillingDate = lastPaidBillingDate
    ? nextSubscriptionBillingDate(billingAnchorDate || lastPaidBillingDate, lastPaidBillingDate, billingCycle)
    : "";
  const isPaidForCurrentPeriod = Boolean(
    expectedNextBillingDate
    && nextDate
    && expectedNextBillingDate === nextBillingDate
    && nextDate > todayOnly(),
  );

  let value: SubscriptionPaymentStatus = "Upcoming";
  if (status === "Paused") value = "Paused";
  else if (!nextBillingDate || days === null) value = "No schedule";
  else if (isPaidForCurrentPeriod) value = "Paid";
  else if (days < 0) value = "Overdue";
  else if (days <= 7) value = "Due soon";

  return {
    isPaidForCurrentPeriod,
    paidCycleLabel: paidCycleLabel(billingCycle),
    paymentStatus: value,
    paymentStatusDetail: paymentStatusDetail(value, days, lastPaidDisplay, nextBillingDisplay),
  };
}

function isPostedExpensePayment(transaction: SubscriptionTransactionPaymentRow, reversedTransactionIds: Set<string>) {
  const status = String(transaction.status ?? "cleared").trim().toLowerCase();
  return (
    String(transaction.type ?? "").toLowerCase() === "expense" &&
    !["scheduled", "cancelled", "canceled", "void", "failed"].includes(status) &&
    !reversedTransactionIds.has(transaction.id)
  );
}

function paymentFallbackFromPaymentRow(payment: SubscriptionPaymentRow): SubscriptionPaymentFallback {
  const metadata = metadataRecord(payment.metadata);
  const paymentDate = payment.payment_date ?? payment.created_at?.slice(0, 10) ?? "";
  const amount = Math.abs(numericValue(payment.amount));
  const billedAmount = numericValue(metadata.billed_amount);
  const exchangeRate = numericValue(metadata.payment_exchange_rate);
  return {
    amount,
    billedAmount,
    billingCurrency: metadataString(metadata, "billing_currency"),
    billingDueDate: metadataString(metadata, "billing_due_date"),
    configuredExchangeRate: numericValue(metadata.configured_exchange_rate),
    createdAt: payment.created_at ?? "",
    exchangeRate: exchangeRate || (billedAmount > 0 ? amount / billedAmount : 0),
    id: payment.id,
    paymentDate,
    sortValue: `${paymentDate}T${payment.created_at ?? ""}`,
    transactionId: payment.transaction_id ?? "",
  };
}

function paymentFallbackFromTransaction(transaction: SubscriptionTransactionPaymentRow): SubscriptionPaymentFallback {
  const paymentDate = transaction.transaction_date ?? transaction.created_at?.slice(0, 10) ?? "";
  const metadata = metadataRecord(transaction.metadata);
  const amount = Math.abs(numericValue(transaction.amount));
  const billedAmount = numericValue(metadata.subscription_billed_amount);
  const exchangeRate = numericValue(metadata.subscription_payment_exchange_rate);
  return {
    amount,
    billedAmount,
    billingCurrency: metadataString(metadata, "subscription_billing_currency"),
    billingDueDate: metadataString(metadata, "subscription_billing_due_date"),
    configuredExchangeRate: numericValue(metadata.subscription_configured_exchange_rate),
    createdAt: transaction.created_at ?? "",
    exchangeRate: exchangeRate || (billedAmount > 0 ? amount / billedAmount : 0),
    id: transaction.id,
    paymentDate,
    sortValue: `${paymentDate}T${transaction.created_at ?? ""}`,
    transactionId: transaction.id,
  };
}

function latestPaymentFallback(payments: SubscriptionPaymentFallback[]) {
  return [...payments].sort((first, second) => second.sortValue.localeCompare(first.sortValue))[0];
}

function effectiveNextBillingDate(nextBillingDate: string, cycle: BillingCycle, billingAnchorDate: string, fallbackBillingDueDate: string, hasMetadataPayment: boolean) {
  if (hasMetadataPayment || !nextBillingDate || !fallbackBillingDueDate || fallbackBillingDueDate < nextBillingDate) return nextBillingDate;
  return nextSubscriptionBillingDate(billingAnchorDate || nextBillingDate, fallbackBillingDueDate, cycle) || nextBillingDate;
}

function mapSubscription(row: SubscriptionRow, accounts: Map<string, AccountRecord>, categories: Map<string, CategoryRecord>, payments: SubscriptionPaymentFallback[] = []): SubscriptionRecordWithValues {
  const metadata = metadataRecord(row.metadata);
  const accountId = row.account_id ?? (typeof metadata.account_id === "string" ? metadata.account_id : "");
  const categoryId = row.category_id ?? (typeof metadata.category_id === "string" ? metadata.category_id : "");
  const category = categories.get(categoryId);
  const amountValue = numericValue(row.amount) || numericValue(metadata.amount);
  const billingCurrency = normalizeCurrency(metadata.billing_currency);
  const billedAmountValue = numericValue(metadata.billed_amount, amountValue);
  const exchangeRate = billingCurrency === SYSTEM_CURRENCY ? 1 : numericValue(metadata.exchange_rate, amountValue > 0 && billedAmountValue > 0 ? amountValue / billedAmountValue : 0);
  const reminderEnabled = normalizeReminderEnabled(row.reminder_enabled, metadata.reminder_enabled);
  const reminderDaysBefore = normalizeReminderDays(row.reminder_days_before ?? metadata.reminder_days_before);
  const billingCycle = normalizeCycle(row.billing_cycle ?? metadata.billing_cycle);
  const status = normalizeStatus(row.status ?? metadata.status);
  const paymentCutoff = metadataString(metadata, "subscription_payment_cutoff_date");
  const fallbackPayment = latestPaymentFallback(
    payments.filter((payment) => subscriptionPaymentIsAfterCutoff(payment, paymentCutoff)),
  );
  const billingAnchorDateValue = metadataString(metadata, "billing_anchor_date")
    || row.next_billing_date
    || metadataString(metadata, "next_billing_date");
  const metadataLastPaymentDate = metadataString(metadata, "last_payment_date");
  const lastPaidDateValue = metadataLastPaymentDate || fallbackPayment?.paymentDate || "";
  const lastPaidBillingDateValue = metadataString(metadata, "last_paid_billing_date") || fallbackPayment?.billingDueDate || "";
  const nextBillingDateValue = effectiveNextBillingDate(
    row.next_billing_date ?? (typeof metadata.next_billing_date === "string" ? metadata.next_billing_date : ""),
    billingCycle,
    billingAnchorDateValue,
    fallbackPayment?.billingDueDate ?? "",
    Boolean(metadataLastPaymentDate),
  );
  const lastPaidAmountValue = metadataLastPaymentDate ? numericValue(metadata.last_payment_amount) : fallbackPayment?.amount ?? 0;
  const lastPaymentBillingCurrency = normalizeCurrency(metadata.last_payment_billing_currency || fallbackPayment?.billingCurrency || billingCurrency);
  const lastPaymentBilledAmountValue = lastPaidDateValue
    ? numericValue(metadata.last_payment_billed_amount, fallbackPayment?.billedAmount || billedAmountValue)
    : 0;
  const lastPaymentExchangeRateValue = lastPaidDateValue
    ? numericValue(metadata.last_payment_exchange_rate, fallbackPayment?.exchangeRate || exchangeRate)
    : 0;
  const payment = paymentStatus({
    billingAnchorDate: billingAnchorDateValue,
    billingCycle,
    lastPaidBillingDate: lastPaidBillingDateValue,
    lastPaidDate: lastPaidDateValue,
    nextBillingDate: nextBillingDateValue,
    status,
  });

  return {
    accountId,
    amount: formatMmk(amountValue),
    amountValue,
    bg: category?.bg ?? "bg-[#eff6ff]",
    billedAmount: formatCurrencyAmount(billedAmountValue, billingCurrency),
    billedAmountValue,
    billingCycle: normalizeCycle(row.billing_cycle ?? metadata.billing_cycle),
    billingCurrency,
    category: category?.name ?? (typeof metadata.category_name === "string" ? metadata.category_name : "Uncategorized"),
    categoryId,
    createdAtValue: row.created_at ?? "",
    icon: category?.icon ?? "subscriptions",
    id: row.id,
    isPaidForCurrentPeriod: payment.isPaidForCurrentPeriod,
    lastPaidAmount: lastPaidDateValue ? formatMmk(lastPaidAmountValue) : "-",
    lastPaidBilledAmount: lastPaidDateValue ? formatCurrencyAmount(lastPaymentBilledAmountValue, lastPaymentBillingCurrency) : "-",
    lastPaidBillingDate: lastPaidBillingDateValue ? formatDate(lastPaidBillingDateValue) : "-",
    lastPaidBillingDateValue,
    lastPaidDate: lastPaidDateValue ? formatDate(lastPaidDateValue) : "-",
    lastPaidDateValue,
    lastPaymentExchangeRateLabel: lastPaidDateValue ? exchangeRateLabel(lastPaymentBillingCurrency, lastPaymentExchangeRateValue) : "-",
    lastPaymentTransactionId: metadataString(metadata, "last_payment_transaction_id") || fallbackPayment?.transactionId || "",
    name: row.name,
    nextBillingDate: formatDate(nextBillingDateValue),
    nextBillingDateTimeValue: combineDateWithTimestampTime(nextBillingDateValue, row.created_at),
    nextBillingDateValue,
    paymentAccount: accounts.get(accountId)?.name ?? "No account selected",
    paidCycleLabel: payment.paidCycleLabel,
    paymentStatus: payment.paymentStatus,
    paymentStatusDetail: payment.paymentStatusDetail,
    exchangeRate,
    exchangeRateLabel: exchangeRateLabel(billingCurrency, exchangeRate),
    reminderDaysBefore,
    reminderEnabled,
    reminderStatus: reminderStatus(nextBillingDateValue, reminderEnabled, reminderDaysBefore),
    status,
    tone: category?.tone ?? "text-[#0058be]",
  };
}

export async function getSubscriptions(supabase: SupabaseClient, userId: string, accounts: AccountRecord[], categories: CategoryRecord[], options: { limit?: number } = {}) {
  let query = supabase.from("subscriptions").select("*").eq("user_id", userId).is("deleted_at", null).order("created_at", { ascending: false });
  if (options.limit) query = query.limit(options.limit);

  const { data, error } = await query;
  if (error) throw new Error(error.message);
  const rows = data as SubscriptionRow[];
  const subscriptionIds = rows.map((row) => row.id);
  const paymentsBySubscription = new Map<string, SubscriptionPaymentFallback[]>();

  if (subscriptionIds.length > 0) {
    const [paymentsResult, transactionsResult] = await Promise.all([
      supabase
        .from("subscription_payments")
        .select("id,subscription_id,transaction_id,amount,payment_date,metadata,created_at")
        .eq("user_id", userId)
        .in("subscription_id", subscriptionIds),
      supabase
        .from("transactions")
        .select("id,related_entity_id,type,amount,status,transaction_date,metadata,created_at")
        .eq("user_id", userId)
        .eq("related_entity_type", "subscription")
        .in("related_entity_id", subscriptionIds)
        .is("deleted_at", null),
    ]);

    if (paymentsResult.error) throw new Error(paymentsResult.error.message);
    if (transactionsResult.error) throw new Error(transactionsResult.error.message);

    const paymentRows = paymentsResult.data as SubscriptionPaymentRow[];
    const transactionRows = transactionsResult.data as SubscriptionTransactionPaymentRow[];
    const transactionsById = new Map(transactionRows.map((transaction) => [transaction.id, transaction]));
    const reversedTransactionIds = new Set(
      transactionRows
        .map((transaction) => {
          const reversedId = metadataString(metadataRecord(transaction.metadata), "reversed_transaction_id");
          const status = String(transaction.status ?? "cleared").trim().toLowerCase();
          return reversedId && !["scheduled", "cancelled", "canceled", "void", "failed"].includes(status) ? reversedId : "";
        })
        .filter(Boolean),
    );
    const paymentTransactionIds = new Set<string>();
    for (const payment of paymentRows) {
      if (payment.transaction_id) {
        const transaction = transactionsById.get(payment.transaction_id);
        if (!transaction || !isPostedExpensePayment(transaction, reversedTransactionIds)) continue;
        paymentTransactionIds.add(payment.transaction_id);
      }
      const items = paymentsBySubscription.get(payment.subscription_id) ?? [];
      items.push(paymentFallbackFromPaymentRow(payment));
      paymentsBySubscription.set(payment.subscription_id, items);
    }

    for (const transaction of transactionRows.filter((item) => isPostedExpensePayment(item, reversedTransactionIds) && !paymentTransactionIds.has(item.id))) {
      if (!transaction.related_entity_id) continue;
      const items = paymentsBySubscription.get(transaction.related_entity_id) ?? [];
      items.push(paymentFallbackFromTransaction(transaction));
      paymentsBySubscription.set(transaction.related_entity_id, items);
    }
  }

  return rows
    .map((row) => mapSubscription(row, new Map(accounts.map((a) => [a.id, a])), new Map(categories.map((c) => [c.id, c])), paymentsBySubscription.get(row.id) ?? []))
    .sort((first, second) => dateTimeSortValue(first.nextBillingDateTimeValue ?? "") - dateTimeSortValue(second.nextBillingDateTimeValue ?? ""));
}

export async function getSubscription(supabase: SupabaseClient, userId: string, subscriptionId: string, accounts: AccountRecord[], categories: CategoryRecord[]) {
  const subscriptions = await getSubscriptions(supabase, userId, accounts, categories);
  return subscriptions.find((subscription) => subscription.id === subscriptionId) ?? null;
}

export function getSubscriptionSummaries(subscriptions: SubscriptionRecordWithValues[]): SummaryMetric[] {
  const ongoing = subscriptions.filter((subscription) => isOngoingSubscriptionStatus(subscription.status));
  const yearly = ongoing.reduce((sum, subscription) => sum + annualizedSubscriptionCost(subscription.amountValue, subscription.billingCycle), 0);
  const monthly = yearly / 12;
  return [
    { label: "Monthly Cost", value: formatMmk(monthly), icon: "subscriptions", tone: "text-[#0b1c30]", bg: "bg-[#eff6ff]" },
    { label: "Yearly Estimate", value: formatMmk(yearly), icon: "timeline", tone: "text-[#0058be]", bg: "bg-[#eff6ff]" },
    { label: "Ongoing Subscriptions", value: String(ongoing.length), icon: "subscriptions", tone: "text-[#047857]", bg: "bg-[#ecfdf5]" },
    { label: "Paid Current Cycle", value: String(ongoing.filter((s) => s.isPaidForCurrentPeriod).length), icon: "check", tone: "text-[#047857]", bg: "bg-[#ecfdf5]" },
  ];
}

export function getUpcomingSubscriptionBillings(subscriptions: SubscriptionRecordWithValues[]): UpcomingSubscriptionBilling[] {
  return subscriptions
    .filter((s) => isOngoingSubscriptionStatus(s.status) && s.nextBillingDateValue)
    .sort((first, second) => dateTimeSortValue(first.nextBillingDateTimeValue ?? "") - dateTimeSortValue(second.nextBillingDateTimeValue ?? ""))
    .slice(0, 8)
    .map((subscription, index) => {
      const days = daysUntil(subscription.nextBillingDateValue);
      const reminderDue = subscription.reminderEnabled && days !== null && days >= 0 && days <= subscription.reminderDaysBefore;

      return {
        amount: subscription.amount,
        billedAmount: subscription.billedAmount,
        billingCycle: subscription.billingCycle,
        dateLabel: subscription.nextBillingDate,
        exchangeRateLabel: subscription.exchangeRateLabel,
        icon: subscription.icon,
        id: subscription.id,
        isNext: index === 0,
        name: subscription.name,
        paymentStatus: subscription.paymentStatus,
        paymentStatusDetail: subscription.paymentStatusDetail,
        reminderDue,
        reminderLabel: subscription.reminderStatus,
      };
    });
}
