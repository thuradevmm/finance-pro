import Link from "next/link";

import { AppShell } from "@/components/app/app-shell";
import { PageHeader } from "@/components/app/page-header";
import { SummaryCards } from "@/components/app/summary-cards";
import { Icon } from "@/components/ui/icon";
import { BudgetsPageContent } from "@/features/budgets/budgets-page-content";
import { getBudgets, getBudgetSummaries } from "@/lib/budgets/supabase";
import { getUserSafely } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/server";

export default async function BudgetsPage() {
  const supabase = await createClient();
  const { user } = await getUserSafely(supabase);
  const budgets = user ? await getBudgets(supabase, user.id) : [];
  const summaries = getBudgetSummaries(budgets);

  return (
    <AppShell
      activeNavLabel="Budgets"
      mobileAction={{ label: "Create budget", icon: "plus", href: "/budgets/add", title: "Create budget" }}
      mobileSearchLabel="Search budgets on mobile"
      mobileSearchPlaceholder="Search budgets..."
      mobileSubtitle="Budgets"
      topSearchLabel="Search budgets"
      topSearchPlaceholder="Search budgets..."
    >
      <PageHeader
        actions={
          <Link
            className="inline-flex h-10 items-center gap-2 rounded-md bg-[#0b1c30] px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-[#1f2937]"
            href="/budgets/add"
          >
            <Icon className="size-4" name="plus" />
            Create Budget
          </Link>
        }
        description="Manage spending limits and track monthly or yearly budget goals."
        title="Budgets"
      />

      <SummaryCards summaries={summaries} />
      <BudgetsPageContent budgets={budgets} />
    </AppShell>
  );
}
