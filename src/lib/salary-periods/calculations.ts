import { economicTransactionDelta, roundCurrencyValue, type LedgerTransactionInput } from "../ledger.ts";
import type { SalaryPeriod } from "./calendar.ts";

export const SALARY_USED_EXPLANATION = "Salary used applies a salary-first convention: posted spending in the period uses salary before other income. Transfers and credit-card payments are not counted as new spending.";

export type SalaryComparisonMetric = "otherIncome" | "salaryIncome" | "spending";
export type SalaryChangeSentiment = "adverse" | "favorable" | "neutral";

export type SalaryPeriodTransaction = LedgerTransactionInput & {
  categoryName?: string | null;
  categoryReportingRole?: string | null;
  transactionDate: string;
};

export type SalaryPeriodSummary = {
  expenseByCategory: Record<string, number>;
  otherIncome: number;
  period: SalaryPeriod;
  safeToSpend: number;
  salaryIncome: number;
  salaryRemaining: number;
  salaryUsed: number;
  salaryUsagePercent: number;
  spending: number;
  totalIncome: number;
  transactionCount: number;
};

function isSalaryRole(value: unknown) {
  return String(value ?? "").trim().toLowerCase() === "salary";
}

export function salaryChangeSentiment(
  metric: SalaryComparisonMetric,
  amount: number,
): SalaryChangeSentiment {
  if (amount === 0) return "neutral";
  const increased = amount > 0;
  if (metric === "spending") return increased ? "adverse" : "favorable";
  return increased ? "favorable" : "adverse";
}

export function summarizeSalaryPeriod(
  transactions: SalaryPeriodTransaction[],
  period: SalaryPeriod,
  throughDate: string = period.endDate,
): SalaryPeriodSummary {
  let salaryIncome = 0;
  let otherIncome = 0;
  let spending = 0;
  let transactionCount = 0;
  const expenseByCategory = new Map<string, number>();
  const effectiveEnd = throughDate < period.endDate ? throughDate : period.endDate;

  for (const transaction of transactions) {
    if (transaction.transactionDate < period.startDate || transaction.transactionDate > effectiveEnd) continue;
    const delta = economicTransactionDelta(transaction);
    if (delta.incomeDelta === 0 && delta.expenseDelta === 0) continue;
    transactionCount += 1;
    if (delta.incomeDelta !== 0) {
      if (isSalaryRole(transaction.categoryReportingRole)) salaryIncome += delta.incomeDelta;
      else otherIncome += delta.incomeDelta;
    }
    if (delta.expenseDelta !== 0) {
      spending += delta.expenseDelta;
      const category = transaction.categoryName?.trim() || "Uncategorized";
      expenseByCategory.set(category, roundCurrencyValue((expenseByCategory.get(category) ?? 0) + delta.expenseDelta));
    }
  }

  salaryIncome = roundCurrencyValue(salaryIncome);
  otherIncome = roundCurrencyValue(otherIncome);
  spending = roundCurrencyValue(spending);
  const positiveSalary = Math.max(salaryIncome, 0);
  const positiveSpending = Math.max(spending, 0);
  const salaryUsed = roundCurrencyValue(Math.min(positiveSalary, positiveSpending));
  const salaryRemaining = roundCurrencyValue(Math.max(positiveSalary - salaryUsed, 0));
  const totalIncome = roundCurrencyValue(salaryIncome + otherIncome);

  return {
    expenseByCategory: Object.fromEntries(
      [...expenseByCategory.entries()]
        .filter(([, amount]) => amount !== 0)
        .sort((left, right) => Math.abs(right[1]) - Math.abs(left[1]) || left[0].localeCompare(right[0])),
    ),
    otherIncome,
    period,
    safeToSpend: roundCurrencyValue(Math.max(totalIncome - spending, 0)),
    salaryIncome,
    salaryRemaining,
    salaryUsed,
    salaryUsagePercent: positiveSalary > 0 ? Math.min(Math.round((salaryUsed / positiveSalary) * 10_000) / 100, 100) : 0,
    spending,
    totalIncome,
    transactionCount,
  };
}

export function salaryPeriodChange(current: SalaryPeriodSummary, previous: SalaryPeriodSummary) {
  function delta(currentValue: number, previousValue: number) {
    const amount = roundCurrencyValue(currentValue - previousValue);
    return {
      amount,
      percent: previousValue === 0 ? null : Math.round((amount / Math.abs(previousValue)) * 10_000) / 100,
    };
  }
  return {
    otherIncome: delta(current.otherIncome, previous.otherIncome),
    salaryIncome: delta(current.salaryIncome, previous.salaryIncome),
    spending: delta(current.spending, previous.spending),
  };
}
