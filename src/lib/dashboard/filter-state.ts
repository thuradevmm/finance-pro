import { sanitizeDashboardAmountTypes } from "./amount-type-filter.ts";
import { normalizeReconciliationDateRange } from "../reconciliation.ts";

export type DashboardFilterState = {
  amountTypes: string[];
  dateFrom: string;
  dateTo: string;
};

export function normalizeDashboardFilterState(
  value: Partial<DashboardFilterState> | null | undefined,
  defaults: Pick<DashboardFilterState, "dateFrom" | "dateTo">,
  amountTypeOptions: string[],
): DashboardFilterState {
  const dateRange = normalizeReconciliationDateRange({
    dateFrom: typeof value?.dateFrom === "string" ? value.dateFrom : undefined,
    dateTo: typeof value?.dateTo === "string" ? value.dateTo : undefined,
  }, defaults);
  const requestedAmountTypes = Array.isArray(value?.amountTypes)
    ? value.amountTypes.filter((item): item is string => typeof item === "string")
    : [];

  return {
    amountTypes: sanitizeDashboardAmountTypes(requestedAmountTypes, amountTypeOptions),
    ...dateRange,
  };
}

export function dashboardFilterHref(value: DashboardFilterState) {
  const params = new URLSearchParams();
  params.set("dateFrom", value.dateFrom);
  params.set("dateTo", value.dateTo);
  for (const amountType of value.amountTypes) params.append("amountType", amountType);
  return `/dashboard?${params.toString()}`;
}
