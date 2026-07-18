"use server";

import { revalidatePath } from "next/cache";

import { isCreditCardType, roundCurrencyValue } from "@/lib/ledger";
import { accountStatusContributesToCurrentTotals } from "@/lib/accounts/financial-status";
import { categoryRowSupports } from "@/lib/categories/category-scopes";
import type { SavingsGoalFormData } from "@/lib/savings-goals/supabase";
import { calculateLinkedSavingsAmounts, type SavingsGoalEntryInput } from "@/lib/savings-goals/calculations";
import { isValidCalendarDate } from "@/lib/date-validation";
import { createClient } from "@/lib/supabase/server";
import { getUserSafely } from "@/lib/supabase/auth";

type ActionResult = { error?: string };

function revalidateSavingsPaths() {
  for (const path of ["/savings-goals", "/categories", "/dashboard", "/reports", "/future-planning", "/scenario-budgeting"]) revalidatePath(path);
}

function storedAccountStatus(account: { is_active: boolean; metadata: unknown }) {
  const metadata = account.metadata && typeof account.metadata === "object" && !Array.isArray(account.metadata)
    ? account.metadata as Record<string, unknown>
    : {};
  return account.is_active === false ? "Archived" : metadata.status === "Needs Review" ? "Needs Review" : "Active";
}

async function authenticatedClient() {
  const supabase = await createClient();
  const { user } = await getUserSafely(supabase);
  return { supabase, user };
}

function validateGoalInput(input: SavingsGoalFormData) {
  if (!input.name.trim()) return "Savings goal name is required.";
  if (!Number.isFinite(input.targetAmount) || input.targetAmount <= 0) return "Target amount must be greater than zero.";
  if (!Number.isFinite(input.savedAmount) || input.savedAmount < 0) return "Already saved amount cannot be negative.";
  if (!Number.isFinite(input.monthlyContribution) || input.monthlyContribution < 0) return "Monthly contribution cannot be negative.";
  if (!isValidCalendarDate(input.targetDate)) return "Enter a valid target date.";
  return "";
}

async function validateGoalLinks(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  input: SavingsGoalFormData,
) {
  if (!input.accountId) return "Select a savings account.";
  if (!input.categoryId) return "Select a savings goal category.";
  const [accountResult, categoryResult] = await Promise.all([
    supabase.from("accounts").select("id,type,is_active,metadata").eq("id", input.accountId).eq("user_id", userId).is("deleted_at", null).maybeSingle(),
    supabase.from("categories").select("id,is_active,metadata,type").eq("id", input.categoryId).eq("user_id", userId).is("deleted_at", null).maybeSingle(),
  ]);
  const error = accountResult.error ?? categoryResult.error;
  if (error) return error.message;
  if (!accountResult.data
    || !accountStatusContributesToCurrentTotals(storedAccountStatus(accountResult.data))
    || isCreditCardType(accountResult.data.type)) {
    return "Select an available non-credit-card savings account.";
  }
  if (!categoryResult.data || categoryResult.data.is_active === false || !categoryRowSupports(categoryResult.data, "Savings Goals", "Savings Goal")) return "Select an active savings goal category.";
  return "";
}

function goalPayload(input: SavingsGoalFormData, linkedSavedAmount = 0) {
  const totalSavedAmount = roundCurrencyValue(input.savedAmount + linkedSavedAmount);
  const status = totalSavedAmount >= input.targetAmount ? "completed" : "active";
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
      status,
      target_amount: input.targetAmount,
      target_date: input.targetDate,
    },
    monthly_contribution: input.monthlyContribution,
    name: input.name.trim(),
    initial_saved_amount: input.savedAmount,
    saved_amount: input.savedAmount,
    status,
    target_amount: input.targetAmount,
    target_date: input.targetDate,
  };
}

async function linkedSavingsAmount(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  goalId: string,
  goalAccountId: string,
) {
  const [entriesResult, transactionsResult] = await Promise.all([
    supabase.from("savings_goal_entries").select("savings_goal_id,transaction_id,amount,type").eq("user_id", userId).eq("savings_goal_id", goalId),
    supabase.from("transactions").select("id,account_id,transfer_account_id,related_entity_id,type,amount,status,metadata").eq("user_id", userId).eq("related_entity_type", "savings_goal").eq("related_entity_id", goalId).is("deleted_at", null),
  ]);
  const error = entriesResult.error ?? transactionsResult.error;
  if (error) return { error: error.message, value: 0 };
  return {
    error: "",
    value: calculateLinkedSavingsAmounts(
      (entriesResult.data ?? []) as SavingsGoalEntryInput[],
      transactionsResult.data ?? [],
      new Map([[goalId, goalAccountId]]),
    ).progressByGoalId.get(goalId) ?? 0,
  };
}

export async function createSavingsGoal(input: SavingsGoalFormData): Promise<ActionResult> {
  const { supabase, user } = await authenticatedClient();
  if (!user) return { error: "You must be signed in." };
  const validationError = validateGoalInput(input);
  if (validationError) return { error: validationError };
  const linkError = await validateGoalLinks(supabase, user.id, input);
  if (linkError) return { error: linkError };

  const { error } = await supabase.from("savings_goals").insert({ ...goalPayload(input), user_id: user.id });
  if (error) return { error: error.message };

  revalidateSavingsPaths();
  return {};
}

export async function updateSavingsGoal(goalId: string, input: SavingsGoalFormData): Promise<ActionResult> {
  const { supabase, user } = await authenticatedClient();
  if (!user) return { error: "You must be signed in." };
  const validationError = validateGoalInput(input);
  if (validationError) return { error: validationError };
  const linkError = await validateGoalLinks(supabase, user.id, input);
  if (linkError) return { error: linkError };
  const linkedAmount = await linkedSavingsAmount(supabase, user.id, goalId, input.accountId);
  if (linkedAmount.error) return { error: linkedAmount.error };

  const { data, error } = await supabase
    .from("savings_goals")
    .update(goalPayload(input, linkedAmount.value))
    .eq("id", goalId)
    .eq("user_id", user.id)
    .select("id")
    .maybeSingle();
  if (error) return { error: error.message };
  if (!data) return { error: "Savings goal not found." };

  revalidateSavingsPaths();
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

  revalidateSavingsPaths();
  return {};
}
