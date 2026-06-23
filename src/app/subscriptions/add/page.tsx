import { AppShell } from "@/components/app/app-shell";
import { PageHeader } from "@/components/app/page-header";
import { AddSubscriptionForm } from "@/features/subscriptions/add-subscription-form";
import { getAccounts } from "@/lib/accounts/supabase";
import { getCategories } from "@/lib/categories/supabase";
import { getUserSafely } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/server";

export default async function AddSubscriptionPage() {
  const supabase = await createClient();
  const { user } = await getUserSafely(supabase);
  const accounts = user ? await getAccounts(supabase, user.id) : [];
  const categories = user ? await getCategories() : [];

  return (
    <AppShell
      activeNavLabel="Subscriptions"
      mobileSearchLabel="Search subscriptions on mobile"
      mobileSearchPlaceholder="Search subscriptions..."
      mobileSubtitle="Add Subscription"
      topSearchLabel="Search subscriptions"
      topSearchPlaceholder="Search subscriptions..."
    >
      <PageHeader description="Record a recurring payment, billing cycle, category, and reminder preference." title="Add Subscription" />
      <AddSubscriptionForm accounts={accounts} categories={categories} />
    </AppShell>
  );
}
