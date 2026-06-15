import { AppShell } from "@/components/app/app-shell";
import { PageHeader } from "@/components/app/page-header";
import { AddTransactionForm } from "@/features/transactions/add-transaction-form";

export default function AddTransactionPage() {
  return (
    <AppShell
      activeNavLabel="Transactions"
      mobileSearchLabel="Search transactions on mobile"
      mobileSearchPlaceholder="Search transactions..."
      mobileSubtitle="Add Transaction"
      topSearchLabel="Search transactions"
      topSearchPlaceholder="Search transactions..."
    >
      <PageHeader description="Record a new financial activity." title="Add Transaction" />
      <AddTransactionForm />
    </AppShell>
  );
}
