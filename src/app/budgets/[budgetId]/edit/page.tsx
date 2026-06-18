import { notFound } from "next/navigation";

import { AppShell } from "@/components/app/app-shell";
import { PageHeader } from "@/components/app/page-header";
import { SimpleRecordEditPage } from "@/components/ui/simple-record-edit-page";
import { budgetCategories } from "@/lib/budgets/mock-data";
import type { BudgetPeriod } from "@/types/finance";

const periods: BudgetPeriod[] = ["Monthly", "Yearly"];

export default async function EditBudgetPage({ params }: { params: Promise<{ budgetId: string }> }) {
  const { budgetId } = await params;
  const budget = budgetCategories.find((item) => item.id === budgetId);

  if (!budget) {
    notFound();
  }

  return (
    <AppShell activeNavLabel="Budgets" mobileSearchLabel="Search budgets on mobile" mobileSearchPlaceholder="Search budgets..." mobileSubtitle="Edit Budget" topSearchLabel="Search budgets" topSearchPlaceholder="Search budgets...">
      <PageHeader description={`Update budget details for ${budget.category}.`} title="Edit Budget" />
      <SimpleRecordEditPage
        cancelHref="/budgets"
        fields={[
          { key: "category", label: "Category" },
          { key: "period", label: "Period", options: periods },
          { key: "budget", label: "Budget Amount", type: "currency" },
        ]}
        preview={{
          icon: budget.icon,
          iconClassName: `${budget.bg} ${budget.tone}`,
          label: "Budget Preview",
          metrics: [
            { label: "Budget", key: "budget" },
            { label: "Period", key: "period" },
          ],
          primaryKey: "category",
          secondaryKey: "period",
        }}
        record={budget as unknown as Record<string, string>}
        saveLabel="Save Budget"
      />
    </AppShell>
  );
}
