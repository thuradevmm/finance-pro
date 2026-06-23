import Link from "next/link";

import { AppShell } from "@/components/app/app-shell";
import { PageHeader } from "@/components/app/page-header";
import { SummaryCards } from "@/components/app/summary-cards";
import { Icon } from "@/components/ui/icon";
import { TransactionsPageContent } from "@/features/transactions/transactions-page-content";
import { getAccounts } from "@/lib/accounts/supabase";
import { getCategories } from "@/lib/categories/supabase";
import { getUserSafely } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/server";
import { getTransactionFilterOptions, getTransactions, getTransactionSummaries } from "@/lib/transactions/supabase";

export default async function TransactionsPage({
  searchParams,
}: {
  searchParams: Promise<{ account?: string | string[]; category?: string | string[] }>;
}) {
  const resolvedSearchParams = await searchParams;
  const requestedAccount = Array.isArray(resolvedSearchParams.account) ? resolvedSearchParams.account[0] : resolvedSearchParams.account;
  const requestedCategory = Array.isArray(resolvedSearchParams.category) ? resolvedSearchParams.category[0] : resolvedSearchParams.category;
  const supabase = await createClient();
  const { user } = await getUserSafely(supabase);
  const accounts = user ? await getAccounts(supabase, user.id) : [];
  const categories = user ? await getCategories() : [];
  const transactions = user ? await getTransactions(supabase, user.id, accounts, categories) : [];
  const transactionFilterOptions = getTransactionFilterOptions(transactions, accounts, categories);
  const transactionSummaries = getTransactionSummaries(transactions);

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
      <TransactionsPageContent
        filterOptions={transactionFilterOptions}
        initialAccountFilter={requestedAccount}
        initialCategoryFilter={requestedCategory}
        transactions={transactions}
      />
    </AppShell>
  );
}
