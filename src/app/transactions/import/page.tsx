import { AppShell } from "@/components/app/app-shell";
import { PageHeader } from "@/components/app/page-header";
import { ImportTransactionsForm } from "@/features/transactions/import-transactions-form";
import { getAccounts } from "@/lib/accounts/supabase";
import { getCategories } from "@/lib/categories/supabase";
import { getUserSafely } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/server";

export default async function ImportTransactionsPage() {
  const supabase = await createClient();
  const { user } = await getUserSafely(supabase);
  const [accounts, categories] = user
    ? await Promise.all([getAccounts(supabase, user.id), getCategories()])
    : [[], []];
  return (
    <AppShell activeNavLabel="Transactions" mobileSubtitle="Import Transactions">
      <PageHeader description="Import CSV records or synchronize external transactions with permanent idempotency keys." title="Import & Sync Transactions" />
      <ImportTransactionsForm accounts={accounts} categories={categories} />
    </AppShell>
  );
}
