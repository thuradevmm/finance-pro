import { notFound } from "next/navigation";

import { AppShell } from "@/components/app/app-shell";
import { PageHeader } from "@/components/app/page-header";
import { AddBudgetForm } from "@/features/budgets/add-budget-form";
import { getBudget } from "@/lib/budgets/supabase";
import { getCategories } from "@/lib/categories/supabase";
import { getUserSafely } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/server";

export default async function EditBudgetPage({ params }: { params: Promise<{ budgetId: string }> }) {
  const { budgetId } = await params;
  const supabase = await createClient();
  const { user } = await getUserSafely(supabase);
  if (!user) notFound();
  const [budget, categories] = await Promise.all([getBudget(supabase, user.id, budgetId), getCategories()]);

  if (!budget) {
    notFound();
  }

  return (
    <AppShell activeNavLabel="Budgets" mobileSearchLabel="Search budgets on mobile" mobileSearchPlaceholder="Search budgets..." mobileSubtitle="Edit Budget" topSearchLabel="Search budgets" topSearchPlaceholder="Search budgets...">
      <PageHeader description={`Update budget details for ${budget.category}.`} title="Edit Budget" />
      <AddBudgetForm budget={budget} categories={categories} />
    </AppShell>
  );
}
