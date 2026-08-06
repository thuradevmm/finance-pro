import { AppShell } from "@/components/app/app-shell";
import { PageHeader } from "@/components/app/page-header";
import { FinancialPositionReconciliation } from "@/features/dashboard/financial-position-reconciliation";
import { FinancialHealthIndicators } from "@/features/dashboard/financial-health-indicators";
import { getAccounts, summarizeAccountPosition } from "@/lib/accounts/supabase";
import { getDebts } from "@/lib/debts/supabase";
import { getCategories } from "@/lib/categories/supabase";
import { buildFinancialHealthSignals } from "@/lib/dashboard/health-indicators";
import { normalizeReconciliationDateRange, reconcileFinancialPosition, summarizeNetWorth } from "@/lib/reconciliation";
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
  }>;
}) {
  const resolvedSearchParams = await searchParams;
  const defaultDateRange = getDefaultTransactionDateRange();
  const requestedDateFrom = Array.isArray(resolvedSearchParams.dateFrom) ? resolvedSearchParams.dateFrom[0] : resolvedSearchParams.dateFrom;
  const requestedDateTo = Array.isArray(resolvedSearchParams.dateTo) ? resolvedSearchParams.dateTo[0] : resolvedSearchParams.dateTo;
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
      getSavingsGoals(supabase, user.id, accounts, categories),
    ])
    : [[], [], [], []];
  const periodTransactions = filterTransactionsByDateRange(transactions, dateRange.dateFrom, dateRange.dateTo);
  const reconciliation = reconcileFinancialPosition(
    summarizeAccountPosition(accounts),
    debts,
    getTransactionSummaryValues(periodTransactions),
    summarizeNetWorth(summarizeAccountPosition(openingAccounts), openingDebts).netWorth,
  );
  const healthSignals = buildFinancialHealthSignals({ categories, dateFrom: dateRange.dateFrom, dateTo: dateRange.dateTo, savingsGoals, transactions: periodTransactions });

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
        baseCurrency={accounts[0]?.baseCurrency ?? "MMK"}
        dateFrom={dateRange.dateFrom}
        dateTo={dateRange.dateTo}
        defaultDateFrom={defaultDateRange.dateFrom}
        defaultDateTo={defaultDateRange.dateTo}
        reconciliation={reconciliation}
      />
    </AppShell>
  );
}
