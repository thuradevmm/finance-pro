"use server";

import { revalidatePath } from "next/cache";

import type { SavingsGoalFormData } from "@/lib/savings-goals/supabase";
import { createClient } from "@/lib/supabase/server";
import { getUserSafely } from "@/lib/supabase/auth";

type ActionResult = { error?: string };

async function authenticatedClient() {
  const supabase = await createClient();
  const { user } = await getUserSafely(supabase);
  return { supabase, user };
}

function goalPayload(input: SavingsGoalFormData) {
  return {
    account_id: input.accountId || null,
    category_id: input.categoryId || null,
    current_amount: input.savedAmount,
    description: input.description.trim() || null,
    metadata: {
      account_id: input.accountId || null,
      category_id: input.categoryId || null,
      current_amount: input.savedAmount,
      description: input.description.trim(),
      monthly_contribution: input.monthlyContribution,
      saved_amount: input.savedAmount,
      status: input.savedAmount >= input.targetAmount ? "completed" : "active",
      target_amount: input.targetAmount,
      target_date: input.targetDate,
    },
    monthly_contribution: input.monthlyContribution,
    name: input.name.trim(),
    status: input.savedAmount >= input.targetAmount ? "completed" : "active",
    target_amount: input.targetAmount,
    target_date: input.targetDate,
  };
}

export async function createSavingsGoal(input: SavingsGoalFormData): Promise<ActionResult> {
  const { supabase, user } = await authenticatedClient();
  if (!user) return { error: "You must be signed in." };

  const { error } = await supabase.from("savings_goals").insert({ ...goalPayload(input), user_id: user.id });
  if (error) return { error: error.message };

  revalidatePath("/savings-goals");
  return {};
}

export async function updateSavingsGoal(goalId: string, input: SavingsGoalFormData): Promise<ActionResult> {
  const { supabase, user } = await authenticatedClient();
  if (!user) return { error: "You must be signed in." };

  const { data, error } = await supabase
    .from("savings_goals")
    .update(goalPayload(input))
    .eq("id", goalId)
    .eq("user_id", user.id)
    .select("id")
    .maybeSingle();
  if (error) return { error: error.message };
  if (!data) return { error: "Savings goal not found." };

  revalidatePath("/savings-goals");
  revalidatePath(`/savings-goals/${goalId}/edit`);
  return {};
}

export async function deleteSavingsGoal(goalId: string): Promise<ActionResult> {
  const { supabase, user } = await authenticatedClient();
  if (!user) return { error: "You must be signed in." };

  const { data, error } = await supabase
    .from("savings_goals")
    .update({ deleted_at: new Date().toISOString(), status: "archived" })
    .eq("id", goalId)
    .eq("user_id", user.id)
    .select("id")
    .maybeSingle();
  if (error) return { error: error.message };
  if (!data) return { error: "Savings goal not found." };

  revalidatePath("/savings-goals");
  return {};
}
