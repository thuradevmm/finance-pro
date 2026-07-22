"use server";

import { revalidatePath } from "next/cache";

import { budgetRangesOverlap, effectiveBudgetEndDate, linkedBudgetEditError } from "@/lib/budgets/calculations";
import { categoryRowSupports } from "@/lib/categories/category-scopes";
import { isValidCalendarDate } from "@/lib/date-validation";
import type { BudgetFormData } from "@/lib/budgets/supabase";
import { getUserSafely } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/server";
import { isMissingDatabaseObject } from "@/lib/supabase/schema-compat";

type ActionResult = { error?: string };

function revalidateBudgetPaths() {
  for (const path of ["/budgets", "/categories", "/dashboard", "/future-planning", "/reports", "/scenario-budgeting"]) revalidatePath(path);
}

async function authenticatedClient() {
  const supabase = await createClient();
  const { user, error } = await getUserSafely(supabase);
  return { authError: error, supabase, user };
}

function planPayload(input: BudgetFormData) {
  const endDate = effectiveBudgetEndDate(input.startDate, input.endDate, input.period);
  return {
    description: input.description.trim() || null,
    end_date: endDate,
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

function validateBudgetInput(input: BudgetFormData) {
  const endDate = effectiveBudgetEndDate(input.startDate, input.endDate, input.period);
  if (!input.categoryId) return "Select a budget category.";
  if (!Number.isFinite(input.amount) || input.amount <= 0) return "Budget amount must be greater than zero.";
  if (!Number.isFinite(input.alertPercentage) || input.alertPercentage < 0 || input.alertPercentage > 100) return "Alert threshold must be between 0 and 100 percent.";
  if (!isValidCalendarDate(input.startDate)) return "Enter a valid budget start date.";
  if (!endDate || !isValidCalendarDate(endDate)) return "Enter a valid budget end date.";
  if (endDate < input.startDate) return "Budget end date cannot be before its start date.";
  return "";
}

async function overlappingBudgetError(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  input: BudgetFormData,
  ignoredPlanId = "",
) {
  if (input.status !== "Active") return "";
  const { data: itemRows, error: itemError } = await supabase
    .from("budget_items")
    .select("budget_plan_id")
    .eq("user_id", userId)
    .eq("category_id", input.categoryId);
  if (itemError) return itemError.message;

  const planIds = Array.from(new Set((itemRows ?? [])
    .map((item) => item.budget_plan_id as string)
    .filter((planId) => planId && planId !== ignoredPlanId)));
  if (planIds.length === 0) return "";

  const { data: planRows, error: planError } = await supabase
    .from("budget_plans")
    .select("id,period_type,start_date,end_date,status")
    .eq("user_id", userId)
    .is("deleted_at", null)
    .in("id", planIds);
  if (planError) return planError.message;

  const nextRange = {
    startDate: input.startDate,
    endDate: effectiveBudgetEndDate(input.startDate, input.endDate, input.period),
  };
  const overlaps = (planRows ?? []).some((plan) => {
    if (String(plan.status).toLowerCase() !== "active") return false;
    if (String(plan.period_type).toLowerCase() !== input.period.toLowerCase()) return false;
    return budgetRangesOverlap(nextRange, {
      startDate: String(plan.start_date),
      endDate: effectiveBudgetEndDate(
        String(plan.start_date),
        plan.end_date as string | null,
        String(plan.period_type).toLowerCase() === "yearly" ? "Yearly" : "Monthly",
      ),
    });
  });
  return overlaps ? "An active budget for this category already overlaps these dates." : "";
}

async function validateBudgetCategory(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  categoryId: string,
  allowedExistingCategoryId = "",
) {
  let { data, error } = await supabase
    .from("categories")
    .select("id,is_active,type,category_type,metadata")
    .eq("id", categoryId)
    .eq("user_id", userId)
    .is("deleted_at", null)
    .maybeSingle();
  if (error && isMissingDatabaseObject(error, ["category_type"])) {
    ({ data, error } = await supabase
      .from("categories")
      .select("id,is_active,type,metadata")
      .eq("id", categoryId)
      .eq("user_id", userId)
      .is("deleted_at", null)
      .maybeSingle());
  }
  if (error) return error.message;
  if (!data || (data.is_active === false && data.id !== allowedExistingCategoryId) || !categoryRowSupports(data, "Transactions", "Expense")) return "Select an active expense category.";
  return "";
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
  const validationError = validateBudgetInput(input);
  if (validationError) return { error: validationError };
  const categoryError = await validateBudgetCategory(supabase, user.id, input.categoryId);
  if (categoryError) return { error: categoryError };
  const overlapError = await overlappingBudgetError(supabase, user.id, input);
  if (overlapError) return { error: overlapError };

  const { data: plan, error: planError } = await supabase.from("budget_plans").insert({ ...planPayload(input), user_id: user.id }).select("id").single();
  if (planError) return { error: planError.message };

  const { error: itemError } = await supabase.from("budget_items").insert({ ...itemPayload(input), budget_plan_id: plan.id, user_id: user.id });
  if (itemError) {
    const { error: cleanupError } = await supabase.from("budget_plans").delete().eq("id", plan.id).eq("user_id", user.id);
    return { error: cleanupError ? `${itemError.message} The empty plan could not be cleaned up: ${cleanupError.message}` : itemError.message };
  }

  revalidateBudgetPaths();
  return {};
}

export async function updateBudget(itemId: string, input: BudgetFormData): Promise<ActionResult> {
  const { authError, supabase, user } = await authenticatedClient();
  if (authError || !user) return { error: authError ?? "You must be signed in." };
  const validationError = validateBudgetInput(input);
  if (validationError) return { error: validationError };
  const { data: item, error: findError } = await supabase
    .from("budget_items")
    .select("id,budget_plan_id,category_id,planned_amount,alert_percentage,note,type,metadata")
    .eq("id", itemId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (findError) return { error: findError.message };
  if (!item) return { error: "Budget not found." };
  const categoryError = await validateBudgetCategory(supabase, user.id, input.categoryId, item.category_id ?? "");
  if (categoryError) return { error: categoryError };
  const { data: existingPlan, error: existingPlanError } = await supabase
    .from("budget_plans")
    .select("description,end_date,metadata,name,period_type,plan_type,start_date,status")
    .eq("id", item.budget_plan_id)
    .eq("user_id", user.id)
    .maybeSingle();
  if (existingPlanError) return { error: existingPlanError.message };
  if (!existingPlan) return { error: "The budget plan linked to this item was not found." };
  const { data: linkedTransactions, error: linkedTransactionsError } = await supabase
    .from("transactions")
    .select("transaction_date")
    .eq("user_id", user.id)
    .eq("related_entity_type", "budget")
    .eq("related_entity_id", itemId);
  if (linkedTransactionsError) return { error: linkedTransactionsError.message };
  const linkedEditError = linkedBudgetEditError(item.category_id, {
    categoryId: input.categoryId,
    endDate: effectiveBudgetEndDate(input.startDate, input.endDate, input.period),
    startDate: input.startDate,
  }, linkedTransactions ?? []);
  if (linkedEditError) return { error: linkedEditError };
  const overlapError = await overlappingBudgetError(supabase, user.id, input, item.budget_plan_id);
  if (overlapError) return { error: overlapError };

  const { error: planError } = await supabase.from("budget_plans").update(planPayload(input)).eq("id", item.budget_plan_id).eq("user_id", user.id);
  if (planError) return { error: planError.message };
  const { error: itemError } = await supabase.from("budget_items").update(itemPayload(input)).eq("id", itemId).eq("user_id", user.id);
  if (itemError) {
    const { error: restoreError } = await supabase
      .from("budget_plans")
      .update(existingPlan)
      .eq("id", item.budget_plan_id)
      .eq("user_id", user.id);
    return {
      error: restoreError
        ? `${itemError.message} The previous plan could not be restored: ${restoreError.message}`
        : itemError.message,
    };
  }

  revalidateBudgetPaths();
  revalidatePath(`/budgets/${itemId}/edit`);
  return {};
}

export async function deleteBudget(itemId: string): Promise<ActionResult> {
  const { authError, supabase, user } = await authenticatedClient();
  if (authError || !user) return { error: authError ?? "You must be signed in." };

  const { data: item, error: findError } = await supabase
    .from("budget_items")
    .select("id,budget_plan_id,category_id,planned_amount,alert_percentage,note,type,metadata")
    .eq("id", itemId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (findError) return { error: findError.message };
  if (!item) return { error: "Budget not found." };

  const { data: linkedTransaction, error: linkedTransactionError } = await supabase
    .from("transactions")
    .select("id")
    .eq("user_id", user.id)
    .eq("related_entity_type", "budget")
    .eq("related_entity_id", itemId)
    .limit(1)
    .maybeSingle();
  if (linkedTransactionError) return { error: linkedTransactionError.message };
  if (linkedTransaction) return { error: "This budget has linked transactions and cannot be deleted. Pause it instead." };

  const { error: itemError } = await supabase.from("budget_items").delete().eq("id", itemId).eq("user_id", user.id);
  if (itemError) return { error: itemError.message };
  const { error: planError } = await supabase.from("budget_plans").delete().eq("id", item.budget_plan_id).eq("user_id", user.id);
  if (planError) {
    const { error: restoreError } = await supabase.from("budget_items").insert({ ...item, user_id: user.id });
    return {
      error: restoreError
        ? `${planError.message} The budget item could not be restored: ${restoreError.message}`
        : planError.message,
    };
  }

  revalidateBudgetPaths();
  return {};
}
