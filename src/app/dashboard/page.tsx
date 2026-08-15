import { AppShell } from "@/components/app/app-shell";
import { PageHeader } from "@/components/app/page-header";
import { FinancialPositionReconciliation } from "@/features/dashboard/financial-position-reconciliation";
import { FinancialHealthIndicators } from "@/features/dashboard/financial-health-indicators";
import { getAccounts } from "@/lib/accounts/supabase";
import { getDebts } from "@/lib/debts/supabase";
import { getCategories } from "@/lib/categories/supabase";
import { buildFinancialHealthSignals } from "@/lib/dashboard/health-indicators";
import {
  dashboardAmountTypeOptions,
  dashboardScopeTransferNet,
  filterDebtsForDashboardAmountTypes,
  filterSavingsGoalsForDashboardAmountTypes,
  sanitizeDashboardAmountTypes,
  summarizeAccountPositionForAmountTypes,
  transactionMatchesDashboardAmountTypes,
} from "@/lib/dashboard/amount-type-filter";
import { normalizeReconciliationDateRange, reconcileFinancialPosition, summarizeDebtCancellationAdjustments, summarizeNetWorth } from "@/lib/reconciliation";
import { getUserSafely } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/server";
import { getDefaultTransactionDateRange } from "@/lib/transactions/date-range";
import { filterTransactionsByDateRange } from "@/lib/transactions/filters";
import { getTransactions, getTransactionSummaryValues } from "@/lib/transactions/supabase";
import { getSavingsGoals } from "@/lib/savings-goals/supabase";

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{
    dateFrom?: string | string[];
    dateTo?: string | string[];
    amountType?: string | string[];
  }>;
}) {
  const resolvedSearchParams = await searchParams;
  const hasSubmittedFilters = resolvedSearchParams.dateFrom !== undefined
    || resolvedSearchParams.dateTo !== undefined
    || resolvedSearchParams.amountType !== undefined;
  const defaultDateRange = getDefaultTransactionDateRange();
  const requestedDateFrom = Array.isArray(resolvedSearchParams.dateFrom) ? resolvedSearchParams.dateFrom[0] : resolvedSearchParams.dateFrom;
  const requestedDateTo = Array.isArray(resolvedSearchParams.dateTo) ? resolvedSearchParams.dateTo[0] : resolvedSearchParams.dateTo;
  const requestedAmountTypes = Array.isArray(resolvedSearchParams.amountType)
    ? resolvedSearchParams.amountType
    : resolvedSearchParams.amountType ? [resolvedSearchParams.amountType] : [];
  const dateRange = normalizeReconciliationDateRange({
    dateFrom: requestedDateFrom,
    dateTo: requestedDateTo,
  }, defaultDateRange);
  const supabase = await createClient();
  const { user } = await getUserSafely(supabase);
  const openingDate = new Date(`${dateRange.dateFrom}T00:00:00Z`);
  openingDate.setUTCDate(openingDate.getUTCDate() - 1);
  const openingDateValue = openingDate.toISOString().slice(0, 10);
  const [accounts, openingAccounts] = user
    ? await Promise.all([
      getAccounts(supabase, user.id, { asOfDate: dateRange.dateTo }),
      getAccounts(supabase, user.id, { asOfDate: openingDateValue }),
    ])
    : [[], []];
  const categories = user ? await getCategories() : [];
  const [debts, openingDebts, transactions, savingsGoals] = user
    ? await Promise.all([
      getDebts(supabase, user.id, categories, { asOfDate: dateRange.dateTo }),
      getDebts(supabase, user.id, categories, { asOfDate: openingDateValue }),
      getTransactions(supabase, user.id, accounts, categories),
      getSavingsGoals(supabase, user.id, accounts, categories, { asOfDate: dateRange.dateTo }),
    ])
    : [[], [], [], []];
  const amountTypeOptions = dashboardAmountTypeOptions([...accounts, ...openingAccounts]);
  const selectedAmountTypes = sanitizeDashboardAmountTypes(requestedAmountTypes, amountTypeOptions);
  const hasExplicitAmountTypeFilter = requestedAmountTypes.some((requested) => (
    amountTypeOptions.some((option) => option.toLowerCase() === requested.trim().toLowerCase())
  ));
  const creditCardAccountIds = new Set(accounts.filter((account) => account.type === "Credit Card").map((account) => account.id));
  const datedTransactions = filterTransactionsByDateRange(transactions, dateRange.dateFrom, dateRange.dateTo);
  const periodTransactions = hasExplicitAmountTypeFilter
    ? datedTransactions.filter((transaction) => transactionMatchesDashboardAmountTypes(transaction, selectedAmountTypes, creditCardAccountIds))
    : datedTransactions;
  const filteredDebts = filterDebtsForDashboardAmountTypes(debts, selectedAmountTypes, !hasExplicitAmountTypeFilter);
  const filteredOpeningDebts = filterDebtsForDashboardAmountTypes(openingDebts, selectedAmountTypes, !hasExplicitAmountTypeFilter);
  const filteredSavingsGoals = filterSavingsGoalsForDashboardAmountTypes(savingsGoals, selectedAmountTypes);
  const reconciliation = reconcileFinancialPosition(
    summarizeAccountPositionForAmountTypes(accounts, selectedAmountTypes),
    filteredDebts,
    getTransactionSummaryValues(periodTransactions),
    summarizeNetWorth(summarizeAccountPositionForAmountTypes(openingAccounts, selectedAmountTypes), filteredOpeningDebts).netWorth,
    dashboardScopeTransferNet(periodTransactions),
    summarizeDebtCancellationAdjustments(filteredOpeningDebts, filteredDebts),
  );
  const healthSignals = buildFinancialHealthSignals({ categories, dateFrom: dateRange.dateFrom, dateTo: dateRange.dateTo, savingsGoals: filteredSavingsGoals, transactions: periodTransactions });

  return (
    <AppShell
      activeNavLabel="Dashboard"
      mobileSearchLabel="Search dashboard"
      mobileSearchPlaceholder="Search dashboard..."
      mobileSubtitle="Dashboard"
      topSearchLabel="Search dashboard"
      topSearchPlaceholder="Search dashboard..."
    >
      <PageHeader
        description="Review your date-scoped financial position, economic performance, and reconciliation in one place."
        title="Dashboard"
      />
      <FinancialHealthIndicators signals={healthSignals} />
      <FinancialPositionReconciliation
        amountTypeOptions={amountTypeOptions}
        baseCurrency={accounts[0]?.baseCurrency ?? "MMK"}
        dateFrom={dateRange.dateFrom}
        dateTo={dateRange.dateTo}
        defaultDateFrom={defaultDateRange.dateFrom}
        defaultDateTo={defaultDateRange.dateTo}
        hasSubmittedFilters={hasSubmittedFilters}
        reconciliation={reconciliation}
        selectedAmountTypes={selectedAmountTypes}
      />
    </AppShell>
  );
}
