import Link from "next/link";

import { AppShell } from "@/components/app/app-shell";
import { PageHeader } from "@/components/app/page-header";
import { SummaryCards } from "@/components/app/summary-cards";
import { Icon } from "@/components/ui/icon";
import { SavingsGoalsGrid } from "@/features/savings-goals/savings-goals-grid";
import { savingsGoals, savingsGoalSummaries } from "@/lib/savings-goals/mock-data";

export default function SavingsGoalsPage() {
  return (
    <AppShell
      activeNavLabel="Savings Goals"
      mobileAction={{ label: "Create goal", icon: "plus", href: "/savings-goals/add", title: "Create savings goal" }}
      mobileSearchLabel="Search savings goals on mobile"
      mobileSearchPlaceholder="Search savings goals..."
      mobileSubtitle="Savings Goals"
      topSearchLabel="Search savings goals"
      topSearchPlaceholder="Search savings goals..."
    >
      <PageHeader
        actions={
          <Link
            className="inline-flex h-10 items-center gap-2 rounded-md bg-[#0b1c30] px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-[#1f2937]"
            href="/savings-goals/add"
          >
            <Icon className="size-4" name="plus" />
            Create Savings Goal
          </Link>
        }
        description="Track progress and reach financial targets across savings accounts."
        title="Savings Goals"
      />

      <SummaryCards summaries={savingsGoalSummaries} />
      <SavingsGoalsGrid goals={savingsGoals} />
    </AppShell>
  );
}
