import { AppShell } from "@/components/app/app-shell";
import { PageHeader } from "@/components/app/page-header";
import { AddDebtForm } from "@/features/debts/add-debt-form";

export default function AddDebtPage() {
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
      <AddDebtForm />
    </AppShell>
  );
}
