import { assets } from "@/lib/assets/mock-data";
import { budgetCategories } from "@/lib/budgets/mock-data";
import { debts } from "@/lib/debts/mock-data";
import { savingsGoals } from "@/lib/savings-goals/mock-data";
import { subscriptions } from "@/lib/subscriptions/mock-data";
import type { Transaction } from "@/types/finance";

export type TransactionImpactTarget = "None" | "Budget" | "Savings Goal" | "Debt" | "Subscription" | "Asset";

export const transactionImpactTargets: TransactionImpactTarget[] = ["None", "Budget", "Savings Goal", "Debt", "Subscription", "Asset"];

export const transactionImpactOptions = {
  Asset: assets.map((asset) => ({ label: asset.name, value: asset.id })),
  Budget: budgetCategories.map((budget) => ({ label: `${budget.category} (${budget.period})`, value: budget.id })),
  Debt: debts.map((debt) => ({ label: debt.name, value: debt.id })),
  None: [],
  "Savings Goal": savingsGoals.map((goal) => ({ label: goal.name, value: goal.id })),
  Subscription: subscriptions.map((subscription) => ({ label: subscription.name, value: subscription.id })),
} satisfies Record<TransactionImpactTarget, { label: string; value: string }[]>;

export function getImpactTarget(transaction: Transaction): TransactionImpactTarget {
  if (transaction.linkedBudgetId) {
    return "Budget";
  }

  if (transaction.linkedSavingsGoalId) {
    return "Savings Goal";
  }

  if (transaction.linkedDebtId) {
    return "Debt";
  }

  if (transaction.linkedSubscriptionId) {
    return "Subscription";
  }

  if (transaction.linkedAssetId) {
    return "Asset";
  }

  return "None";
}

export function getImpactValue(transaction: Transaction, target: TransactionImpactTarget) {
  if (target === "Budget") {
    return transaction.linkedBudgetId ?? "";
  }

  if (target === "Savings Goal") {
    return transaction.linkedSavingsGoalId ?? "";
  }

  if (target === "Debt") {
    return transaction.linkedDebtId ?? "";
  }

  if (target === "Subscription") {
    return transaction.linkedSubscriptionId ?? "";
  }

  if (target === "Asset") {
    return transaction.linkedAssetId ?? "";
  }

  return "";
}
