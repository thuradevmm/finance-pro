import { assets } from "@/lib/assets/mock-data";
import { budgetCategories, budgetSummaries } from "@/lib/budgets/mock-data";
import { debts, debtSummaries } from "@/lib/debts/mock-data";
import { savingsGoalSummaries, savingsGoals } from "@/lib/savings-goals/mock-data";
import { subscriptionSummaries, subscriptions, upcomingSubscriptionBillings } from "@/lib/subscriptions/mock-data";
import { transactions } from "@/lib/transactions/mock-data";
import type { AssetRecord, BudgetCategory, BudgetStatus, DebtRecord, SavingsGoal, SavingsGoalStatus, SummaryMetric, SubscriptionRecord, Transaction } from "@/types/finance";

function parseCurrency(value: string) {
  return Math.abs(Number(value.replace(/[^0-9.-]/g, ""))) || 0;
}

function formatCurrency(value: number, fractionDigits = 2) {
  return new Intl.NumberFormat("en-US", {
    currency: "USD",
    maximumFractionDigits: fractionDigits,
    minimumFractionDigits: fractionDigits,
    style: "currency",
  }).format(value);
}

function linkedAmount(items: Transaction[], key: keyof Pick<Transaction, "linkedAssetId" | "linkedBudgetId" | "linkedDebtId" | "linkedSavingsGoalId" | "linkedSubscriptionId">, id: string) {
  return items.filter((transaction) => transaction[key] === id).reduce((sum, transaction) => sum + parseCurrency(transaction.amount), 0);
}

function withSummaryValue(summaries: SummaryMetric[], label: string, value: string) {
  return summaries.map((summary) => (summary.label === label ? { ...summary, value } : summary));
}

function deriveBudgetStatus(usagePercent: number): BudgetStatus {
  if (usagePercent > 100) {
    return "Over Budget";
  }

  if (usagePercent >= 80) {
    return "Near Limit";
  }

  return "Under Budget";
}

export function getTransactionDerivedBudgets(sourceTransactions = transactions) {
  return budgetCategories.map((budget): BudgetCategory => {
    const actualAmount = linkedAmount(sourceTransactions, "linkedBudgetId", budget.id);
    const budgetAmount = parseCurrency(budget.budget);
    const remaining = budgetAmount - actualAmount;
    const usagePercent = budgetAmount > 0 ? Math.round((actualAmount / budgetAmount) * 100) : 0;

    return {
      ...budget,
      actual: formatCurrency(actualAmount, 0),
      remaining: `${remaining < 0 ? "-" : ""}${formatCurrency(Math.abs(remaining), 0)}`,
      status: deriveBudgetStatus(usagePercent),
      usagePercent,
    };
  });
}

export function getTransactionDerivedBudgetSummaries(sourceTransactions = transactions) {
  const budgets = getTransactionDerivedBudgets(sourceTransactions);
  const totalBudget = budgets.reduce((sum, budget) => sum + parseCurrency(budget.budget), 0);
  const actual = budgets.reduce((sum, budget) => sum + parseCurrency(budget.actual), 0);
  const remaining = totalBudget - actual;
  const actionNeeded = budgets.filter((budget) => budget.status !== "Under Budget").length;

  return withSummaryValue(
    withSummaryValue(withSummaryValue(withSummaryValue(budgetSummaries, "Total Budget", formatCurrency(totalBudget)), "Actual Spending", formatCurrency(actual)), "Remaining", formatCurrency(remaining)),
    "Action Needed",
    String(actionNeeded),
  );
}

function deriveSavingsStatus(progressPercent: number): SavingsGoalStatus {
  if (progressPercent >= 100) {
    return "Completed";
  }

  if (progressPercent < 25) {
    return "Behind";
  }

  return "On Track";
}

export function getTransactionDerivedSavingsGoals(sourceTransactions = transactions) {
  return savingsGoals.map((goal): SavingsGoal => {
    const savedAmount = linkedAmount(sourceTransactions, "linkedSavingsGoalId", goal.id);
    const targetAmount = parseCurrency(goal.targetAmount);
    const remainingAmount = Math.max(targetAmount - savedAmount, 0);
    const progressPercent = targetAmount > 0 ? Math.min(Math.round((savedAmount / targetAmount) * 100), 100) : 0;

    return {
      ...goal,
      progressPercent,
      remainingAmount: formatCurrency(remainingAmount, 0),
      savedAmount: formatCurrency(savedAmount, 0),
      status: deriveSavingsStatus(progressPercent),
    };
  });
}

