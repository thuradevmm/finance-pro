"use server";

import { revalidatePath } from "next/cache";

import { SYSTEM_CURRENCY } from "@/lib/currency";
import { accountStatusContributesToCurrentTotals } from "@/lib/accounts/financial-status";
import { categoryRowSupports } from "@/lib/categories/category-scopes";
import { isValidCalendarDate } from "@/lib/date-validation";
import { roundCurrencyValue } from "@/lib/ledger";
import type { SubscriptionFormData } from "@/lib/subscriptions/supabase";
import { getUserSafely } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/server";
import { isMissingDatabaseObject } from "@/lib/supabase/schema-compat";

type ActionResult = { error?: string };

function revalidateSubscriptionPaths() {
  for (const path of ["/subscriptions", "/categories", "/dashboard", "/reports", "/future-planning", "/scenario-budgeting"]) revalidatePath(path);
}

function storedAccountStatus(account: { is_active: boolean; metadata: unknown }) {
  const metadata = account.metadata && typeof account.metadata === "object" && !Array.isArray(account.metadata)
    ? account.metadata as Record<string, unknown>
    : {};
  return account.is_active === false ? "Archived" : metadata.status === "Needs Review" ? "Needs Review" : "Active";
}

const paymentMetadataKeys = [
  "billing_anchor_date",
  "last_paid_billing_date",
  "last_payment_amount",
  "last_payment_billed_amount",
  "last_payment_billing_currency",
  "last_payment_configured_exchange_rate",
  "last_payment_date",
  "last_payment_exchange_rate",
  "last_payment_transaction_id",
  "last_subscription_reconciled_at",
  "paid_cycle_count",
  "subscription_payment_cutoff_date",
];

async function authenticatedClient() {
  const supabase = await createClient();
  const { user } = await getUserSafely(supabase);
  return { supabase, user };
}

function normalizedSubscriptionAmounts(input: SubscriptionFormData) {
  const billingCurrency = input.billingCurrency.trim().toUpperCase() || SYSTEM_CURRENCY;
  const exchangeRate = billingCurrency === SYSTEM_CURRENCY ? 1 : input.exchangeRate;
  return {
    amount: roundCurrencyValue(input.billedAmount * exchangeRate),
    billingCurrency,
    exchangeRate,
  };
}

function validateSubscriptionInput(input: SubscriptionFormData) {
  const normalized = normalizedSubscriptionAmounts(input);
  if (!input.name.trim()) return "Subscription name is required.";
  if (!input.accountId) return "Select a payment account.";
  if (!input.categoryId) return "Select a subscription category.";
  if (!(["Weekly", "Monthly", "Yearly"] as string[]).includes(input.billingCycle)) return "Choose a valid billing cycle.";
  if (!(["Active", "Expiring", "Paused"] as string[]).includes(input.status)) return "Choose a valid subscription status.";
  if (!/^[A-Z]{3}$/.test(normalized.billingCurrency)) return "Enter a valid three-letter billing currency.";
  if (!Number.isFinite(input.billedAmount) || input.billedAmount <= 0) return "Billed amount must be greater than zero.";
  if (!Number.isFinite(normalized.exchangeRate) || normalized.exchangeRate <= 0) return "Exchange rate must be greater than zero.";
  if (!Number.isFinite(normalized.amount) || normalized.amount <= 0) return "Converted payment amount must be greater than zero.";
  if (!isValidCalendarDate(input.nextBillingDate)) return "Enter a valid next billing date.";
  if (!Number.isInteger(input.reminderDaysBefore) || input.reminderDaysBefore < 0 || input.reminderDaysBefore > 30) return "Reminder lead time must be between 0 and 30 days.";
  return "";
}

