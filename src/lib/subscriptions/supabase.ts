import type { SupabaseClient } from "@supabase/supabase-js";

import { formatMmk } from "@/lib/currency";
import type { AccountRecord } from "@/lib/accounts/supabase";
import type { CategoryRecord } from "@/lib/categories/supabase";
import type { BillingCycle, SubscriptionRecord, SubscriptionStatus, SummaryMetric, UpcomingSubscriptionBilling } from "@/types/finance";

export type SubscriptionFormData = {
  accountId: string;
  amount: number;
  billingCycle: BillingCycle;
  categoryId: string;
  name: string;
  nextBillingDate: string;
  reminderEnabled: boolean;
  status: SubscriptionStatus;
};

export type SubscriptionRecordWithValues = SubscriptionRecord & {
  accountId: string;
  amountValue: number;
  categoryId: string;
  nextBillingDateValue: string;
};

type SubscriptionRow = {
  account_id?: string | null;
  amount?: number | string | null;
  billing_cycle?: string | null;
  category_id?: string | null;
  id: string;
  metadata?: unknown;
  name: string;
  next_billing_date?: string | null;
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
  if (!value) return "Not set";
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-US", { day: "2-digit", month: "short", year: "numeric" }).format(date);
}

function mapSubscription(row: SubscriptionRow, accounts: Map<string, AccountRecord>, categories: Map<string, CategoryRecord>): SubscriptionRecordWithValues {
  const metadata = metadataRecord(row.metadata);
  const accountId = row.account_id ?? (typeof metadata.account_id === "string" ? metadata.account_id : "");
  const categoryId = row.category_id ?? (typeof metadata.category_id === "string" ? metadata.category_id : "");
  const category = categories.get(categoryId);
  const amountValue = numericValue(row.amount) || numericValue(metadata.amount);
  const nextBillingDateValue = row.next_billing_date ?? (typeof metadata.next_billing_date === "string" ? metadata.next_billing_date : "");

  return {
    accountId,
    amount: formatMmk(amountValue),
    amountValue,
    bg: category?.bg ?? "bg-[#eff6ff]",
    billingCycle: normalizeCycle(row.billing_cycle ?? metadata.billing_cycle),
    category: category?.name ?? (typeof metadata.category_name === "string" ? metadata.category_name : "Uncategorized"),
    categoryId,
    icon: category?.icon ?? "subscriptions",
    id: row.id,
    name: row.name,
    nextBillingDate: formatDate(nextBillingDateValue),
    nextBillingDateValue,
    paymentAccount: accounts.get(accountId)?.name ?? "No account selected",
    reminderEnabled: row.reminder_enabled ?? Boolean(metadata.reminder_enabled),
    status: normalizeStatus(row.status ?? metadata.status),
    tone: category?.tone ?? "text-[#0058be]",
  };
}

export async function getSubscriptions(supabase: SupabaseClient, userId: string, accounts: AccountRecord[], categories: CategoryRecord[]) {
  const { data, error } = await supabase.from("subscriptions").select("*").eq("user_id", userId).is("deleted_at", null).order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data as SubscriptionRow[]).map((row) => mapSubscription(row, new Map(accounts.map((a) => [a.id, a])), new Map(categories.map((c) => [c.id, c]))));
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
  return subscriptions.filter((s) => s.nextBillingDateValue).slice(0, 8).map((subscription, index) => ({
    amount: subscription.amount,
    billingCycle: subscription.billingCycle,
    dateLabel: subscription.nextBillingDate,
    icon: subscription.icon,
    id: subscription.id,
    isNext: index === 0,
    name: subscription.name,
  }));
}
