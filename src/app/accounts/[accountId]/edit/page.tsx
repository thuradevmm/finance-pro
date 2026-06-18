import { notFound } from "next/navigation";

import { AppShell } from "@/components/app/app-shell";
import { PageHeader } from "@/components/app/page-header";
import { SimpleRecordEditPage } from "@/components/ui/simple-record-edit-page";
import { accounts } from "@/lib/accounts/mock-data";
import type { AccountStatus, AccountType } from "@/types/finance";

const accountTypes: AccountType[] = ["Bank Account", "Credit Card", "Cash Wallet", "Digital Wallet", "Savings"];
const statuses: AccountStatus[] = ["Active", "Needs Review", "Archived"];

export default async function EditAccountPage({ params }: { params: Promise<{ accountId: string }> }) {
  const { accountId } = await params;
  const account = accounts.find((item) => item.id === accountId);

  if (!account) {
    notFound();
  }

  return (
    <AppShell
      activeNavLabel="Accounts"
      mobileSearchLabel="Search accounts on mobile"
      mobileSearchPlaceholder="Search accounts..."
      mobileSubtitle="Edit Account"
      topSearchLabel="Search accounts"
      topSearchPlaceholder="Search accounts..."
    >
      <PageHeader description={`Update account details for ${account.name}.`} title="Edit Account" />
      <SimpleRecordEditPage
        cancelHref="/accounts"
        fields={[
          { key: "name", label: "Account Name" },
          { key: "type", label: "Account Type", options: accountTypes },
          { key: "institution", label: "Institution" },
          { key: "balance", label: "Current Balance", type: "currency" },
          { key: "availableBalance", label: "Available Balance", type: "currency" },
          { key: "currency", label: "Currency", options: ["USD", "MMK", "THB", "SGD", "EUR"] },
          { key: "status", label: "Status", options: statuses },
          { key: "lastUpdated", label: "Last Updated", type: "date" },
        ]}
        preview={{
          icon: account.icon,
          iconClassName: `${account.bg} ${account.tone}`,
          label: "Account Preview",
          metrics: [
            { label: "Balance", key: "balance" },
            { label: "Available", key: "availableBalance" },
            { label: "Status", key: "status" },
          ],
          primaryKey: "name",
          secondaryKey: "institution",
        }}
        record={account as unknown as Record<string, string>}
        saveLabel="Save Account"
      />
    </AppShell>
  );
}
