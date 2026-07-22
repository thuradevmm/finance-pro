import type { AccountRecord } from "@/lib/accounts/supabase";
import { getAssets } from "@/lib/assets/supabase";
import { getBudgets } from "@/lib/budgets/supabase";
import type { CategoryRecord } from "@/lib/categories/supabase";
import { getDebts } from "@/lib/debts/supabase";
import type { FuturePlanLinkOption } from "@/lib/future-planning/records";
import { getSavingsGoals } from "@/lib/savings-goals/supabase";
import { getSubscriptions } from "@/lib/subscriptions/supabase";
import type { SupabaseClient } from "@supabase/supabase-js";

function positiveAmount(value: number) {
  return Number.isFinite(value) && value > 0 ? value : 0;
}

export async function getFuturePlanLinkOptions(
  supabase: SupabaseClient,
  userId: string,
  accounts: AccountRecord[],
  categories: CategoryRecord[],
): Promise<FuturePlanLinkOption[]> {
  const [assets, budgets, debts, savingsGoals, subscriptions] = await Promise.all([
    getAssets(supabase, userId, categories, { limit: 500 }),
    getBudgets(supabase, userId, { limit: 500 }),
    getDebts(supabase, userId, categories, { limit: 500 }),
    getSavingsGoals(supabase, userId, accounts, categories, { limit: 500 }),
    getSubscriptions(supabase, userId, accounts, categories, { limit: 500 }),
  ]);

  return [
    ...budgets
      .filter((budget) => budget.planStatus === "Active" && positiveAmount(budget.amountValue) > 0)
      .map((budget): FuturePlanLinkOption => ({
        amount: budget.amountValue,
        categoryId: budget.categoryId,
        id: budget.id,
        label: `Budget · ${budget.category} (${budget.startDate})`,
        type: "budget",
      })),
    ...savingsGoals
      .filter((goal) => goal.status !== "Completed")
      .map((goal): FuturePlanLinkOption => ({
        amount: positiveAmount(goal.monthlyContributionValue) || Math.max(goal.targetAmountValue - goal.savedAmountValue, 0),
        categoryId: goal.categoryId,
        id: goal.id,
        label: `Savings goal · ${goal.name}`,
        type: "savings_goal",
      }))
      .filter((option) => option.amount > 0),
    ...debts
      .filter((debt) => debt.status !== "Paid")
      .map((debt): FuturePlanLinkOption => ({
        amount: positiveAmount(debt.monthlyPaymentValue) || positiveAmount(debt.remainingBalanceValue),
        categoryId: debt.categoryId,
        id: debt.id,
        label: `Debt · ${debt.name}`,
        type: "debt",
      }))
      .filter((option) => option.amount > 0),
    ...subscriptions
      .filter((subscription) => subscription.status !== "Paused" && positiveAmount(subscription.amountValue) > 0)
      .map((subscription): FuturePlanLinkOption => ({
        amount: subscription.amountValue,
        categoryId: subscription.categoryId,
        id: subscription.id,
        label: `Subscription · ${subscription.name}`,
        type: "subscription",
      })),
    ...assets
      .filter((asset) => asset.status === "Active" && positiveAmount(asset.purchaseAmountValue) > 0)
      .map((asset): FuturePlanLinkOption => ({
        amount: asset.purchaseAmountValue,
        categoryId: asset.categoryId,
        id: asset.id,
        label: `Asset · ${asset.name}`,
        type: "asset",
      })),
  ].sort((first, second) => first.label.localeCompare(second.label));
}
