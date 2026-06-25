import { notFound } from "next/navigation";

import { AppShell } from "@/components/app/app-shell";
import { PageHeader } from "@/components/app/page-header";
import { AddAccountForm } from "@/features/accounts/add-account-form";
import { getAccount } from "@/lib/accounts/supabase";
import { getCategories } from "@/lib/categories/supabase";
import { createClient } from "@/lib/supabase/server";
import { getUserSafely } from "@/lib/supabase/auth";

export default async function EditAccountPage({
  params,
  searchParams,
}: {
  params: Promise<{ accountId: string }>;
  searchParams: Promise<{ returnTo?: string | string[] }>;
}) {
  const { accountId } = await params;
  const resolvedSearchParams = await searchParams;
  const returnToParam = Array.isArray(resolvedSearchParams.returnTo) ? resolvedSearchParams.returnTo[0] : resolvedSearchParams.returnTo;
  const returnTo = returnToParam?.startsWith("/accounts") ? returnToParam : "/accounts";
  const supabase = await createClient();
  const { user } = await getUserSafely(supabase);
  if (!user) notFound();
  const [account, categories] = await Promise.all([
    getAccount(supabase, user.id, accountId),
    getCategories(),
  ]);

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
      <AddAccountForm account={account} categories={categories} returnTo={returnTo} />
    </AppShell>
  );
}
