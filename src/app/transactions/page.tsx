import Link from "next/link";

import { AppShell } from "@/components/app/app-shell";
import { PageHeader } from "@/components/app/page-header";
import { Icon } from "@/components/ui/icon";
import { TransactionsPageContent } from "@/features/transactions/transactions-page-content";
import { getAccounts } from "@/lib/accounts/supabase";
import { getCategories } from "@/lib/categories/supabase";
import { getUserSafely } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/server";
import { getDefaultTransactionDateRange } from "@/lib/transactions/date-range";
import { getTransactionFilterOptions, getTransactions } from "@/lib/transactions/supabase";

export default async function TransactionsPage({
  searchParams,
}: {
  searchParams: Promise<{
    account?: string | string[];
    category?: string | string[];
    dateFrom?: string | string[];
    dateTo?: string | string[];
    q?: string | string[];
    status?: string | string[];
    type?: string | string[];
  }>;
}) {
  const resolvedSearchParams = await searchParams;
  const requestedAccount = Array.isArray(resolvedSearchParams.account) ? resolvedSearchParams.account[0] : resolvedSearchParams.account;
  const requestedCategory = Array.isArray(resolvedSearchParams.category) ? resolvedSearchParams.category[0] : resolvedSearchParams.category;
  const requestedSearch = Array.isArray(resolvedSearchParams.q) ? resolvedSearchParams.q[0] : resolvedSearchParams.q;
  const requestedStatus = Array.isArray(resolvedSearchParams.status) ? resolvedSearchParams.status[0] : resolvedSearchParams.status;
  const requestedDateFrom = Array.isArray(resolvedSearchParams.dateFrom) ? resolvedSearchParams.dateFrom[0] : resolvedSearchParams.dateFrom;
  const requestedDateTo = Array.isArray(resolvedSearchParams.dateTo) ? resolvedSearchParams.dateTo[0] : resolvedSearchParams.dateTo;
  const requestedType = Array.isArray(resolvedSearchParams.type) ? resolvedSearchParams.type[0] : resolvedSearchParams.type;
  const supabase = await createClient();
  const { user } = await getUserSafely(supabase);
  const accounts = user ? await getAccounts(supabase, user.id, { limit: 200 }) : [];
  const categories = user ? await getCategories({ limit: 200 }) : [];
  const transactions = user ? await getTransactions(supabase, user.id, accounts, categories) : [];
  const transactionFilterOptions = getTransactionFilterOptions(transactions, accounts, categories);
  const defaultDateRange = getDefaultTransactionDateRange();

  return (
    <AppShell
      activeNavLabel="Transactions"
      mobileAction={{ label: "Add transaction", icon: "plus", href: "/transactions/add", title: "Add transaction" }}
      mobileSearchLabel="Search transactions on mobile"
      mobileSearchPlaceholder="Search transactions..."
      mobileSubtitle="Transactions"
      topSearchLabel="Search transactions"
      topSearchPlaceholder="Search transactions..."
    >
      <PageHeader
        actions={
          <>
            <button
              className="inline-flex min-h-11 cursor-not-allowed items-center gap-2 rounded-md border border-[#c6c6cd] bg-[#f8f9ff] px-4 text-sm font-semibold text-[#76777d] opacity-70 shadow-sm"
              disabled
              title="Export is currently unavailable."
              type="button"
            >
              <Icon className="size-4" name="download" />
              Export
            </button>
            <Link
              className="inline-flex min-h-11 items-center gap-2 rounded-md bg-[#0b1c30] px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-[#1f2937]"
              href="/transactions/add"
            >
              <Icon className="size-4" name="plus" />
              Add Transaction
            </Link>
          </>
        }
        description="Manage income, expenses, transfers, receipts, and account activity."
        title="Transactions"
      />

      <TransactionsPageContent
        filterOptions={transactionFilterOptions}
        initialAccountFilter={requestedAccount}
        initialCategoryFilter={requestedCategory}
        initialDateFrom={requestedDateFrom ?? defaultDateRange.dateFrom}
        initialDateTo={requestedDateTo ?? defaultDateRange.dateTo}
        initialSearchFilter={requestedSearch}
        initialStatusFilter={requestedStatus}
        initialTypeFilter={requestedType}
        transactions={transactions}
      />
    </AppShell>
  );
}
