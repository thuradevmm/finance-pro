import { AppShell } from "@/components/app/app-shell";
import { PageHeader } from "@/components/app/page-header";
import { SegmentedTabs } from "@/components/app/segmented-tabs";
import { SummaryCards } from "@/components/app/summary-cards";
import { Icon } from "@/components/ui/icon";
import { TransactionsFilters } from "@/features/transactions/transactions-filters";
import { TransactionsTable } from "@/features/transactions/transactions-table";
import { transactionFilterOptions, transactions, transactionSummaries } from "@/lib/transactions/mock-data";

const transactionTabs = ["All", "Income", "Expense", "Transfer"];

export default function TransactionsPage() {
  return (
    <AppShell
      activeNavLabel="Transactions"
      mobileAction={{ label: "Add transaction", icon: "plus", title: "Add transaction" }}
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
            <button
              className="inline-flex h-10 items-center gap-2 rounded-md bg-[#0b1c30] px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-[#1f2937]"
              type="button"
            >
              <Icon className="size-4" name="plus" />
              Add Transaction
            </button>
          </>
        }
        description="Manage income, expenses, transfers, receipts, and account activity."
        title="Transactions"
      />

      <SummaryCards summaries={transactionSummaries} />
      <SegmentedTabs activeTab="All" tabs={transactionTabs} />
      <TransactionsFilters filterOptions={transactionFilterOptions} />
      <TransactionsTable totalResults={97} transactions={transactions} />
    </AppShell>
  );
}
