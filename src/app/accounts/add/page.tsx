import { AppShell } from "@/components/app/app-shell";
import { PageHeader } from "@/components/app/page-header";
import { AddAccountForm } from "@/features/accounts/add-account-form";

export default function AddAccountPage() {
  return (
    <AppShell
      activeNavLabel="Accounts"
      mobileSearchLabel="Search accounts on mobile"
      mobileSearchPlaceholder="Search accounts..."
      mobileSubtitle="Add Account"
      topSearchLabel="Search accounts"
      topSearchPlaceholder="Search accounts..."
    >
      <PageHeader description="Create a bank account, wallet, credit card, or cash account." title="Add Account" />
      <AddAccountForm />
    </AppShell>
  );
}
