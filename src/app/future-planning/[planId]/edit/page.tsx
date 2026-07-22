import { notFound } from "next/navigation";

import { AppShell } from "@/components/app/app-shell";
import { PageHeader } from "@/components/app/page-header";
import { FutureTransactionForm } from "@/features/future-planning/future-transaction-form";
import { getAccounts } from "@/lib/accounts/supabase";
import { getCategories } from "@/lib/categories/supabase";
import { getFuturePlanLinkOptions } from "@/lib/future-planning/link-options";
import { getFutureTransaction } from "@/lib/future-planning/supabase";
import { getUserSafely } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/server";

export default async function EditFutureTransactionPage({ params }: { params: Promise<{ planId: string }> }) {
  const { planId } = await params;
  const supabase = await createClient();
  const { user } = await getUserSafely(supabase);
  if (!user) notFound();

  const [accounts, categories] = await Promise.all([
    getAccounts(supabase, user.id),
    getCategories(),
  ]);
  const [transaction, linkOptions] = await Promise.all([
    getFutureTransaction(supabase, user.id, planId, accounts, categories),
    getFuturePlanLinkOptions(supabase, user.id, accounts, categories),
  ]);
  if (!transaction) notFound();

  return (
    <AppShell
      activeNavLabel="Future Planning"
      mobileSubtitle="Edit Future Plan"
      topSearchLabel="Search future plans"
      topSearchPlaceholder="Search plans..."
    >
      <PageHeader description={`Update the scheduled ${transaction.type.toLowerCase()} for ${transaction.title}.`} title="Edit Planned Transaction" />
      <FutureTransactionForm accounts={accounts} categories={categories} defaultDate={transaction.dateValue} linkOptions={linkOptions} transaction={transaction} />
    </AppShell>
  );
}
