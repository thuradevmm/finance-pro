import { notFound } from "next/navigation";

import { AppShell } from "@/components/app/app-shell";
import { PageHeader } from "@/components/app/page-header";
import { SimpleRecordEditPage } from "@/components/ui/simple-record-edit-page";
import { accounts } from "@/lib/accounts/mock-data";
import { savingsGoals } from "@/lib/savings-goals/mock-data";

export default async function EditSavingsGoalPage({ params }: { params: Promise<{ goalId: string }> }) {
  const { goalId } = await params;
  const goal = savingsGoals.find((item) => item.id === goalId);

  if (!goal) {
    notFound();
  }
  const savingsAccounts = accounts.filter((account) => account.status === "Active").map((account) => account.name);

  return (
    <AppShell
      activeNavLabel="Savings Goals"
      mobileSearchLabel="Search savings goals on mobile"
      mobileSearchPlaceholder="Search savings goals..."
      mobileSubtitle="Edit Goal"
      topSearchLabel="Search savings goals"
      topSearchPlaceholder="Search savings goals..."
    >
      <PageHeader description={`Update savings target for ${goal.name}.`} title="Edit Savings Goal" />
      <SimpleRecordEditPage
        cancelHref="/savings-goals"
        fields={[
          { key: "name", label: "Goal Name" },
          { key: "targetAmount", label: "Target Amount", type: "currency" },
          { key: "targetDate", label: "Target Date", type: "date" },
          { key: "monthlyContribution", label: "Monthly Contribution", type: "currency" },
          { key: "account", label: "Savings Account", options: savingsAccounts.length > 0 ? savingsAccounts : ["High-Yield Savings"] },
        ]}
        preview={{
          icon: goal.icon,
          iconClassName: `${goal.bg} ${goal.tone}`,
          label: "Goal Preview",
          metrics: [
            { label: "Target", key: "targetAmount" },
            { label: "Monthly", key: "monthlyContribution" },
            { label: "Target Date", key: "targetDate" },
          ],
          primaryKey: "name",
          secondaryKey: "account",
        }}
        record={goal as unknown as Record<string, string>}
        saveLabel="Save Goal"
      />
    </AppShell>
  );
}
