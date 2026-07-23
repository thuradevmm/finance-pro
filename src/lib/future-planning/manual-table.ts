import type { FutureTransactionRecord } from "./records.ts";

export type FuturePlanningColumnDirection = "expense" | "income" | "neutral" | "saving";

export type FuturePlanningColumn = {
  direction: FuturePlanningColumnDirection;
  id: string;
  name: string;
  sortOrder: number;
};

export type FuturePlanningAmount = {
  actualAmount: number;
  amount: number;
  columnId: string;
  id: string;
  periodMonth: string;
};

export type FuturePlanningMonthlyRow = {
  actualColumnAmounts: Record<string, number>;
  actualExpense: number;
  actualIncome: number;
  actualNetAmount: number;
  actualSaving: number;
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

export function buildManualFuturePlanningTable(
  plans: FutureTransactionRecord[],
  columns: FuturePlanningColumn[],
  selectedYears: number[],
  amounts: FuturePlanningAmount[] = [],
): FuturePlanningMonthlyRow[] {
  const years = normalizePlanningYears(selectedYears);
  const activePlans = plans.filter((plan) => plan.status === "Active");
  const amountsByMonth = new Map<string, FuturePlanningAmount[]>();
  for (const amount of amounts) {
    const monthKey = amount.periodMonth.slice(0, 7);
    amountsByMonth.set(monthKey, [...(amountsByMonth.get(monthKey) ?? []), amount]);
  }
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
    const monthAmounts = amountsByMonth.get(monthKey) ?? [];
    const amountFor = (column: FuturePlanningColumn) => monthAmounts
      .filter((amount) => amount.columnId === column.id)
      .reduce((total, amount) => total + amount.amount, 0);
    const actualFor = (column: FuturePlanningColumn) => monthAmounts
      .filter((amount) => amount.columnId === column.id)
      .reduce((total, amount) => total + amount.actualAmount, 0);
    const totalIncome = roundMoney(columns.filter((column) => column.direction === "income").reduce((total, column) => total + amountFor(column), 0));
    const totalExpense = roundMoney(columns.filter((column) => column.direction === "expense").reduce((total, column) => total + amountFor(column), 0));
    const totalSaving = roundMoney(columns.filter((column) => column.direction === "saving").reduce((total, column) => total + amountFor(column), 0));
    const actualIncome = roundMoney(columns.filter((column) => column.direction === "income").reduce((total, column) => total + actualFor(column), 0));
    const actualExpense = roundMoney(columns.filter((column) => column.direction === "expense").reduce((total, column) => total + actualFor(column), 0));
    const actualSaving = roundMoney(columns.filter((column) => column.direction === "saving").reduce((total, column) => total + actualFor(column), 0));
    return {
      actualColumnAmounts: Object.fromEntries(columns.map((column) => [column.id, roundMoney(actualFor(column))])),
      actualExpense,
      actualIncome,
      actualNetAmount: roundMoney(actualIncome - actualExpense - actualSaving),
      actualSaving,
      columnAmounts: Object.fromEntries(columns.map((column) => [
        column.id,
        roundMoney(amountFor(column)),
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
