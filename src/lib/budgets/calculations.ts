export type BudgetPeriodValue = "Monthly" | "Yearly" | "monthly" | "yearly";

import { isValidCalendarDate, parseCalendarDateParts } from "../date-validation.ts";

function dateValue(year: number, month: number, day: number) {
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function isYearly(period: BudgetPeriodValue) {
  return period.toLowerCase() === "yearly";
}

export function inferBudgetEndDate(startDate: string, period: BudgetPeriodValue) {
  const start = parseCalendarDateParts(startDate);
  if (!start) return "";
  if (isYearly(period)) return dateValue(start.year, 12, 31);
  const finalDay = new Date(start.year, start.month, 0).getDate();
  return dateValue(start.year, start.month, finalDay);
}

export function effectiveBudgetEndDate(startDate: string, endDate: string | null | undefined, period: BudgetPeriodValue) {
  if (endDate) return isValidCalendarDate(endDate) ? endDate : "";
  return inferBudgetEndDate(startDate, period);
}

export function budgetRangesOverlap(
  first: { endDate: string; startDate: string },
  second: { endDate: string; startDate: string },
) {
  return Boolean(first.startDate && first.endDate && second.startDate && second.endDate)
    && first.startDate <= second.endDate
    && second.startDate <= first.endDate;
}

export function linkedBudgetEditError(
  currentCategoryId: string | null | undefined,
  next: { categoryId: string; endDate: string; startDate: string },
  linkedTransactions: Array<{ transaction_date?: string | null }>,
) {
  if (linkedTransactions.length === 0) return "";
  if ((currentCategoryId ?? "") !== next.categoryId) {
    return "The category cannot be changed because transactions are already linked to this budget.";
  }
  const outsideRange = linkedTransactions.some((transaction) => {
    const date = String(transaction.transaction_date ?? "").slice(0, 10);
    return !isValidCalendarDate(date) || date < next.startDate || date > next.endDate;
  });
  return outsideRange
    ? "The budget dates must continue to include every linked transaction."
    : "";
}

export function budgetSelectionRange(date: Date, period: BudgetPeriodValue) {
  const year = date.getFullYear();
  if (isYearly(period)) {
    return { startDate: dateValue(year, 1, 1), endDate: dateValue(year, 12, 31) };
  }
  const month = date.getMonth() + 1;
  return {
    startDate: dateValue(year, month, 1),
    endDate: dateValue(year, month, new Date(year, month, 0).getDate()),
  };
}

export function budgetOverlapsSelection(
  budget: { endDate?: string | null; period: BudgetPeriodValue; startDate: string },
  selectedDate: Date,
) {
  return budgetRangesOverlap(
    {
      endDate: effectiveBudgetEndDate(budget.startDate, budget.endDate, budget.period),
      startDate: budget.startDate,
    },
    budgetSelectionRange(selectedDate, budget.period),
  );
}

export type SelectableBudgetRecord = {
  categoryId: string;
  endDate?: string | null;
  period: BudgetPeriodValue;
  planStatus: string;
  startDate: string;
  startDateTimeValue: string;
};

/**
 * Keeps the newest record when legacy active plans overlap. New writes reject
 * these overlaps, but read-time de-duplication prevents old rows from making
 * totals and forecast warnings count the same category twice.
 */
export function distinctActiveBudgetRecords<T extends SelectableBudgetRecord>(budgets: T[]) {
  const selected: T[] = [];
  const newestFirst = budgets
    .filter((budget) => budget.planStatus === "Active")
    .sort((first, second) => second.startDateTimeValue.localeCompare(first.startDateTimeValue));

  for (const budget of newestFirst) {
    const overlapsSelected = selected.some((existing) => existing.categoryId === budget.categoryId
      && existing.period.toLowerCase() === budget.period.toLowerCase()
      && budgetRangesOverlap(
        { startDate: existing.startDate, endDate: effectiveBudgetEndDate(existing.startDate, existing.endDate, existing.period) },
        { startDate: budget.startDate, endDate: effectiveBudgetEndDate(budget.startDate, budget.endDate, budget.period) },
      ));
    if (!overlapsSelected) selected.push(budget);
  }

  return selected;
}

export function currentBudgetRecords<T extends SelectableBudgetRecord>(
  budgets: T[],
  selectedDate: Date,
  period?: BudgetPeriodValue,
) {
  return distinctActiveBudgetRecords(budgets)
    .filter((budget) => (!period || budget.period.toLowerCase() === period.toLowerCase())
      && budgetOverlapsSelection(budget, selectedDate));
}
