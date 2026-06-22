import { notFound } from "next/navigation";

import { AppShell } from "@/components/app/app-shell";
import { PageHeader } from "@/components/app/page-header";
import { AddAccountForm } from "@/features/accounts/add-account-form";
import { getAccount } from "@/lib/accounts/supabase";
import { createClient } from "@/lib/supabase/server";
import { getUserSafely } from "@/lib/supabase/auth";

export default async function EditAccountPage({ params }: { params: Promise<{ accountId: string }> }) {
  const { accountId } = await params;
  const supabase = await createClient();
  const { user } = await getUserSafely(supabase);
  if (!user) notFound();
  const account = await getAccount(supabase, user.id, accountId);

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
      <AddAccountForm account={account} />
    </AppShell>
  );
}
