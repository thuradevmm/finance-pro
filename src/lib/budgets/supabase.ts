import type { SupabaseClient } from "@supabase/supabase-js";

import type { IconName } from "@/components/ui/icon";
import { formatMmk } from "@/lib/currency";
import type { BudgetCategory, BudgetPeriod, BudgetStatus, SummaryMetric } from "@/types/finance";

export type BudgetRecord = BudgetCategory & {
  alertPercentage: number;
  amountValue: number;
  categoryId: string;
  description: string;
  endDate: string;
  itemId: string;
  planId: string;
  planStatus: "Active" | "Paused";
  startDate: string;
};

export type BudgetFormData = {
  alertPercentage: number;
  amount: number;
  categoryId: string;
  categoryName: string;
  description: string;
  endDate: string | null;
  period: BudgetPeriod;
  startDate: string;
  status: "Active" | "Paused";
};

type PlanRow = {
  description: string | null;
  end_date: string | null;
  id: string;
  period_type: string;
  start_date: string;
  status: string;
};

type ItemRow = {
  alert_percentage: number | string | null;
  budget_plan_id: string;
  category_id: string;
  id: string;
  note: string | null;
  planned_amount: number | string;
};

type CategoryRow = {
  color: string | null;
  icon: string | null;
  id: string;
  name: string;
};

type TransactionRow = {
  amount: number | string;
  category_id: string | null;
  transaction_date: string;
  type: string;
};

const iconNames = new Set<IconName>(["category", "food", "home", "medical", "savings", "settings", "shopping", "subscriptions", "travel"]);
const appearances: Record<string, { bg: string; tone: string }> = {
  Amber: { bg: "bg-[#fffbeb]", tone: "text-[#92400e]" },
  Blue: { bg: "bg-[#eff6ff]", tone: "text-[#0058be]" },
  Gray: { bg: "bg-[#f8f9ff]", tone: "text-[#45464d]" },
  Green: { bg: "bg-[#ecfdf5]", tone: "text-[#047857]" },
  Indigo: { bg: "bg-[#eef2ff]", tone: "text-[#4f46e5]" },
  Red: { bg: "bg-[#fff1f0]", tone: "text-[#b42318]" },
};

function numericValue(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function budgetStatus(usagePercent: number, alertPercentage: number): BudgetStatus {
  if (usagePercent > 100) return "Over Budget";
  if (usagePercent >= alertPercentage) return "Near Limit";
  return "Under Budget";
}

export async function getBudgets(supabase: SupabaseClient, userId: string): Promise<BudgetRecord[]> {
  const [plansResult, itemsResult, categoriesResult, transactionsResult] = await Promise.all([
    supabase.from("budget_plans").select("id,period_type,start_date,end_date,status,description").eq("user_id", userId).is("deleted_at", null).order("start_date", { ascending: false }),
    supabase.from("budget_items").select("id,budget_plan_id,category_id,planned_amount,alert_percentage,note").eq("user_id", userId),
    supabase.from("categories").select("id,name,icon,color").eq("user_id", userId).is("deleted_at", null),
    supabase.from("transactions").select("category_id,transaction_date,type,amount").eq("user_id", userId).is("deleted_at", null),
  ]);

  const error = plansResult.error ?? itemsResult.error ?? categoriesResult.error ?? transactionsResult.error;
  if (error) throw new Error(error.message);

  const plans = new Map((plansResult.data as PlanRow[]).map((plan) => [plan.id, plan]));
  const categories = new Map((categoriesResult.data as CategoryRow[]).map((category) => [category.id, category]));
  const transactions = transactionsResult.data as TransactionRow[];

  return (itemsResult.data as ItemRow[]).flatMap((item) => {
    const plan = plans.get(item.budget_plan_id);
    const category = categories.get(item.category_id);
    if (!plan || !category) return [];

    const amountValue = numericValue(item.planned_amount);
    const actualValue = transactions
      .filter((transaction) => transaction.category_id === item.category_id
        && transaction.type.toLowerCase() === "expense"
        && transaction.transaction_date >= plan.start_date
        && (!plan.end_date || transaction.transaction_date <= plan.end_date))
      .reduce((total, transaction) => total + Math.abs(numericValue(transaction.amount)), 0);
    const remainingValue = amountValue - actualValue;
    const usagePercent = amountValue > 0 ? Math.round((actualValue / amountValue) * 100) : 0;
    const alertPercentage = numericValue(item.alert_percentage) || 80;
    const appearance = appearances[category.color ?? "Blue"] ?? appearances.Blue;

    return [{
      ...appearance,
      actual: formatMmk(actualValue),
      alertPercentage,
      amountValue,
      bg: appearance.bg,
      budget: formatMmk(amountValue),
      category: category.name,
      categoryId: category.id,
      description: plan.description ?? item.note ?? "",
      endDate: plan.end_date ?? "",
      icon: category.icon && iconNames.has(category.icon as IconName) ? category.icon as IconName : "category",
      id: item.id,
      itemId: item.id,
      period: plan.period_type.toLowerCase() === "yearly" ? "Yearly" : "Monthly",
      planId: plan.id,
      planStatus: plan.status.toLowerCase() === "paused" ? "Paused" : "Active",
      remaining: formatMmk(remainingValue),
      startDate: plan.start_date,
      status: budgetStatus(usagePercent, alertPercentage),
      tone: appearance.tone,
      usagePercent,
    }];
  });
}

export async function getBudget(supabase: SupabaseClient, userId: string, budgetItemId: string) {
  const budgets = await getBudgets(supabase, userId);
  return budgets.find((budget) => budget.id === budgetItemId) ?? null;
}

export function getBudgetSummaries(budgets: BudgetRecord[]): SummaryMetric[] {
  const active = budgets.filter((budget) => budget.planStatus === "Active");
  const totalBudget = active.reduce((total, budget) => total + budget.amountValue, 0);
  const totalActual = active.reduce((total, budget) => total + numericValue(budget.actual.replace(/[^0-9.-]/g, "")), 0);
  return [
    { label: "Total Budget", value: formatMmk(totalBudget), icon: "savings", tone: "text-[#0b1c30]", bg: "bg-[#eff6ff]" },
    { label: "Actual Spending", value: formatMmk(totalActual), icon: "receipt", tone: "text-[#0058be]", bg: "bg-[#eff6ff]" },
    { label: "Remaining", value: formatMmk(totalBudget - totalActual), icon: "trendingUp", tone: "text-[#047857]", bg: "bg-[#ecfdf5]" },
    { label: "Action Needed", value: String(active.filter((budget) => budget.status !== "Under Budget").length), icon: "bell", tone: "text-[#b42318]", bg: "bg-[#fff1f0]" },
  ];
}
