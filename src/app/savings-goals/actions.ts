"use server";

import { revalidatePath } from "next/cache";

import { isCreditCardType, roundCurrencyValue } from "@/lib/ledger";
import { accountStatusContributesToCurrentTotals } from "@/lib/accounts/financial-status";
import { categoryRowSupports } from "@/lib/categories/category-scopes";
import { convertToBaseCurrency } from "@/lib/currency-conversion";
import { getCurrencySettings } from "@/lib/currency-settings";
import type { SavingsGoalFormData } from "@/lib/savings-goals/supabase";
import { calculateLinkedSavingsAmounts, type SavingsGoalEntryInput } from "@/lib/savings-goals/calculations";
import { isValidCalendarDate } from "@/lib/date-validation";
import { createClient } from "@/lib/supabase/server";
import { getUserSafely } from "@/lib/supabase/auth";
import { isMissingDatabaseObject } from "@/lib/supabase/schema-compat";

type ActionResult = { error?: string };

function revalidateSavingsPaths() {
  for (const path of ["/savings-goals", "/accounts", "/transactions", "/categories", "/dashboard", "/future-planning", "/notifications"]) revalidatePath(path);
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
  if (input.goalType !== "Target" && input.goalType !== "Fund") return "Choose a valid savings type.";
  if (input.goalType === "Target" && (!Number.isFinite(input.targetAmount) || input.targetAmount <= 0)) return "Target amount must be greater than zero.";
  if (input.goalType === "Fund" && (!Number.isFinite(input.targetAmount) || input.targetAmount < 0)) return "Fund target amount cannot be negative.";
  if (input.savedAmount !== 0) return "Savings capital must be moved with a linked Transfer transaction.";
  if (input.contributionType === "Fixed" && (!Number.isFinite(input.monthlyContribution) || input.monthlyContribution < 0)) return "Monthly contribution cannot be negative.";
  if (input.contributionType === "Percentage" && (!Number.isFinite(input.contributionPercentage) || input.contributionPercentage <= 0 || input.contributionPercentage > 100)) return "Surplus percentage must be greater than zero and no more than 100%.";
  if (input.goalType === "Target" && !isValidCalendarDate(input.targetDate)) return "Enter a valid target date.";
  if (input.goalType === "Fund" && input.targetDate) return "Open-ended funds do not use a target date.";
  if (input.name.trim().length > 80) return "Savings goal names cannot exceed 80 characters because the name is also used as its account amount type.";
  return "";
}

async function validateGoalLinks(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  input: SavingsGoalFormData,
  allowedExistingCategoryId = "",
) {
  if (!input.accountId) return "Select a savings account.";
  if (!input.categoryId) return "Select a savings goal category.";
  const accountPromise = supabase.from("accounts").select("id,type,is_active,metadata").eq("id", input.accountId).eq("user_id", userId).is("deleted_at", null).maybeSingle();
  let categoryResult = await supabase.from("categories").select("id,is_active,metadata,type,category_type,category_level").eq("id", input.categoryId).eq("user_id", userId).is("deleted_at", null).maybeSingle();
  if (categoryResult.error && isMissingDatabaseObject(categoryResult.error, ["category_type"])) {
    categoryResult = await supabase.from("categories").select("id,is_active,metadata,type,category_level").eq("id", input.categoryId).eq("user_id", userId).is("deleted_at", null).maybeSingle();
  }
  const accountResult = await accountPromise;
  const error = accountResult.error ?? categoryResult.error;
  if (error) return error.message;
  if (!accountResult.data
    || !accountStatusContributesToCurrentTotals(storedAccountStatus(accountResult.data))
    || isCreditCardType(accountResult.data.type)) {
    return "Select an available non-credit-card savings account.";
  }
  const accountMetadata = accountResult.data.metadata && typeof accountResult.data.metadata === "object" && !Array.isArray(accountResult.data.metadata)
    ? accountResult.data.metadata as Record<string, unknown>
    : {};
  const conflictingAmountType = Array.isArray(accountMetadata.amount_types)
    ? accountMetadata.amount_types.some((item) => {
      if (!item || typeof item !== "object" || Array.isArray(item)) return false;
      const amountType = item as Record<string, unknown>;
      return String(amountType.type ?? "").trim().toLowerCase() === input.name.trim().toLowerCase()
        && !amountType.savings_goal_id;
    })
    : false;
  if (conflictingAmountType) return "This account already has an amount type with the same name. Choose a different savings goal name.";
  if (!categoryResult.data
    || (categoryResult.data.is_active === false && categoryResult.data.id !== allowedExistingCategoryId)
    || !categoryRowSupports(categoryResult.data, "Savings Goals", "Savings Goal")) return "Select an active savings goal category.";
  return "";
}

