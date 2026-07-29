import { AppShell } from "@/components/app/app-shell";
import { PageHeader } from "@/components/app/page-header";
import { FinancialPositionReconciliation } from "@/features/dashboard/financial-position-reconciliation";
import { getAccounts, summarizeAccountPosition } from "@/lib/accounts/supabase";
import { getDebts } from "@/lib/debts/supabase";
import { normalizeReconciliationDateRange, reconcileFinancialPosition } from "@/lib/reconciliation";
import { getUserSafely } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/server";
import { getDefaultTransactionDateRange } from "@/lib/transactions/date-range";
import { filterTransactionsByDateRange } from "@/lib/transactions/filters";
import { getTransactions, getTransactionSummaryValues } from "@/lib/transactions/supabase";

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
  const accounts = user ? await getAccounts(supabase, user.id, { asOfDate: dateRange.dateTo }) : [];
  const [debts, transactions] = user
    ? await Promise.all([
      getDebts(supabase, user.id, [], { asOfDate: dateRange.dateTo }),
      getTransactions(supabase, user.id, accounts, []),
    ])
    : [[], []];
  const periodTransactions = filterTransactionsByDateRange(transactions, dateRange.dateFrom, dateRange.dateTo);
  const reconciliation = reconcileFinancialPosition(
    summarizeAccountPosition(accounts),
    debts,
    getTransactionSummaryValues(periodTransactions),
  );

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
      <FinancialPositionReconciliation
        dateFrom={dateRange.dateFrom}
        dateTo={dateRange.dateTo}
        defaultDateFrom={defaultDateRange.dateFrom}
        defaultDateTo={defaultDateRange.dateTo}
        reconciliation={reconciliation}
      />
    </AppShell>
  );
}
