import Link from "next/link";

import { AppShell } from "@/components/app/app-shell";
import { PageHeader } from "@/components/app/page-header";
import { Icon } from "@/components/ui/icon";
import { FuturePlanningPageContent } from "@/features/future-planning/future-planning-page-content";
import { getManualFuturePlanningData, type ManualFuturePlanningData } from "@/lib/future-planning/supabase";
import { getUserSafely } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/server";

function localDateValue(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

const emptyPlanningData: ManualFuturePlanningData = {
  categories: [],
  columns: [],
  plannedTransactions: [],
  selectedYears: [],
};

export default async function FuturePlanningPage() {
  const supabase = await createClient();
  const { user } = await getUserSafely(supabase);
  const today = localDateValue(new Date());
  const data = user
    ? await getManualFuturePlanningData(supabase, user.id, today)
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
        description="Build a simple year-by-year planning table from the income and expenses you schedule. Link a plan to an existing module when useful, while keeping its entered amount as a stable snapshot."
        title="Future Planning"
      />

      <FuturePlanningPageContent
        categories={data.categories}
        columns={data.columns}
        plannedTransactions={data.plannedTransactions}
        selectedYears={data.selectedYears}
      />
    </AppShell>
  );
}
