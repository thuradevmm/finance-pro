"use server";

import { revalidatePath } from "next/cache";

import type { SubscriptionFormData } from "@/lib/subscriptions/supabase";
import { getUserSafely } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/server";

type ActionResult = { error?: string };

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
      category_id: input.categoryId || null,
    },
    name: input.name.trim(),
    next_billing_date: input.nextBillingDate || null,
    reminder_enabled: input.reminderEnabled,
    status: input.status.toLowerCase(),
  };
}

export async function createSubscription(input: SubscriptionFormData): Promise<ActionResult> {
  const { supabase, user } = await authenticatedClient();
  if (!user) return { error: "You must be signed in." };
  const { error } = await supabase.from("subscriptions").insert({ ...payload(input), user_id: user.id });
  if (error) return { error: error.message };
  revalidatePath("/subscriptions");
  return {};
}

export async function updateSubscription(subscriptionId: string, input: SubscriptionFormData): Promise<ActionResult> {
  const { supabase, user } = await authenticatedClient();
  if (!user) return { error: "You must be signed in." };
  const { data, error } = await supabase.from("subscriptions").update(payload(input)).eq("id", subscriptionId).eq("user_id", user.id).select("id").maybeSingle();
  if (error) return { error: error.message };
  if (!data) return { error: "Subscription not found." };
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