async function validateSubscriptionLinks(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  input: SubscriptionFormData,
  allowedExistingCategoryId = "",
) {
  const accountPromise = supabase.from("accounts").select("id,is_active,metadata").eq("id", input.accountId).eq("user_id", userId).is("deleted_at", null).maybeSingle();
  let categoryResult = await supabase.from("categories").select("id,is_active,type,category_type,metadata").eq("id", input.categoryId).eq("user_id", userId).is("deleted_at", null).maybeSingle();
  if (categoryResult.error && isMissingDatabaseObject(categoryResult.error, ["category_type"])) {
    categoryResult = await supabase.from("categories").select("id,is_active,type,metadata").eq("id", input.categoryId).eq("user_id", userId).is("deleted_at", null).maybeSingle();
  }
  const accountResult = await accountPromise;
  const error = accountResult.error ?? categoryResult.error;
  if (error) return error.message;
  if (!accountResult.data || !accountStatusContributesToCurrentTotals(storedAccountStatus(accountResult.data))) return "Select an available payment account.";
  if (!categoryResult.data
    || (categoryResult.data.is_active === false && categoryResult.data.id !== allowedExistingCategoryId)
    || !categoryRowSupports(categoryResult.data, "Subscriptions", "Subscription")) {
    return "Select an active subscription category.";
  }
  return "";
}

function payload(input: SubscriptionFormData) {
  const normalized = normalizedSubscriptionAmounts(input);
  return {
    account_id: input.accountId || null,
    amount: normalized.amount,
    billing_cycle: input.billingCycle.toLowerCase(),
    category_id: input.categoryId || null,
    metadata: {
      account_id: input.accountId || null,
      amount: normalized.amount,
      billing_anchor_date: input.nextBillingDate || null,
      billed_amount: input.billedAmount,
      billing_cycle: input.billingCycle.toLowerCase(),
      billing_currency: normalized.billingCurrency,
      category_id: input.categoryId || null,
      exchange_rate: normalized.exchangeRate,
      next_billing_date: input.nextBillingDate || null,
      reminder_days_before: input.reminderDaysBefore,
      reminder_enabled: input.reminderEnabled,
      status: input.status.toLowerCase(),
    },
    name: input.name.trim(),
    next_billing_date: input.nextBillingDate || null,
    reminder_days_before: input.reminderDaysBefore,
    reminder_enabled: input.reminderEnabled,
    status: input.status.toLowerCase(),
  };
}

type RawSubscriptionPayload = ReturnType<typeof payload>;
type SubscriptionPayload = Partial<Omit<RawSubscriptionPayload, "metadata">> & {
  metadata: Record<string, unknown>;
};

function missingSchemaColumn(errorMessage: string) {
  return errorMessage.match(/Could not find the '([^']+)' column/)?.[1] ?? null;
}

function withoutColumn(currentPayload: SubscriptionPayload, column: string): SubscriptionPayload {
  if (!(column in currentPayload)) return currentPayload;
  const nextPayload = { ...currentPayload };
  const value = nextPayload[column as keyof SubscriptionPayload];
  delete nextPayload[column as keyof SubscriptionPayload];
  nextPayload.metadata = {
    ...(typeof nextPayload.metadata === "object" && nextPayload.metadata !== null ? nextPayload.metadata : {}),
    [column]: value,
  };
  return nextPayload;
}

function metadataRecord(metadata: unknown) {
  return metadata && typeof metadata === "object" && !Array.isArray(metadata)
    ? metadata as Record<string, unknown>
    : {};
}

async function paymentAwarePayload(
  supabase: Awaited<ReturnType<typeof authenticatedClient>>["supabase"],
  subscriptionId: string,
  userId: string,
  input: SubscriptionFormData,
) {
  const nextPayload = payload(input);
  const { data } = await supabase
    .from("subscriptions")
    .select("billing_cycle,metadata,next_billing_date")
    .eq("id", subscriptionId)
    .eq("user_id", userId)
    .maybeSingle();

  if (!data) return nextPayload;

  const existingMetadata = metadataRecord(data.metadata);
  const existingNextBillingDate = typeof data.next_billing_date === "string" ? data.next_billing_date : "";
  const existingBillingCycle = String(data.billing_cycle ?? existingMetadata.billing_cycle ?? "").trim().toLowerCase();
  const scheduleChanged = existingNextBillingDate !== input.nextBillingDate
    || existingBillingCycle !== input.billingCycle.toLowerCase();
  if (scheduleChanged) {
    return {
      ...nextPayload,
      metadata: {
        ...nextPayload.metadata,
        subscription_payment_cutoff_date: new Date().toISOString(),
      },
    };
  }

  return {
    ...nextPayload,
    metadata: {
      ...nextPayload.metadata,
      ...Object.fromEntries(paymentMetadataKeys.filter((key) => key in existingMetadata).map((key) => [key, existingMetadata[key]])),
    },
  };
}

