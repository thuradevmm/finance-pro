import Link from "next/link";

import { AppShell } from "@/components/app/app-shell";
import { PageHeader } from "@/components/app/page-header";
import { SummaryCards } from "@/components/app/summary-cards";
import { Icon } from "@/components/ui/icon";
import { TransactionsPageContent } from "@/features/transactions/transactions-page-content";
import { transactionFilterOptions, transactions, transactionSummaries } from "@/lib/transactions/mock-data";

export default async function TransactionsPage({
  searchParams,
}: {
  searchParams: Promise<{ account?: string | string[] }>;
}) {
  const resolvedSearchParams = await searchParams;
  const requestedAccount = Array.isArray(resolvedSearchParams.account) ? resolvedSearchParams.account[0] : resolvedSearchParams.account;

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
              className="inline-flex h-10 items-center gap-2 rounded-md border border-[#c6c6cd] bg-white px-4 text-sm font-semibold text-[#0b1c30] shadow-sm transition hover:bg-[#eff4ff]"
              type="button"
            >
              <Icon className="size-4" name="download" />
              Export
            </button>
            <Link
              className="inline-flex h-10 items-center gap-2 rounded-md bg-[#0b1c30] px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-[#1f2937]"
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

      <SummaryCards summaries={transactionSummaries} />
      <TransactionsPageContent filterOptions={transactionFilterOptions} initialAccountFilter={requestedAccount} transactions={transactions} />
    </AppShell>
  );
}
