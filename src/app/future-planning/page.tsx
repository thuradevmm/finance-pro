import { AppShell } from "@/components/app/app-shell";
import { PageHeader } from "@/components/app/page-header";
import { FuturePlanningPageContent } from "@/features/future-planning/future-planning-page-content";
import { getManualFuturePlanningData, type ManualFuturePlanningData } from "@/lib/future-planning/supabase";
import { getUserSafely } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/server";

function localDateValue(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

const emptyPlanningData: ManualFuturePlanningData = {
  amounts: [],
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
      mobileSearchLabel="Search future plans on mobile"
      mobileSearchPlaceholder="Search plans..."
      mobileSubtitle="Future Planning"
      topSearchLabel="Search future plans"
      topSearchPlaceholder="Search plans..."
    >
      <PageHeader
        description="Define your own income, expense, and saving types, enter monthly planned amounts manually, and compare them with linked actual transactions."
        title="Future Planning"
      />

      <FuturePlanningPageContent
        amounts={data.amounts}
        columns={data.columns}
        selectedYears={data.selectedYears}
      />
    </AppShell>
  );
}
