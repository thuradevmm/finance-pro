import Link from "next/link";

import { AppShell } from "@/components/app/app-shell";
import { PageHeader } from "@/components/app/page-header";
import { SummaryCards } from "@/components/app/summary-cards";
import { Icon } from "@/components/ui/icon";
import { DebtsPageContent } from "@/features/debts/debts-page-content";
import { getCategories } from "@/lib/categories/supabase";
import { getDebts, getDebtSummaries, getUpcomingDebtPayments } from "@/lib/debts/supabase";
import { getUserSafely } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/server";

export default async function DebtsPage() {
  const supabase = await createClient();
  const { user } = await getUserSafely(supabase);
  const categories = user ? await getCategories() : [];
  const debts = user ? await getDebts(supabase, user.id, categories) : [];
  const summaries = getDebtSummaries(debts);
  const payments = getUpcomingDebtPayments(debts);

  return (
    <AppShell
      activeNavLabel="Debts"
      mobileAction={{ label: "Add debt", icon: "plus", href: "/debts/add", title: "Add debt" }}
      mobileSearchLabel="Search debts on mobile"
      mobileSearchPlaceholder="Search debts..."
      mobileSubtitle="Debts"
      topSearchLabel="Search debts"
      topSearchPlaceholder="Search debts..."
    >
      <PageHeader
        actions={
          <Link
            className="inline-flex h-10 items-center gap-2 rounded-md bg-[#0b1c30] px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-[#1f2937]"
            href="/debts/add"
          >
            <Icon className="size-4" name="plus" />
            Add Debt
          </Link>
        }
        description="Manage active liabilities and track repayment progress."
        title="Debts"
      />

      <SummaryCards summaries={summaries} />
      <DebtsPageContent debts={debts} payments={payments} />
    </AppShell>
  );
}
