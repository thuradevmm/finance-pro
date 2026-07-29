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
      activeNavLabel="Borrowing & Lending"
      mobileSearchLabel="Search borrowing and lending on mobile"
      mobileSearchPlaceholder="Search borrowing and lending..."
      mobileSubtitle="Add Borrowing / Lending"
      topSearchLabel="Search borrowing and lending"
      topSearchPlaceholder="Search borrowing and lending..."
    >
      <PageHeader description="Record money borrowed or lent, choose the affected account amount type, and set the payment or return schedule." title="Add Borrowing or Lending" />
      <AddDebtForm accounts={accounts} categories={categories} />
    </AppShell>
  );
}
