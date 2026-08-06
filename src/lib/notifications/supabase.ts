import type { SupabaseClient } from "@supabase/supabase-js";

import { getAccounts } from "@/lib/accounts/supabase";
import { getAssets } from "@/lib/assets/supabase";
import { getCategories } from "@/lib/categories/supabase";
import { formatMmk } from "@/lib/currency";
import { getDebts, getUpcomingDebtPayments } from "@/lib/debts/supabase";
import { getManualFuturePlanningData } from "@/lib/future-planning/supabase";
import { planningControlStatus } from "@/lib/future-planning/category-controls";
import { getSavingsGoals } from "@/lib/savings-goals/supabase";
import { getSubscriptions } from "@/lib/subscriptions/supabase";

export type AppNotification = {
  detail: string;
  dueDate: string;
  href: string;
  id: string;
  severity: "attention" | "info" | "urgent";
  source: "Assets" | "Borrowing & Lending" | "Future Planning" | "Savings Goals" | "Subscriptions";
  title: string;
};

function dateDifference(dateValue: string, today: string) {
  const date = new Date(`${dateValue}T00:00:00Z`).getTime();
  const current = new Date(`${today}T00:00:00Z`).getTime();
  return Number.isFinite(date) && Number.isFinite(current) ? Math.round((date - current) / 86_400_000) : null;
}

function duePhrase(days: number | null) {
  if (days === null) return "Date unavailable";
  if (days < 0) return `${Math.abs(days)} day${Math.abs(days) === 1 ? "" : "s"} overdue`;
  if (days === 0) return "Due today";
  if (days === 1) return "Due tomorrow";
  return `Due in ${days} days`;
}

const severityOrder = { urgent: 0, attention: 1, info: 2 } as const;

export async function getNotifications(
  supabase: SupabaseClient,
  userId: string,
  today: string,
): Promise<AppNotification[]> {
  const [accounts, categories] = await Promise.all([
    getAccounts(supabase, userId),
    getCategories({ limit: 500 }),
  ]);
  const [subscriptions, debts, savingsGoals, assets, planning] = await Promise.all([
    getSubscriptions(supabase, userId, accounts, categories, { limit: 500 }),
    getDebts(supabase, userId, categories, { limit: 500 }),
    getSavingsGoals(supabase, userId, accounts, categories, { limit: 500 }),
    getAssets(supabase, userId, categories, { limit: 500 }),
    getManualFuturePlanningData(supabase, userId, today),
  ]);
  const notifications: AppNotification[] = [];

  for (const subscription of subscriptions) {
    if (subscription.status === "Paused" || !subscription.reminderEnabled || subscription.isPaidForCurrentPeriod || !subscription.nextBillingDateValue) continue;
    const days = dateDifference(subscription.nextBillingDateValue, today);
    if (days === null || (days > subscription.reminderDaysBefore && days >= 0)) continue;
    notifications.push({
      detail: `${duePhrase(days)} · ${subscription.billedAmount}${subscription.billingCurrency === "MMK" ? "" : ` · ${subscription.amount}`}`,
      dueDate: subscription.nextBillingDateValue,
      href: `/subscriptions/${subscription.id}/edit`,
      id: `subscription:${subscription.id}:${subscription.nextBillingDateValue}`,
      severity: days < 0 ? "urgent" : days <= 1 ? "attention" : "info",
      source: "Subscriptions",
      title: `${subscription.name} payment`,
    });
  }

  for (const payment of getUpcomingDebtPayments(debts)) {
    const days = dateDifference(payment.dueDateValue, today);
    if (days === null || days > 7) continue;
    notifications.push({
      detail: `${duePhrase(days)} · ${payment.amount}`,
      dueDate: payment.dueDateValue,
      href: "/debts",
      id: `debt:${payment.id}`,
      severity: days < 0 ? "urgent" : days <= 2 ? "attention" : "info",
      source: "Borrowing & Lending",
      title: `${payment.debtName} repayment`,
    });
  }

  const currentMonth = today.slice(0, 7);
  const planningColumnsById = new Map(planning.columns.map((column) => [column.id, column]));
  for (const amount of planning.amounts.filter((item) => item.periodMonth.slice(0, 7) === currentMonth)) {
    const column = planningColumnsById.get(amount.columnId);
    if (!column || column.direction === "income" || amount.amount <= 0) continue;
    const control = planningControlStatus(amount.actualAmount, amount.amount, column.direction);
    if (control.usagePercent < 80) continue;
    notifications.push({
      detail: `${control.label} · ${control.usagePercent}% used · ${formatMmk(control.remaining)} remaining`,
      dueDate: `${currentMonth}-01`,
      href: "/future-planning",
      id: `planning:${amount.id}`,
      severity: control.label === "Over plan" ? "urgent" : "attention",
      source: "Future Planning",
      title: `${column.name} monthly control`,
    });
  }

  for (const goal of savingsGoals) {
    if (goal.status === "Completed") continue;
    const days = dateDifference(goal.targetDateValue, today);
    const currentPlan = planning.amounts.find((amount) => amount.periodMonth.slice(0, 7) === currentMonth
      && planningColumnsById.get(amount.columnId)?.categoryId === goal.categoryId
      && amount.amount > 0);
    const hasContributionRule = goal.contributionType === "Percentage"
      ? goal.contributionPercentage > 0
      : goal.monthlyContributionValue > 0;
    if (hasContributionRule && !currentPlan) {
      const contributionLabel = goal.contributionType === "Percentage"
        ? `${goal.contributionPercentage}% of planned surplus`
        : goal.monthlyContribution;
      notifications.push({
        detail: `${goal.categoryName} has no control for ${currentMonth} · suggested contribution ${contributionLabel}`,
        dueDate: `${currentMonth}-01`,
        href: "/future-planning",
        id: `goal-plan:${goal.id}:${currentMonth}`,
        severity: "attention",
        source: "Savings Goals",
        title: `${goal.name} needs a monthly plan`,
      });
    }
    if (days !== null && days <= 30) {
      notifications.push({
        detail: `${duePhrase(days)} · ${goal.remainingAmount} remaining`,
        dueDate: goal.targetDateValue,
        href: `/savings-goals/${goal.id}/edit`,
        id: `goal-target:${goal.id}:${goal.targetDateValue}`,
        severity: days < 0 ? "urgent" : days <= 7 ? "attention" : "info",
        source: "Savings Goals",
        title: `${goal.name} target date`,
      });
    }
  }

  for (const plan of planning.plannedTransactions) {
    if (plan.status !== "Active") continue;
    const days = dateDifference(plan.dateValue, today);
    if (days === null || days > 7) continue;
    notifications.push({
      detail: `${duePhrase(days)} · ${formatMmk(plan.amountValue)} · ${plan.category}`,
      dueDate: plan.dateValue,
      href: `/future-planning/${plan.id}/edit`,
      id: `scheduled:${plan.id}`,
      severity: days < 0 ? "urgent" : days <= 1 ? "attention" : "info",
      source: "Future Planning",
      title: plan.title,
    });
  }

  for (const asset of assets.filter((item) => item.status === "Active" && item.condition === "Needs Repair")) {
    notifications.push({
      detail: `${asset.category} · current value ${asset.currentValue}`,
      dueDate: today,
      href: `/assets/${asset.id}/edit`,
      id: `asset:${asset.id}`,
      severity: "attention",
      source: "Assets",
      title: `${asset.name} needs attention`,
    });
  }

  return notifications.sort((first, second) => severityOrder[first.severity] - severityOrder[second.severity]
    || first.dueDate.localeCompare(second.dueDate)
    || first.title.localeCompare(second.title));
}
