import type { SupabaseClient } from "@supabase/supabase-js";

import { SYSTEM_CURRENCY, formatCurrencyAmount, formatMmk } from "@/lib/currency";
import { combineDateWithTimestampTime, dateTimeSortValue, formatDisplayDate } from "@/lib/date-format";
import type { AccountRecord } from "@/lib/accounts/supabase";
import type { CategoryRecord } from "@/lib/categories/supabase";
import type { BillingCycle, SubscriptionRecord, SubscriptionStatus, SummaryMetric, UpcomingSubscriptionBilling } from "@/types/finance";

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

function daysUntil(value: string) {
  const date = dateOnly(value);
  if (!date) return null;
  const today = new Date();
  const todayOnly = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  return Math.ceil((date.getTime() - todayOnly.getTime()) / 86_400_000);
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

function mapSubscription(row: SubscriptionRow, accounts: Map<string, AccountRecord>, categories: Map<string, CategoryRecord>): SubscriptionRecordWithValues {
  const metadata = metadataRecord(row.metadata);
  const accountId = row.account_id ?? (typeof metadata.account_id === "string" ? metadata.account_id : "");
  const categoryId = row.category_id ?? (typeof metadata.category_id === "string" ? metadata.category_id : "");
  const category = categories.get(categoryId);
  const amountValue = numericValue(row.amount) || numericValue(metadata.amount);
  const billingCurrency = normalizeCurrency(metadata.billing_currency);
  const billedAmountValue = numericValue(metadata.billed_amount, amountValue);
  const exchangeRate = billingCurrency === SYSTEM_CURRENCY ? 1 : numericValue(metadata.exchange_rate, amountValue > 0 && billedAmountValue > 0 ? amountValue / billedAmountValue : 0);
  const nextBillingDateValue = row.next_billing_date ?? (typeof metadata.next_billing_date === "string" ? metadata.next_billing_date : "");
  const reminderEnabled = normalizeReminderEnabled(row.reminder_enabled, metadata.reminder_enabled);
  const reminderDaysBefore = normalizeReminderDays(row.reminder_days_before ?? metadata.reminder_days_before);

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
    name: row.name,
    nextBillingDate: formatDate(nextBillingDateValue),
    nextBillingDateTimeValue: combineDateWithTimestampTime(nextBillingDateValue, row.created_at),
    nextBillingDateValue,
    paymentAccount: accounts.get(accountId)?.name ?? "No account selected",
    exchangeRate,
    exchangeRateLabel: exchangeRateLabel(billingCurrency, exchangeRate),
    reminderDaysBefore,
    reminderEnabled,
    reminderStatus: reminderStatus(nextBillingDateValue, reminderEnabled, reminderDaysBefore),
    status: normalizeStatus(row.status ?? metadata.status),
    tone: category?.tone ?? "text-[#0058be]",
  };
}

export async function getSubscriptions(supabase: SupabaseClient, userId: string, accounts: AccountRecord[], categories: CategoryRecord[], options: { limit?: number } = {}) {
  let query = supabase.from("subscriptions").select("*").eq("user_id", userId).is("deleted_at", null).order("created_at", { ascending: false });
  if (options.limit) query = query.limit(options.limit);

  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return (data as SubscriptionRow[])
    .map((row) => mapSubscription(row, new Map(accounts.map((a) => [a.id, a])), new Map(categories.map((c) => [c.id, c]))))
    .sort((first, second) => dateTimeSortValue(first.nextBillingDateTimeValue ?? "") - dateTimeSortValue(second.nextBillingDateTimeValue ?? ""));
}

export async function getSubscription(supabase: SupabaseClient, userId: string, subscriptionId: string, accounts: AccountRecord[], categories: CategoryRecord[]) {
  const subscriptions = await getSubscriptions(supabase, userId, accounts, categories);
  return subscriptions.find((subscription) => subscription.id === subscriptionId) ?? null;
}

export function getSubscriptionSummaries(subscriptions: SubscriptionRecordWithValues[]): SummaryMetric[] {
  const monthly = subscriptions.reduce((sum, subscription) => sum + (subscription.billingCycle === "Yearly" ? subscription.amountValue / 12 : subscription.billingCycle === "Weekly" ? subscription.amountValue * 4 : subscription.amountValue), 0);
  return [
    { label: "Monthly Cost", value: formatMmk(monthly), icon: "subscriptions", tone: "text-[#0b1c30]", bg: "bg-[#eff6ff]" },
    { label: "Yearly Estimate", value: formatMmk(monthly * 12), icon: "timeline", tone: "text-[#0058be]", bg: "bg-[#eff6ff]" },
    { label: "Active Subscriptions", value: String(subscriptions.filter((s) => s.status === "Active").length), icon: "subscriptions", tone: "text-[#047857]", bg: "bg-[#ecfdf5]" },
    { label: "Reminders", value: String(subscriptions.filter((s) => s.reminderEnabled).length), icon: "bell", tone: "text-[#4f46e5]", bg: "bg-[#eef2ff]" },
  ];
}

export function getUpcomingSubscriptionBillings(subscriptions: SubscriptionRecordWithValues[]): UpcomingSubscriptionBilling[] {
  return subscriptions
    .filter((s) => s.nextBillingDateValue)
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
        reminderDue,
        reminderLabel: subscription.reminderStatus,
      };
    });
}
