import type { SupabaseClient } from "@supabase/supabase-js";

import { formatMmk } from "@/lib/currency";
import { combineDateWithTimestampTime, dateTimeSortValue } from "@/lib/date-format";
import { getCategoryTypeStyle } from "@/lib/categories/category-style";
import { deriveCreditCardDebtMetadata, isCreditCardPayment } from "@/lib/ledger";
import type { BudgetCategory, BudgetPeriod, BudgetStatus, CategoryScope, CategoryType, SummaryMetric } from "@/types/finance";

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
  startDateTimeValue: string;
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
  created_at: string | null;
  description: string | null;
  end_date: string | null;
  id: string;
  metadata: unknown;
  period_type: string;
  start_date: string;
  status: string;
};

type ItemRow = {
  alert_percentage: number | string | null;
  budget_plan_id: string;
  category_id: string;
  id: string;
  metadata: unknown;
  note: string | null;
  planned_amount: number | string;
};

type CategoryRow = {
  id: string;
  metadata: unknown;
  name: string;
  type: string;
};

type TransactionRow = {
  account_id: string | null;
  amount: number | string;
  category_id: string | null;
  metadata: unknown;
  related_entity_id: string | null;
  related_entity_type: string | null;
  status: string | null;
  transaction_date: string;
  transfer_account_id: string | null;
  type: string;
};

type BudgetAccountRow = { id: string; type: string | null };
type BudgetDebtRow = { id: string; metadata: unknown; payment_account_id: string | null; type: string | null };

function numericValue(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function metadataRecord(metadata: unknown) {
  return metadata && typeof metadata === "object" && !Array.isArray(metadata)
    ? metadata as Record<string, unknown>
    : {};
}

function categoryTypeForBudget(row: CategoryRow): CategoryType {
  const metadata = metadataRecord(row.metadata);
  const metadataType = typeof metadata.category_type === "string" ? metadata.category_type : "";
  const normalizedType = (metadataType || row.type).toLowerCase().replace(/[_-]/g, " ");
  const scopes = Array.isArray(metadata.scopes)
    ? metadata.scopes.filter((scope): scope is CategoryScope => typeof scope === "string")
    : [];

  if (normalizedType === "income") return "Income";
  if (scopes.includes("Accounts")) return "Account";
  if (scopes.includes("Assets")) return "Asset";
  if (scopes.includes("Debts")) return "Debt";
  if (scopes.includes("Savings Goals")) return "Savings Goal";
  if (scopes.includes("Subscriptions")) return "Subscription";
  return "Expense";
}

function budgetStatus(usagePercent: number, alertPercentage: number): BudgetStatus {
  if (usagePercent > 100) return "Over Budget";
  if (usagePercent >= alertPercentage) return "Near Limit";
  return "Under Budget";
}

function postedStatusAffectsBudget(value: unknown) {
  return !["scheduled", "cancelled", "canceled", "void", "failed"].includes(String(value ?? "cleared").toLowerCase());
}

export async function getBudgets(supabase: SupabaseClient, userId: string, options: { limit?: number } = {}): Promise<BudgetRecord[]> {
  let itemsQuery = supabase.from("budget_items").select("id,budget_plan_id,category_id,planned_amount,alert_percentage,note,metadata").eq("user_id", userId);
  if (options.limit) itemsQuery = itemsQuery.limit(options.limit);

  const [plansResult, itemsResult, categoriesResult, transactionsResult, accountsResult, debtsResult] = await Promise.all([
    supabase.from("budget_plans").select("id,period_type,start_date,end_date,status,description,metadata,created_at").eq("user_id", userId).is("deleted_at", null).order("created_at", { ascending: false }),
    itemsQuery,
    supabase.from("categories").select("id,name,type,metadata").eq("user_id", userId).is("deleted_at", null),
    supabase.from("transactions").select("account_id,transfer_account_id,category_id,transaction_date,type,amount,status,metadata,related_entity_id,related_entity_type").eq("user_id", userId).is("deleted_at", null),
    supabase.from("accounts").select("id,type").eq("user_id", userId).is("deleted_at", null),
    supabase.from("debts").select("id,payment_account_id,type,metadata").eq("user_id", userId).is("deleted_at", null),
  ]);

  const error = plansResult.error ?? itemsResult.error ?? categoriesResult.error ?? transactionsResult.error ?? accountsResult.error ?? debtsResult.error;
  if (error) throw new Error(error.message);

  const plans = new Map((plansResult.data as PlanRow[]).map((plan) => [plan.id, plan]));
  const categories = new Map((categoriesResult.data as CategoryRow[]).map((category) => [category.id, category]));
  const accountRows = accountsResult.data as BudgetAccountRow[];
  const debtRows = debtsResult.data as BudgetDebtRow[];
  const transactions = (transactionsResult.data as TransactionRow[]).map((transaction) => ({
    ...transaction,
    metadata: deriveCreditCardDebtMetadata(transaction, debtRows, accountRows),
  }));

  return (itemsResult.data as ItemRow[]).flatMap((item) => {
    const plan = plans.get(item.budget_plan_id);
    const category = categories.get(item.category_id);
    if (!plan || !category) return [];

    const itemMetadata = metadataRecord(item.metadata);
    const planMetadata = metadataRecord(plan.metadata);
    const amountValue = numericValue(item.planned_amount) || numericValue(itemMetadata.planned_amount);
    const actualValue = transactions
      .filter((transaction) => transaction.category_id === item.category_id
        && transaction.type.toLowerCase() === "expense"
        && !isCreditCardPayment(metadataRecord(transaction.metadata))
        && postedStatusAffectsBudget(transaction.status)
        && transaction.transaction_date >= plan.start_date
        && (!plan.end_date || transaction.transaction_date <= plan.end_date))
      .reduce((total, transaction) => total + Math.abs(numericValue(transaction.amount)), 0);
    const remainingValue = amountValue - actualValue;
    const usagePercent = amountValue > 0 ? Math.round((actualValue / amountValue) * 100) : 0;
    const alertPercentage = numericValue(item.alert_percentage) || numericValue(itemMetadata.alert_percentage) || 80;
    const appearance = getCategoryTypeStyle(categoryTypeForBudget(category));
    const period: BudgetPeriod = plan.period_type.toLowerCase() === "yearly" ? "Yearly" : "Monthly";
    const planStatus: BudgetRecord["planStatus"] = plan.status.toLowerCase() === "paused" ? "Paused" : "Active";

    return [{
      ...appearance,
      actual: formatMmk(actualValue),
      alertPercentage,
      amountValue,
      bg: appearance.bg,
      budget: formatMmk(amountValue),
      category: category.name,
      categoryId: category.id,
      description: plan.description ?? item.note ?? (typeof planMetadata.description === "string" ? planMetadata.description : ""),
      endDate: plan.end_date ?? "",
      icon: appearance.icon,
      id: item.id,
      itemId: item.id,
      period,
      planId: plan.id,
      planStatus,
      remaining: formatMmk(remainingValue),
      startDate: plan.start_date,
      startDateTimeValue: combineDateWithTimestampTime(plan.start_date, plan.created_at),
      status: budgetStatus(usagePercent, alertPercentage),
      tone: appearance.tone,
      usagePercent,
    }];
  }).sort((first, second) => dateTimeSortValue(second.startDateTimeValue) - dateTimeSortValue(first.startDateTimeValue));
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
