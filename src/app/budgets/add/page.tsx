import { AppShell } from "@/components/app/app-shell";
import { PageHeader } from "@/components/app/page-header";
import { AddBudgetForm } from "@/features/budgets/add-budget-form";

export default function AddBudgetPage() {
  return (
    <AppShell
      activeNavLabel="Budgets"
      mobileSearchLabel="Search budgets on mobile"
      mobileSearchPlaceholder="Search budgets..."
      mobileSubtitle="Create Budget"
      topSearchLabel="Search budgets"
      topSearchPlaceholder="Search budgets..."
    >
      <PageHeader description="Set a spending limit for a category and track usage against actual transactions." title="Create Budget" />
      <AddBudgetForm />
    </AppShell>
  );
}
