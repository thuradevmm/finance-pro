import { AppShell } from "@/components/app/app-shell";
import { PageHeader } from "@/components/app/page-header";
import { AddSavingsGoalForm } from "@/features/savings-goals/add-savings-goal-form";
import { getAccounts } from "@/lib/accounts/supabase";
import { getCategories } from "@/lib/categories/supabase";
import { createClient } from "@/lib/supabase/server";
import { getUserSafely } from "@/lib/supabase/auth";

export default async function AddSavingsGoalPage() {
  const supabase = await createClient();
  const { user } = await getUserSafely(supabase);
  const accounts = user ? await getAccounts(supabase, user.id) : [];
  const categories = user ? await getCategories() : [];

  return (
    <AppShell
      activeNavLabel="Savings Goals"
      mobileSearchLabel="Search savings goals on mobile"
      mobileSearchPlaceholder="Search savings goals..."
      mobileSubtitle="Create Savings Goal"
      topSearchLabel="Search savings goals"
      topSearchPlaceholder="Search savings goals..."
    >
      <PageHeader description="Set a target amount, timeline, and contribution plan for a savings goal." title="Create Savings Goal" />
      <AddSavingsGoalForm accounts={accounts} categories={categories} />
    </AppShell>
  );
}
