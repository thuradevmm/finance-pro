"use server";

import { revalidatePath } from "next/cache";

import type { SubscriptionFormData } from "@/lib/subscriptions/supabase";
import { getUserSafely } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/server";

type ActionResult = { error?: string };

const paymentMetadataKeys = [
  "billing_anchor_date",
  "last_paid_billing_date",
  "last_payment_amount",
  "last_payment_date",
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

function payload(input: SubscriptionFormData) {
  return {
    account_id: input.accountId || null,
    amount: input.amount,
    billing_cycle: input.billingCycle.toLowerCase(),
    category_id: input.categoryId || null,
    metadata: {
      account_id: input.accountId || null,
      amount: input.amount,
      billing_anchor_date: input.nextBillingDate || null,
      billed_amount: input.billedAmount,
      billing_cycle: input.billingCycle.toLowerCase(),
      billing_currency: input.billingCurrency,
      category_id: input.categoryId || null,
      exchange_rate: input.exchangeRate,
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
    .select("metadata,next_billing_date")
    .eq("id", subscriptionId)
    .eq("user_id", userId)
    .maybeSingle();

  if (!data) return nextPayload;

  const existingMetadata = metadataRecord(data.metadata);
  const existingNextBillingDate = typeof data.next_billing_date === "string" ? data.next_billing_date : "";
  if (existingNextBillingDate && existingNextBillingDate !== input.nextBillingDate) return nextPayload;

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
  const result = await insertSubscription(supabase, payload(input), user.id);
  if (result.error) return result;
  revalidatePath("/subscriptions");
  return {};
}

export async function updateSubscription(subscriptionId: string, input: SubscriptionFormData): Promise<ActionResult> {
  const { supabase, user } = await authenticatedClient();
  if (!user) return { error: "You must be signed in." };
  const result = await updateSubscriptionRow(supabase, subscriptionId, user.id, await paymentAwarePayload(supabase, subscriptionId, user.id, input));
  if (result.error) return result;
  revalidatePath("/subscriptions");
  revalidatePath(`/subscriptions/${subscriptionId}/edit`);
  return {};
}

export async function deleteSubscription(subscriptionId: string): Promise<ActionResult> {
  const { supabase, user } = await authenticatedClient();
  if (!user) return { error: "You must be signed in." };
  const { data, error } = await supabase.from("subscriptions").update({ deleted_at: new Date().toISOString(), status: "archived" }).eq("id", subscriptionId).eq("user_id", user.id).select("id").maybeSingle();
  if (error) return { error: error.message };
  if (!data) return { error: "Subscription not found." };
  revalidatePath("/subscriptions");
  return {};
}