export function getTransactionDerivedSavingsGoalSummaries(sourceTransactions = transactions) {
  const goals = getTransactionDerivedSavingsGoals(sourceTransactions);
  const totalTarget = goals.reduce((sum, goal) => sum + parseCurrency(goal.targetAmount), 0);
  const totalSaved = goals.reduce((sum, goal) => sum + parseCurrency(goal.savedAmount), 0);

  return withSummaryValue(
    withSummaryValue(withSummaryValue(savingsGoalSummaries, "Total Target", formatCurrency(totalTarget, 0)), "Total Saved", formatCurrency(totalSaved, 0)),
    "Remaining",
    formatCurrency(Math.max(totalTarget - totalSaved, 0), 0),
  );
}

export function getTransactionDerivedDebts(sourceTransactions = transactions) {
  return debts.map((debt): DebtRecord => {
    const repaidAmount = linkedAmount(sourceTransactions, "linkedDebtId", debt.id);
    const totalAmount = parseCurrency(debt.totalAmount);
    const remainingBalance = Math.max(totalAmount - repaidAmount, 0);
    const progressPercent = totalAmount > 0 ? Math.min(Math.round((repaidAmount / totalAmount) * 100), 100) : 0;

    return {
      ...debt,
      progressPercent,
      remainingBalance: formatCurrency(remainingBalance),
      repaidAmount: formatCurrency(repaidAmount),
      status: remainingBalance <= 0 ? "Paid" : debt.status === "Paid" ? "Active" : debt.status,
    };
  });
}

export function getTransactionDerivedDebtSummaries(sourceTransactions = transactions) {
  const derivedDebts = getTransactionDerivedDebts(sourceTransactions);
  const totalDebt = derivedDebts.reduce((sum, debt) => sum + parseCurrency(debt.totalAmount), 0);
  const totalRepaid = derivedDebts.reduce((sum, debt) => sum + parseCurrency(debt.repaidAmount), 0);

  return withSummaryValue(
    withSummaryValue(withSummaryValue(debtSummaries, "Total Debt", formatCurrency(totalDebt)), "Total Repaid", formatCurrency(totalRepaid)),
    "Remaining Debt",
    formatCurrency(Math.max(totalDebt - totalRepaid, 0)),
  );
}

export function getTransactionDerivedSubscriptions(sourceTransactions = transactions) {
  return subscriptions.map((subscription): SubscriptionRecord => {
    const paidAmount = linkedAmount(sourceTransactions, "linkedSubscriptionId", subscription.id);

    return paidAmount > 0 ? { ...subscription, amount: formatCurrency(paidAmount) } : subscription;
  });
}

export function getTransactionDerivedSubscriptionSummaries(sourceTransactions = transactions) {
  const derivedSubscriptions = getTransactionDerivedSubscriptions(sourceTransactions);
  const monthlyTotal = derivedSubscriptions.reduce((sum, subscription) => sum + parseCurrency(subscription.amount), 0);

  return withSummaryValue(
    withSummaryValue(subscriptionSummaries, "Monthly Total Cost", formatCurrency(monthlyTotal)),
    "Yearly Total Cost",
    formatCurrency(monthlyTotal * 12),
  );
}

export function getTransactionDerivedSubscriptionBillings(sourceTransactions = transactions) {
  const derivedSubscriptions = getTransactionDerivedSubscriptions(sourceTransactions);

  return upcomingSubscriptionBillings.map((billing) => {
    const subscription = derivedSubscriptions.find((item) => billing.name.toLowerCase().includes(item.name.toLowerCase()) || item.name.toLowerCase().includes(billing.name.toLowerCase().split(" ")[0]));

    return subscription ? { ...billing, amount: subscription.amount } : billing;
  });
}

export function getTransactionDerivedAssets(sourceTransactions = transactions) {
  return assets.map((asset): AssetRecord => {
    const purchaseAmount = linkedAmount(sourceTransactions, "linkedAssetId", asset.id);

    return purchaseAmount > 0 ? { ...asset, purchaseAmount: formatCurrency(purchaseAmount), currentValue: asset.currentValue } : asset;
  });
}
