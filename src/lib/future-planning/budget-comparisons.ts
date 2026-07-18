import { distinctActiveBudgetRecords } from "../budgets/calculations.ts";
import type { BudgetRecord } from "@/lib/budgets/supabase";
import type { MonthlyProjectionRow } from "@/lib/future-planning/projection";

export type BudgetComparison = {
  availableAmount: number;
  budget: BudgetRecord;
  projectedAmount: number;
  status: "Needs attention" | "On track" | "Watch";
  usagePercent: number;
};

function sameCategory(first: string, second: string) {
  return first.trim().toLowerCase() === second.trim().toLowerCase();
}

export function getBudgetComparisons(budgets: BudgetRecord[], rows: MonthlyProjectionRow[]) {
  return distinctActiveBudgetRecords(budgets)
    .flatMap<BudgetComparison>((budget) => {
      const projectedAmount = rows.reduce((total, row) => total + row.events
        .filter((event) => event.kind === "expense"
          && sameCategory(event.category, budget.category)
          && (event.budgetDate ?? event.date) >= budget.startDate
          && (event.budgetDate ?? event.date) <= budget.endDate)
        .reduce((rowTotal, event) => rowTotal + (event.budgetAmount ?? event.amount), 0), 0);
      const overlapsHorizon = rows.some((row) => row.events.some((event) => event.date >= budget.startDate && event.date <= budget.endDate))
        || rows.some((row) => `${row.monthKey}-01` <= budget.endDate && `${row.monthKey}-31` >= budget.startDate);
      if (!overlapsHorizon) return [];

      const availableAmount = Math.max(0, budget.amountValue - budget.actualValue);
      const usagePercent = budget.amountValue > 0
        ? Math.round(((budget.actualValue + projectedAmount) / budget.amountValue) * 100)
        : budget.actualValue + projectedAmount > 0 ? 999 : 0;
      const status: BudgetComparison["status"] = budget.actualValue + projectedAmount > budget.amountValue
        ? "Needs attention"
        : usagePercent >= budget.alertPercentage ? "Watch" : "On track";

      return [{ availableAmount, budget, projectedAmount, status, usagePercent }];
    })
    .sort((first, second) => second.usagePercent - first.usagePercent || first.budget.category.localeCompare(second.budget.category));
}
