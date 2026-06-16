import { AppShell } from "@/components/app/app-shell";
import { PageHeader } from "@/components/app/page-header";
import { AddSavingsGoalForm } from "@/features/savings-goals/add-savings-goal-form";

export default function AddSavingsGoalPage() {
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
      <AddSavingsGoalForm />
    </AppShell>
  );
}
