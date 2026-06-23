import { notFound } from "next/navigation";

import { AppShell } from "@/components/app/app-shell";
import { PageHeader } from "@/components/app/page-header";
import { AddDebtForm } from "@/features/debts/add-debt-form";
import { getAccounts } from "@/lib/accounts/supabase";
import { getCategories } from "@/lib/categories/supabase";
import { getDebt } from "@/lib/debts/supabase";
import { getUserSafely } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/server";

export default async function EditDebtPage({ params }: { params: Promise<{ debtId: string }> }) {
  const { debtId } = await params;
  const supabase = await createClient();
  const { user } = await getUserSafely(supabase);
  if (!user) notFound();
  const accounts = await getAccounts(supabase, user.id);
  const categories = await getCategories();
  const debt = await getDebt(supabase, user.id, debtId, categories);

  if (!debt) {
    notFound();
  }

  return (
    <AppShell activeNavLabel="Debts" mobileSearchLabel="Search debts on mobile" mobileSearchPlaceholder="Search debts..." mobileSubtitle="Edit Debt" topSearchLabel="Search debts" topSearchPlaceholder="Search debts...">
      <PageHeader description={`Update debt record for ${debt.name}.`} title="Edit Debt" />
      <AddDebtForm accounts={accounts} categories={categories} debt={debt} />
    </AppShell>
  );
}
