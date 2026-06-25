"use server";

import { revalidatePath } from "next/cache";

import type { BudgetFormData } from "@/lib/budgets/supabase";
import { getUserSafely } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/server";

type ActionResult = { error?: string };

async function authenticatedClient() {
  const supabase = await createClient();
  const { user, error } = await getUserSafely(supabase);
  return { authError: error, supabase, user };
}

function planPayload(input: BudgetFormData) {
  return {
    description: input.description.trim() || null,
    end_date: input.endDate,
    metadata: {
      category_id: input.categoryId,
      category_name: input.categoryName,
      status: input.status.toLowerCase(),
    },
    name: `${input.categoryName} ${input.period} Budget`,
    period_type: input.period.toLowerCase(),
    plan_type: "budget",
    start_date: input.startDate,
    status: input.status.toLowerCase(),
  };
}

function itemPayload(input: BudgetFormData) {
  return {
    alert_percentage: input.alertPercentage,
    category_id: input.categoryId,
    metadata: {
      alert_percentage: input.alertPercentage,
      category_id: input.categoryId,
      category_name: input.categoryName,
      planned_amount: input.amount,
    },
    note: input.description.trim() || null,
    planned_amount: input.amount,
    type: "expense",
  };
}

export async function createBudget(input: BudgetFormData): Promise<ActionResult> {
  const { authError, supabase, user } = await authenticatedClient();
  if (authError || !user) return { error: authError ?? "You must be signed in." };

  const { data: plan, error: planError } = await supabase.from("budget_plans").insert({ ...planPayload(input), user_id: user.id }).select("id").single();
  if (planError) return { error: planError.message };

  const { error: itemError } = await supabase.from("budget_items").insert({ ...itemPayload(input), budget_plan_id: plan.id, user_id: user.id });
  if (itemError) {
    await supabase.from("budget_plans").delete().eq("id", plan.id).eq("user_id", user.id);
    return { error: itemError.message };
  }

  revalidatePath("/budgets");
  return {};
}

export async function updateBudget(itemId: string, input: BudgetFormData): Promise<ActionResult> {
  const { authError, supabase, user } = await authenticatedClient();
  if (authError || !user) return { error: authError ?? "You must be signed in." };

  const { data: item, error: findError } = await supabase.from("budget_items").select("id,budget_plan_id").eq("id", itemId).eq("user_id", user.id).maybeSingle();
  if (findError) return { error: findError.message };
  if (!item) return { error: "Budget not found." };

  const { error: planError } = await supabase.from("budget_plans").update(planPayload(input)).eq("id", item.budget_plan_id).eq("user_id", user.id);
  if (planError) return { error: planError.message };
  const { error: itemError } = await supabase.from("budget_items").update(itemPayload(input)).eq("id", itemId).eq("user_id", user.id);
  if (itemError) return { error: itemError.message };

  revalidatePath("/budgets");
  revalidatePath(`/budgets/${itemId}/edit`);
  return {};
}

export async function deleteBudget(itemId: string): Promise<ActionResult> {
  const { authError, supabase, user } = await authenticatedClient();
  if (authError || !user) return { error: authError ?? "You must be signed in." };

  const { data: item, error: findError } = await supabase.from("budget_items").select("id,budget_plan_id").eq("id", itemId).eq("user_id", user.id).maybeSingle();
  if (findError) return { error: findError.message };
  if (!item) return { error: "Budget not found." };

  const { error: itemError } = await supabase.from("budget_items").delete().eq("id", itemId).eq("user_id", user.id);
  if (itemError) return { error: itemError.message };
  const { error: planError } = await supabase.from("budget_plans").delete().eq("id", item.budget_plan_id).eq("user_id", user.id);
  if (planError) return { error: planError.message };

  revalidatePath("/budgets");
  return {};
}
