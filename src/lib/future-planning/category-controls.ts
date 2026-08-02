import { roundCurrencyValue } from "../ledger.ts";

export type CategoryActual = {
  amount: number;
  categoryId: string;
  dateValue: string;
};

export function planningDirectionForCategoryType(categoryType: string) {
  const normalized = String(categoryType).trim().toLowerCase().replace(/[\s-]+/g, "_");
  if (normalized === "income") return "income" as const;
  if (normalized === "savings_goal") return "saving" as const;
  return "expense" as const;
}

export function rollingCompleteMonthKeys(today: string, monthCount = 6) {
  const [year, month] = today.slice(0, 7).split("-").map(Number);
  if (!Number.isFinite(year) || !Number.isFinite(month) || month < 1 || month > 12 || monthCount <= 0) return [];
  return Array.from({ length: monthCount }, (_, index) => {
    const date = new Date(Date.UTC(year, month - 2 - index, 1));
    return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
  }).reverse();
}

export function categoryMonthlyAverages(
  actuals: CategoryActual[],
  today: string,
  monthCount = 6,
) {
  const monthKeys = rollingCompleteMonthKeys(today, monthCount);
  const includedMonths = new Set(monthKeys);
  const totals = new Map<string, number>();
  for (const actual of actuals) {
    if (!actual.categoryId || !includedMonths.has(actual.dateValue.slice(0, 7))) continue;
    totals.set(actual.categoryId, (totals.get(actual.categoryId) ?? 0) + actual.amount);
  }
  return new Map([...totals].map(([categoryId, total]) => [
    categoryId,
    roundCurrencyValue(total / Math.max(monthKeys.length, 1)),
  ]));
}

export function planningControlStatus(actual: number, planned: number, direction: string) {
  if (planned <= 0) return { label: actual > 0 ? "Plan needed" : "Not set", remaining: -actual, usagePercent: 0 };
  const usagePercent = Math.max(0, Math.round((actual / planned) * 100));
  const remaining = roundCurrencyValue(planned - actual);
  if (direction === "income") {
    return {
      label: actual >= planned ? "Target met" : "Below target",
      remaining,
      usagePercent,
    };
  }
  return {
    label: actual > planned ? "Over plan" : usagePercent >= 80 ? "Near limit" : "On track",
    remaining,
    usagePercent,
  };
}
