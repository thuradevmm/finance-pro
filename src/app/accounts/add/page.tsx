import { AppShell } from "@/components/app/app-shell";
import { PageHeader } from "@/components/app/page-header";
import { AddAccountForm } from "@/features/accounts/add-account-form";
import { getCategories } from "@/lib/categories/supabase";

export default async function AddAccountPage({
  searchParams,
}: {
  searchParams: Promise<{ returnTo?: string | string[] }>;
}) {
  const resolvedSearchParams = await searchParams;
  const returnToParam = Array.isArray(resolvedSearchParams.returnTo) ? resolvedSearchParams.returnTo[0] : resolvedSearchParams.returnTo;
  const returnTo = returnToParam?.startsWith("/accounts") ? returnToParam : "/accounts";
  const categories = await getCategories();

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
      <AddAccountForm categories={categories} returnTo={returnTo} />
    </AppShell>
  );
}
