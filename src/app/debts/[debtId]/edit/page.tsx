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
  const recordLabel = debt.isCreditCardDebt ? "Credit Card Borrowing" : debt.nature;

  return (
    <AppShell activeNavLabel="Borrowing & Lending" mobileSearchLabel="Search borrowing and lending on mobile" mobileSearchPlaceholder="Search borrowing and lending..." mobileSubtitle={`Edit ${recordLabel}`} topSearchLabel="Search borrowing and lending" topSearchPlaceholder="Search borrowing and lending...">
      <PageHeader description={`Update the ${recordLabel.toLowerCase()} record, linked account amount type, and ${debt.nature === "Lending" ? "return" : "repayment"} plan for ${debt.name}.`} title={`Edit ${recordLabel}`} />
      <AddDebtForm accounts={accounts} categories={categories} debt={debt} />
    </AppShell>
  );
}
