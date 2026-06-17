import { AppShell } from "@/components/app/app-shell";
import { PageHeader } from "@/components/app/page-header";
import { TransactionEditPageContent } from "@/features/transactions/transaction-edit-page-content";
import { transactionFilterOptions, transactions } from "@/lib/transactions/mock-data";

export default async function EditTransactionPage({ params }: PageProps<"/transactions/[transactionId]/edit">) {
  const { transactionId } = await params;
  const transaction = transactions.find((item) => item.id === transactionId) ?? transactions[0];

  return (
    <AppShell
      activeNavLabel="Transactions"
      mobileSearchLabel="Search transactions on mobile"
      mobileSearchPlaceholder="Search transactions..."
      mobileSubtitle="Edit Transaction"
      topSearchLabel="Search transactions"
      topSearchPlaceholder="Search transactions..."
    >
      <PageHeader description={`Update transaction details for ${transaction.id}.`} title="Edit Transaction" />
      <TransactionEditPageContent filterOptions={transactionFilterOptions} transaction={transaction} />
    </AppShell>
  );
}
