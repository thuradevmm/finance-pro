import { AppShell } from "@/components/app/app-shell";
import { PageHeader } from "@/components/app/page-header";
import { AddDebtForm } from "@/features/debts/add-debt-form";
import { getAccounts } from "@/lib/accounts/supabase";
import { getCategories } from "@/lib/categories/supabase";
import { getUserSafely } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/server";

export default async function AddDebtPage() {
  const supabase = await createClient();
  const { user } = await getUserSafely(supabase);
  const accounts = user ? await getAccounts(supabase, user.id) : [];
  const categories = user ? await getCategories() : [];

  return (
    <AppShell
      activeNavLabel="Debts"
      mobileSearchLabel="Search debts on mobile"
      mobileSearchPlaceholder="Search debts..."
      mobileSubtitle="Add Debt"
      topSearchLabel="Search debts"
      topSearchPlaceholder="Search debts..."
    >
      <PageHeader description="Record a liability, repayment schedule, and progress baseline." title="Add Debt" />
      <AddDebtForm accounts={accounts} categories={categories} />
    </AppShell>
  );
}
