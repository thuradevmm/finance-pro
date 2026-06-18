import { AppShell } from "@/components/app/app-shell";
import { PageHeader } from "@/components/app/page-header";
import { TransactionEditPageContent } from "@/features/transactions/transaction-edit-page-content";
import { transactionFilterOptions } from "@/lib/transactions/mock-data";

export default async function EditTransactionPage({ params }: PageProps<"/transactions/[transactionId]/edit">) {
  const { transactionId } = await params;

  return (
    <AppShell
      activeNavLabel="Transactions"
      mobileSearchLabel="Search transactions on mobile"
      mobileSearchPlaceholder="Search transactions..."
      mobileSubtitle="Edit Transaction"
      topSearchLabel="Search transactions"
      topSearchPlaceholder="Search transactions..."
    >
      <PageHeader description="Update transaction details and linked financial impacts." title="Edit Transaction" />
      <TransactionEditPageContent filterOptions={transactionFilterOptions} transactionId={transactionId} />
    </AppShell>
  );
}
