import type { FutureTransactionRecord } from "./records.ts";

export type FuturePlanningColumnDirection = "expense" | "income" | "neutral" | "saving";

export type FuturePlanningColumn = {
  categoryId: string;
  direction: FuturePlanningColumnDirection;
  id: string;
  name: string;
  relatedEntityType: string;
  sortOrder: number;
};

export type FuturePlanningMonthlyRow = {
  columnAmounts: Record<string, number>;
  month: number;
  monthKey: string;
  monthLabel: string;
  netAmount: number;
  plans: FutureTransactionRecord[];
  totalExpense: number;
  totalIncome: number;
  totalSaving: number;
  year: number;
};

const MONTH_LABELS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
] as const;

function roundMoney(value: number) {
  if (!Number.isFinite(value) || value === 0) return 0;
  return Math.round((value + Math.sign(value) * Number.EPSILON) * 100) / 100;
}

export function normalizePlanningYears(values: Iterable<number>, fallbackYear?: number) {
  const years = [...new Set([...values]
    .map((value) => Math.trunc(Number(value)))
    .filter((value) => Number.isFinite(value) && value >= 1900 && value <= 9999))]
    .sort((first, second) => first - second);
  if (years.length > 0 || fallbackYear == null) return years;
  const fallback = Math.trunc(fallbackYear);
  return fallback >= 1900 && fallback <= 9999 ? [fallback] : [];
}

function columnMatchesPlan(column: FuturePlanningColumn, plan: FutureTransactionRecord) {
  if (column.categoryId) return plan.categoryId === column.categoryId;
  return Boolean(column.relatedEntityType) && plan.relatedEntityType === column.relatedEntityType;
}

function defaultPlanDirection(plan: FutureTransactionRecord): FuturePlanningColumnDirection {
  if (plan.type === "Income") return "income";
  if (plan.relatedEntityType === "savings_goal") return "saving";
  return "expense";
}

function planDirection(
  plan: FutureTransactionRecord,
  orderedColumns: FuturePlanningColumn[],
): FuturePlanningColumnDirection {
  return orderedColumns.find((column) => columnMatchesPlan(column, plan))?.direction
    ?? defaultPlanDirection(plan);
}

export function buildManualFuturePlanningTable(
  plans: FutureTransactionRecord[],
  columns: FuturePlanningColumn[],
  selectedYears: number[],
): FuturePlanningMonthlyRow[] {
  const years = normalizePlanningYears(selectedYears);
  const activePlans = plans.filter((plan) => plan.status === "Active");
  const classificationColumns = [...columns]
    .sort((first, second) => first.sortOrder - second.sortOrder);
  const plansByMonth = new Map<string, FutureTransactionRecord[]>();
  for (const plan of activePlans) {
    const monthKey = plan.dateValue.slice(0, 7);
    const year = Number(monthKey.slice(0, 4));
    if (!years.includes(year)) continue;
    plansByMonth.set(monthKey, [...(plansByMonth.get(monthKey) ?? []), plan]);
  }

  return years.flatMap((year) => Array.from({ length: 12 }, (_, monthIndex) => {
    const month = monthIndex + 1;
    const monthKey = `${year}-${String(month).padStart(2, "0")}`;
    const monthPlans = plansByMonth.get(monthKey) ?? [];
    const classifiedPlans = monthPlans.map((plan) => ({
      direction: planDirection(plan, classificationColumns),
      plan,
    }));
    const savingPlans = classifiedPlans.filter((item) => item.direction === "saving");
    const incomePlans = classifiedPlans.filter((item) => item.direction === "income");
    const expensePlans = classifiedPlans.filter((item) => item.direction === "expense");
    const totalIncome = roundMoney(incomePlans.reduce((total, item) => total + item.plan.amountValue, 0));
    const totalExpense = roundMoney(expensePlans.reduce((total, item) => total + item.plan.amountValue, 0));
    const totalSaving = roundMoney(savingPlans.reduce((total, item) => total + item.plan.amountValue, 0));
    return {
      columnAmounts: Object.fromEntries(columns.map((column) => [
        column.id,
        roundMoney(monthPlans
          .filter((plan) => columnMatchesPlan(column, plan))
          .reduce((total, plan) => total + plan.amountValue, 0)),
      ])),
      month,
      monthKey,
      monthLabel: MONTH_LABELS[monthIndex],
      netAmount: roundMoney(totalIncome - totalExpense - totalSaving),
      plans: monthPlans,
      totalExpense,
      totalIncome,
      totalSaving,
      year,
    };
  }));
}
