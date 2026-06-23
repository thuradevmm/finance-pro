import { notFound } from "next/navigation";

import { AppShell } from "@/components/app/app-shell";
import { PageHeader } from "@/components/app/page-header";
import { AddSavingsGoalForm } from "@/features/savings-goals/add-savings-goal-form";
import { getAccounts } from "@/lib/accounts/supabase";
import { getCategories } from "@/lib/categories/supabase";
import { getSavingsGoal } from "@/lib/savings-goals/supabase";
import { createClient } from "@/lib/supabase/server";
import { getUserSafely } from "@/lib/supabase/auth";

export default async function EditSavingsGoalPage({ params }: { params: Promise<{ goalId: string }> }) {
  const { goalId } = await params;
  const supabase = await createClient();
  const { user } = await getUserSafely(supabase);
  if (!user) notFound();
  const accounts = await getAccounts(supabase, user.id);
  const categories = await getCategories();
  const goal = await getSavingsGoal(supabase, user.id, goalId, accounts, categories);

  if (!goal) {
    notFound();
  }

  return (
    <AppShell
      activeNavLabel="Savings Goals"
      mobileSearchLabel="Search savings goals on mobile"
      mobileSearchPlaceholder="Search savings goals..."
      mobileSubtitle="Edit Goal"
      topSearchLabel="Search savings goals"
      topSearchPlaceholder="Search savings goals..."
    >
      <PageHeader description={`Update savings target for ${goal.name}.`} title="Edit Savings Goal" />
      <AddSavingsGoalForm accounts={accounts} categories={categories} goal={goal} />
    </AppShell>
  );
}
