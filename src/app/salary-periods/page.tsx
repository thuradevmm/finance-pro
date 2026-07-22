import { redirect } from "next/navigation";

import { AppShell } from "@/components/app/app-shell";
import { PageHeader } from "@/components/app/page-header";
import { SalaryPeriodsPageContent } from "@/features/salary-periods/salary-periods-page-content";
import { getSalaryPeriodData } from "@/lib/salary-periods/supabase";
import { getUserSafely } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/server";

export default async function SalaryPeriodsPage() {
  const supabase = await createClient();
  const { user } = await getUserSafely(supabase);
  if (!user) redirect("/login");
  const data = await getSalaryPeriodData(supabase, user.id);

  return (
    <AppShell
      activeNavLabel="Salary Periods"
      mobileSearchLabel="Search salary-period transactions"
      mobileSearchPlaceholder="Search transactions..."
      mobileSubtitle="Salary Periods"
      topSearchLabel="Search salary-period transactions"
      topSearchPlaceholder="Search transactions..."
    >
      <PageHeader
        description="Follow salary, other income, spending, and safe-to-spend amounts using the payday cycle that matches how you actually live."
        title="Salary Periods"
      />
      <SalaryPeriodsPageContent data={data} />
    </AppShell>
  );
}