function goalPayload(input: SavingsGoalFormData, linkedSavedAmount = 0) {
  const totalSavedAmount = roundCurrencyValue(input.savedAmount + linkedSavedAmount);
  const status = input.goalType === "Target" && totalSavedAmount >= input.targetAmount ? "completed" : "active";
  return {
    account_id: input.accountId || null,
    account_amount_type: input.name.trim(),
    category_id: input.categoryId || null,
    contribution_percentage: input.contributionType === "Percentage" ? input.contributionPercentage : null,
    contribution_type: input.contributionType.toLowerCase(),
    current_amount: input.savedAmount,
    description: input.description.trim() || null,
    metadata: {
      account_id: input.accountId || null,
      account_amount_type: input.name.trim(),
      category_id: input.categoryId || null,
      contribution_percentage: input.contributionType === "Percentage" ? input.contributionPercentage : null,
      contribution_basis: input.contributionType === "Percentage" ? "surplus" : null,
      contribution_type: input.contributionType.toLowerCase(),
      current_amount: input.savedAmount,
      description: input.description.trim(),
      goal_type: input.goalType.toLowerCase(),
      monthly_contribution: input.monthlyContribution,
      saved_amount: input.savedAmount,
      status,
      target_amount: input.targetAmount,
      target_date: input.goalType === "Target" ? input.targetDate : null,
    },
    monthly_contribution: input.monthlyContribution,
    name: input.name.trim(),
    goal_type: input.goalType.toLowerCase(),
    initial_saved_amount: input.savedAmount,
    saved_amount: input.savedAmount,
    status,
    target_amount: input.targetAmount,
    target_date: input.goalType === "Target" ? input.targetDate : null,
  };
}

async function linkedSavingsAmount(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  goalId: string,
  goalAccountId: string,
) {
  const [entriesResult, transactionsResult, accountsResult, currencySettings] = await Promise.all([
    supabase.from("savings_goal_entries").select("savings_goal_id,transaction_id,amount,type").eq("user_id", userId).eq("savings_goal_id", goalId),
    supabase.from("transactions").select("id,account_id,transfer_account_id,related_entity_id,type,amount,status,transaction_date,metadata").eq("user_id", userId).eq("related_entity_type", "savings_goal").eq("related_entity_id", goalId).is("deleted_at", null),
    supabase.from("accounts").select("id,currency_code").eq("user_id", userId).is("deleted_at", null),
    getCurrencySettings(supabase, userId),
  ]);
  const error = entriesResult.error ?? transactionsResult.error ?? accountsResult.error;
  if (error) return { error: error.message, value: 0 };
  const currencyByAccountId = new Map((accountsResult.data ?? []).map((account) => [account.id, account.currency_code]));
  return {
    error: "",
    value: calculateLinkedSavingsAmounts(
      (entriesResult.data ?? []) as SavingsGoalEntryInput[],
      (transactionsResult.data ?? []).map((transaction) => ({
        ...transaction,
        amount: convertToBaseCurrency(
          Math.abs(Number(transaction.amount) || 0),
          currencyByAccountId.get(transaction.account_id ?? ""),
          currencySettings,
          transaction.transaction_date ?? undefined,
        ) ?? 0,
      })),
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
  if (error) return { error: error.message.includes("savings_goal_amount_type") ? "Unable to create the goal-owned account amount type. Choose a unique goal name and try again." : error.message };

  revalidateSavingsPaths();
  return {};
}

export async function updateSavingsGoal(goalId: string, input: SavingsGoalFormData): Promise<ActionResult> {
  const { supabase, user } = await authenticatedClient();
  if (!user) return { error: "You must be signed in." };
  const validationError = validateGoalInput(input);
  if (validationError) return { error: validationError };
  const { data: existingGoal, error: existingError } = await supabase
    .from("savings_goals")
    .select("id,account_id,category_id")
    .eq("id", goalId)
    .eq("user_id", user.id)
    .is("deleted_at", null)
    .maybeSingle();
  if (existingError) return { error: existingError.message };
  if (!existingGoal) return { error: "Savings goal not found." };
  if (existingGoal.account_id && existingGoal.account_id !== input.accountId) {
    const [transactionsResult, entriesResult] = await Promise.all([
      supabase.from("transactions").select("id").eq("user_id", user.id).eq("related_entity_type", "savings_goal").eq("related_entity_id", goalId).is("deleted_at", null).limit(1),
      supabase.from("savings_goal_entries").select("id").eq("user_id", user.id).eq("savings_goal_id", goalId).limit(1),
    ]);
    const historyError = transactionsResult.error ?? entriesResult.error;
    if (historyError) return { error: historyError.message };
    if ((transactionsResult.data?.length ?? 0) > 0 || (entriesResult.data?.length ?? 0) > 0) {
      return { error: "The savings account cannot be changed after capital transfers exist. Create a new goal or reverse the linked transfers first." };
    }
  }
  const linkError = await validateGoalLinks(supabase, user.id, input, existingGoal.category_id ?? "");
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
  if (error) return { error: error.message.includes("savings_goal_amount_type") ? "Unable to synchronize the goal-owned account amount type. Choose a unique goal name and try again." : error.message };
  if (!data) return { error: "Savings goal not found." };

  revalidateSavingsPaths();
  revalidatePath(`/savings-goals/${goalId}/edit`);
  return {};
}

export async function deleteSavingsGoal(goalId: string): Promise<ActionResult> {
  const { supabase, user } = await authenticatedClient();
  if (!user) return { error: "You must be signed in." };

  const [transactionsResult, entriesResult] = await Promise.all([
    supabase.from("transactions").select("id").eq("user_id", user.id).eq("related_entity_type", "savings_goal").eq("related_entity_id", goalId).is("deleted_at", null).limit(1),
    supabase.from("savings_goal_entries").select("id").eq("user_id", user.id).eq("savings_goal_id", goalId).limit(1),
  ]);
  const historyError = transactionsResult.error ?? entriesResult.error;
  if (historyError) return { error: historyError.message };
  if ((transactionsResult.data?.length ?? 0) > 0 || (entriesResult.data?.length ?? 0) > 0) {
    return { error: "This savings goal or fund has linked financial history and cannot be deleted because its transactions must remain reconcilable." };
  }

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