async function insertSubscription(
  supabase: Awaited<ReturnType<typeof authenticatedClient>>["supabase"],
  currentPayload: SubscriptionPayload,
  userId: string,
  retries = 4,
): Promise<ActionResult> {
  const { error } = await supabase.from("subscriptions").insert({ ...currentPayload, user_id: userId });
  if (!error) return {};
  const column = missingSchemaColumn(error.message);
  if (!column || retries <= 0) return { error: error.message };
  return insertSubscription(supabase, withoutColumn(currentPayload, column), userId, retries - 1);
}

async function updateSubscriptionRow(
  supabase: Awaited<ReturnType<typeof authenticatedClient>>["supabase"],
  subscriptionId: string,
  userId: string,
  currentPayload: SubscriptionPayload,
  retries = 4,
): Promise<ActionResult> {
  const { data, error } = await supabase.from("subscriptions").update(currentPayload).eq("id", subscriptionId).eq("user_id", userId).select("id").maybeSingle();
  if (!error && data) return {};
  if (!error && !data) return { error: "Subscription not found." };
  if (!error) return { error: "Could not update subscription." };
  const column = missingSchemaColumn(error.message);
  if (!column || retries <= 0) return { error: error.message };
  return updateSubscriptionRow(supabase, subscriptionId, userId, withoutColumn(currentPayload, column), retries - 1);
}

export async function createSubscription(input: SubscriptionFormData): Promise<ActionResult> {
  const { supabase, user } = await authenticatedClient();
  if (!user) return { error: "You must be signed in." };
  const validationError = validateSubscriptionInput(input);
  if (validationError) return { error: validationError };
  const linkError = await validateSubscriptionLinks(supabase, user.id, input);
  if (linkError) return { error: linkError };
  const result = await insertSubscription(supabase, payload(input), user.id);
  if (result.error) return result;
  revalidateSubscriptionPaths();
  return {};
}

export async function updateSubscription(subscriptionId: string, input: SubscriptionFormData): Promise<ActionResult> {
  const { supabase, user } = await authenticatedClient();
  if (!user) return { error: "You must be signed in." };
  const validationError = validateSubscriptionInput(input);
  if (validationError) return { error: validationError };
  const { data: existingSubscription, error: existingError } = await supabase
    .from("subscriptions")
    .select("id,category_id")
    .eq("id", subscriptionId)
    .eq("user_id", user.id)
    .is("deleted_at", null)
    .maybeSingle();
  if (existingError) return { error: existingError.message };
  if (!existingSubscription) return { error: "Subscription not found." };
  const linkError = await validateSubscriptionLinks(supabase, user.id, input, existingSubscription.category_id ?? "");
  if (linkError) return { error: linkError };
  const result = await updateSubscriptionRow(supabase, subscriptionId, user.id, await paymentAwarePayload(supabase, subscriptionId, user.id, input));
  if (result.error) return result;
  revalidateSubscriptionPaths();
  revalidatePath(`/subscriptions/${subscriptionId}/edit`);
  return {};
}

export async function deleteSubscription(subscriptionId: string): Promise<ActionResult> {
  const { supabase, user } = await authenticatedClient();
  if (!user) return { error: "You must be signed in." };
  const { data, error } = await supabase.from("subscriptions").update({ deleted_at: new Date().toISOString(), status: "archived" }).eq("id", subscriptionId).eq("user_id", user.id).select("id").maybeSingle();
  if (error) return { error: error.message };
  if (!data) return { error: "Subscription not found." };
  revalidateSubscriptionPaths();
  return {};
}
