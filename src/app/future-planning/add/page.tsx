import { AppShell } from "@/components/app/app-shell";
import { PageHeader } from "@/components/app/page-header";
import { FutureTransactionForm } from "@/features/future-planning/future-transaction-form";
import { getAccounts } from "@/lib/accounts/supabase";
import { getCategories } from "@/lib/categories/supabase";
import { getUserSafely } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/server";

function localDateValue(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export default async function AddFutureTransactionPage() {
  const supabase = await createClient();
  const { user } = await getUserSafely(supabase);
  const [accounts, categories] = user
    ? await Promise.all([getAccounts(supabase, user.id), getCategories()])
    : [[], []];

  return (
    <AppShell
      activeNavLabel="Future Planning"
      mobileSubtitle="Add Future Plan"
      topSearchLabel="Search future plans"
      topSearchPlaceholder="Search plans..."
    >
      <PageHeader description="Schedule expected income or expenses. Repeating plans create independent occurrences you can adjust later." title="Add Planned Transaction" />
      <FutureTransactionForm accounts={accounts} categories={categories} defaultDate={localDateValue(new Date())} />
    </AppShell>
  );
}
