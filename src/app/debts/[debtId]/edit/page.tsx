import { notFound } from "next/navigation";

import { AppShell } from "@/components/app/app-shell";
import { PageHeader } from "@/components/app/page-header";
import { SimpleRecordEditPage } from "@/components/ui/simple-record-edit-page";
import { debts } from "@/lib/debts/mock-data";

export default async function EditDebtPage({ params }: { params: Promise<{ debtId: string }> }) {
  const { debtId } = await params;
  const debt = debts.find((item) => item.id === debtId);

  if (!debt) {
    notFound();
  }

  return (
    <AppShell activeNavLabel="Debts" mobileSearchLabel="Search debts on mobile" mobileSearchPlaceholder="Search debts..." mobileSubtitle="Edit Debt" topSearchLabel="Search debts" topSearchPlaceholder="Search debts...">
      <PageHeader description={`Update debt record for ${debt.name}.`} title="Edit Debt" />
      <SimpleRecordEditPage
        cancelHref="/debts"
        fields={[
          { key: "name", label: "Debt Name" },
          { key: "lender", label: "Lender" },
          { key: "totalAmount", label: "Total Amount", type: "currency" },
          { key: "monthlyPayment", label: "Monthly Payment", type: "currency" },
          { key: "interestRate", label: "Interest Rate", type: "percent" },
          { key: "nextPaymentDate", label: "Next Payment Date", type: "date" },
        ]}
        preview={{
          icon: debt.icon,
          iconClassName: `${debt.bg} ${debt.tone}`,
          label: "Debt Preview",
          metrics: [
            { label: "Total", key: "totalAmount" },
            { label: "Monthly", key: "monthlyPayment" },
            { label: "Interest", key: "interestRate" },
          ],
          primaryKey: "name",
          secondaryKey: "lender",
        }}
        record={debt as unknown as Record<string, string>}
        saveLabel="Save Debt"
      />
    </AppShell>
  );
}
