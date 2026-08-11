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

type ActionResult = { error?: string; status?: "active" | "expiring" };

type SubscriptionLifecycleRow = {
  account_id?: string | null;
  archived_at?: string | null;
  category_id?: string | null;
  deleted_at: string | null;
  id: string;
  is_active?: boolean | null;
  metadata: unknown;
  status: string | null;
};

function revalidateSubscriptionPaths(extraPaths: string[] = []) {
  for (const path of [
    "/subscriptions",
    "/accounts",
    "/categories",
    "/dashboard",
    "/future-planning",
    "/notifications",
    "/transactions",
    ...extraPaths,
  ]) revalidatePath(path);
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

function metadataTimestamp(metadata: Record<string, unknown>, key: string) {
  return typeof metadata[key] === "string" && metadata[key] ? metadata[key] : null;
}

function normalizedStatus(status: unknown) {
  return String(status ?? "").trim().toLowerCase();
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

function payload(
  input: SubscriptionFormData,
  existing: { archivedAt?: string | null; metadata?: unknown } = {},
) {
  const normalized = normalizedSubscriptionAmounts(input);
  const isActive = input.status !== "Paused";
  const existingMetadata = metadataRecord(existing.metadata);
  const archivedAt = isActive
    ? null
    : existing.archivedAt ?? metadataTimestamp(existingMetadata, "archived_at") ?? new Date().toISOString();
  return {
    account_id: input.accountId || null,
    amount: normalized.amount,
    archived_at: archivedAt,
    billing_cycle: input.billingCycle.toLowerCase(),
    category_id: input.categoryId || null,
    is_active: isActive,
    metadata: {
      account_id: input.accountId || null,
      amount: normalized.amount,
      archived_at: archivedAt,
      billing_anchor_date: input.nextBillingDate || null,
      billed_amount: input.billedAmount,
      billing_cycle: input.billingCycle.toLowerCase(),
      billing_currency: normalized.billingCurrency,
      category_id: input.categoryId || null,
      exchange_rate: normalized.exchangeRate,
      is_active: isActive,
      lifecycle_status: isActive ? "active" : "archived",
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
  deleted_at?: string | null;
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
  let existingResult = await supabase
    .from("subscriptions")
    .select("billing_cycle,metadata,next_billing_date,status,is_active,archived_at")
    .eq("id", subscriptionId)
    .eq("user_id", userId)
    .maybeSingle();
  if (existingResult.error && isMissingDatabaseObject(existingResult.error, ["is_active", "archived_at"])) {
    existingResult = await supabase
      .from("subscriptions")
      .select("billing_cycle,metadata,next_billing_date,status")
      .eq("id", subscriptionId)
      .eq("user_id", userId)
      .maybeSingle();
  }

  const data = existingResult.data as {
    archived_at?: string | null;
    billing_cycle: string | null;
    metadata: unknown;
    next_billing_date: string | null;
  } | null;
  const nextPayload = payload(input, { archivedAt: data?.archived_at, metadata: data?.metadata });

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
  const { data, error } = await supabase.from("subscriptions").update(currentPayload).eq("id", subscriptionId).eq("user_id", userId).is("deleted_at", null).select("id").maybeSingle();
  if (!error && data) return {};
  if (!error && !data) return { error: "Subscription not found." };
  if (!error) return { error: "Could not update subscription." };
  const column = missingSchemaColumn(error.message);
  if (!column || retries <= 0) return { error: error.message };
  return updateSubscriptionRow(supabase, subscriptionId, userId, withoutColumn(currentPayload, column), retries - 1);
}

async function getOwnedSubscription(
  supabase: Awaited<ReturnType<typeof authenticatedClient>>["supabase"],
  userId: string,
  subscriptionId: string,
) {
  let result = await supabase
    .from("subscriptions")
    .select("id,account_id,category_id,status,metadata,deleted_at,is_active,archived_at")
    .eq("id", subscriptionId)
    .eq("user_id", userId)
    .maybeSingle();
  if (result.error && isMissingDatabaseObject(result.error, ["is_active", "archived_at"])) {
    result = await supabase
      .from("subscriptions")
      .select("id,account_id,category_id,status,metadata,deleted_at")
      .eq("id", subscriptionId)
      .eq("user_id", userId)
      .maybeSingle();
  }
  return { data: result.data as SubscriptionLifecycleRow | null, error: result.error };
}

function subscriptionHasStoredPaymentHistory(metadata: Record<string, unknown>) {
  return Number(metadata.paid_cycle_count) > 0
    || [
      "last_paid_billing_date",
      "last_payment_amount",
      "last_payment_billed_amount",
      "last_payment_date",
      "last_payment_transaction_id",
      "last_subscription_reconciled_at",
    ].some((key) => metadata[key] !== null && metadata[key] !== undefined && metadata[key] !== "");
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
  revalidateSubscriptionPaths([`/subscriptions/${subscriptionId}/edit`]);
  return {};
}

export async function deactivateSubscription(subscriptionId: string): Promise<ActionResult> {
  if (!subscriptionId?.trim()) return { error: "Subscription not found." };
  const { supabase, user } = await authenticatedClient();
  if (!user) return { error: "You must be signed in." };
  const { data: target, error: targetError } = await getOwnedSubscription(supabase, user.id, subscriptionId);
  if (targetError) return { error: targetError.message };
  if (!target || target.deleted_at) return { error: "Subscription not found." };
  const isPaused = normalizedStatus(target.status) === "paused";
  if (isPaused && target.is_active !== true) return {};

  const metadata = metadataRecord(target.metadata);
  const deactivatedAt = target.archived_at
    ?? metadataTimestamp(metadata, "deactivated_at")
    ?? metadataTimestamp(metadata, "archived_at")
    ?? new Date().toISOString();
  const previousStatus = isPaused
    ? String(metadata.status_before_deactivation ?? "active")
    : normalizedStatus(target.status || metadata.status || "active");
  const result = await updateSubscriptionRow(supabase, subscriptionId, user.id, {
    archived_at: deactivatedAt,
    is_active: false,
    metadata: {
      ...metadata,
      archived_at: deactivatedAt,
      deactivated_at: deactivatedAt,
      deactivation_reason: "user_requested",
      is_active: false,
      lifecycle_status: "archived",
      retirement_reason: "no_longer_tracked",
      status: "paused",
      status_before_deactivation: previousStatus,
    },
    status: "paused",
  });
  if (result.error) return result;
  revalidateSubscriptionPaths([`/subscriptions/${subscriptionId}/edit`]);
  return {};
}

export async function restoreSubscription(subscriptionId: string): Promise<ActionResult> {
  if (!subscriptionId?.trim()) return { error: "Subscription not found." };
  const { supabase, user } = await authenticatedClient();
  if (!user) return { error: "You must be signed in." };
  const { data: target, error: targetError } = await getOwnedSubscription(supabase, user.id, subscriptionId);
  if (targetError) return { error: targetError.message };
  if (!target || target.deleted_at) return { error: "Subscription not found." };
  if (normalizedStatus(target.status) !== "paused" && target.is_active !== false) return {};

  const metadata = metadataRecord(target.metadata);
  const [accountResult, categoryResult] = await Promise.all([
    target.account_id
      ? supabase.from("accounts").select("id,is_active").eq("id", target.account_id).eq("user_id", user.id).is("deleted_at", null).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    target.category_id
      ? supabase.from("categories").select("id,is_active").eq("id", target.category_id).eq("user_id", user.id).is("deleted_at", null).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ]);
  const dependencyError = accountResult.error ?? categoryResult.error;
  if (dependencyError) return { error: dependencyError.message };
  if (!target.account_id || !accountResult.data || accountResult.data.is_active === false) {
    return { error: "Restore or reassign the payment account before restoring this subscription." };
  }
  if (!target.category_id || !categoryResult.data || categoryResult.data.is_active === false) {
    return { error: "Restore or reassign the subscription category before restoring this subscription." };
  }
  const restoredAt = new Date().toISOString();
  const restoredStatus = normalizedStatus(metadata.status_before_deactivation) === "expiring" ? "expiring" : "active";
  const result = await updateSubscriptionRow(supabase, subscriptionId, user.id, {
    archived_at: null,
    is_active: true,
    metadata: {
      ...metadata,
      archived_at: null,
      deactivated_at: null,
      is_active: true,
      lifecycle_status: "active",
      restored_at: restoredAt,
      status: restoredStatus,
    },
    status: restoredStatus,
  });
  if (result.error) return result;
  revalidateSubscriptionPaths([`/subscriptions/${subscriptionId}/edit`]);
  return { status: restoredStatus };
}

export async function deleteSubscription(subscriptionId: string): Promise<ActionResult> {
  if (!subscriptionId?.trim()) return { error: "Subscription not found." };
  const { supabase, user } = await authenticatedClient();
  if (!user) return { error: "You must be signed in." };
  const { data: target, error: targetError } = await getOwnedSubscription(supabase, user.id, subscriptionId);
  if (targetError) return { error: targetError.message };
  if (!target) return { error: "Subscription not found." };
  if (target.deleted_at) return {};

  const [transactionsResult, paymentsResult, filesResult] = await Promise.all([
    supabase.from("transactions").select("id").eq("user_id", user.id).ilike("related_entity_type", "subscription").eq("related_entity_id", subscriptionId).limit(1),
    supabase.from("subscription_payments").select("id").eq("user_id", user.id).eq("subscription_id", subscriptionId).limit(1),
    supabase.from("file_links").select("id").eq("user_id", user.id).ilike("entity_type", "subscription").eq("entity_id", subscriptionId).limit(1),
  ]);
  const historyError = transactionsResult.error ?? paymentsResult.error ?? filesResult.error;
  if (historyError) return { error: historyError.message };
  const metadata = metadataRecord(target.metadata);
  if ((transactionsResult.data?.length ?? 0) > 0
    || (paymentsResult.data?.length ?? 0) > 0
    || (filesResult.data?.length ?? 0) > 0
    || subscriptionHasStoredPaymentHistory(metadata)) {
    return { error: "This subscription has payment history and cannot be deleted. Change its status to Paused so its transactions remain reconcilable." };
  }
  const deletedAt = new Date().toISOString();
  const archivedAt = target.archived_at ?? metadataTimestamp(metadata, "archived_at") ?? deletedAt;
  const result = await updateSubscriptionRow(supabase, subscriptionId, user.id, {
    archived_at: archivedAt,
    deleted_at: deletedAt,
    is_active: false,
    metadata: {
      ...metadata,
      archived_at: archivedAt,
      deleted_at: deletedAt,
      deletion_reason: "user_requested_unused_record",
      is_active: false,
      lifecycle_status: "deleted",
      status: "archived",
    },
    status: "archived",
  });
  if (result.error) return result;
  revalidateSubscriptionPaths([`/subscriptions/${subscriptionId}/edit`]);
  return {};
}
