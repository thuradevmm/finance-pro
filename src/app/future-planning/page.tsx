import Link from "next/link";

import { AppShell } from "@/components/app/app-shell";
import { PageHeader } from "@/components/app/page-header";
import { Icon } from "@/components/ui/icon";
import { FuturePlanningPageContent } from "@/features/future-planning/future-planning-page-content";
import { getFuturePlanningData, type FuturePlanningData } from "@/lib/future-planning/supabase";
import { getUserSafely } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/server";

function localDateValue(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

const emptyPlanningData: FuturePlanningData = {
  budgets: [],
  forecastItems: [],
  historicalActuals: [],
  openingBalance: 0,
  openingCardCredits: {},
  openingSavings: 0,
  plannedTransactions: [],
  sourceCounts: {
    debtPayments: 0,
    plannedTransactions: 0,
    savingsGoals: 0,
    subscriptions: 0,
  },
};

export default async function FuturePlanningPage() {
  const supabase = await createClient();
  const { user } = await getUserSafely(supabase);
  const today = localDateValue(new Date());
  const data = user
    ? await getFuturePlanningData(supabase, user.id, today)
    : emptyPlanningData;

  return (
    <AppShell
      activeNavLabel="Future Planning"
      mobileAction={{ label: "Add planned transaction", icon: "plus", href: "/future-planning/add", title: "Add planned transaction" }}
      mobileSearchLabel="Search future plans on mobile"
      mobileSearchPlaceholder="Search plans..."
      mobileSubtitle="Future Planning"
      topSearchLabel="Search future plans"
      topSearchPlaceholder="Search plans..."
    >
      <PageHeader
        actions={(
          <Link
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md bg-[#0b1c30] px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-[#1f2937]"
            href="/future-planning/add"
          >
            <Icon className="size-4" name="plus" />
            Add Planned Transaction
          </Link>
        )}
        description="Plan future income and expenses, combine them with subscriptions, debt payments, and savings goals, then preview your rolling cash position before money moves."
        title="Future Planning"
      />

      <FuturePlanningPageContent
        budgets={data.budgets}
        forecastItems={data.forecastItems}
        historicalActuals={data.historicalActuals}
        openingBalance={data.openingBalance}
        openingCardCredits={data.openingCardCredits}
        openingSavings={data.openingSavings}
        plannedTransactions={data.plannedTransactions}
        sourceCounts={data.sourceCounts}
        today={today}
      />
    </AppShell>
  );
}
