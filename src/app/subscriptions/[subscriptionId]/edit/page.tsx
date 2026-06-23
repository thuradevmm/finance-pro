import { notFound } from "next/navigation";

import { AppShell } from "@/components/app/app-shell";
import { PageHeader } from "@/components/app/page-header";
import { AddSubscriptionForm } from "@/features/subscriptions/add-subscription-form";
import { getAccounts } from "@/lib/accounts/supabase";
import { getCategories } from "@/lib/categories/supabase";
import { getSubscription } from "@/lib/subscriptions/supabase";
import { getUserSafely } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/server";

export default async function EditSubscriptionPage({ params }: { params: Promise<{ subscriptionId: string }> }) {
  const { subscriptionId } = await params;
  const supabase = await createClient();
  const { user } = await getUserSafely(supabase);
  if (!user) notFound();
  const accounts = await getAccounts(supabase, user.id);
  const categories = await getCategories();
  const subscription = await getSubscription(supabase, user.id, subscriptionId, accounts, categories);

  if (!subscription) {
    notFound();
  }
  return (
    <AppShell
      activeNavLabel="Subscriptions"
      mobileSearchLabel="Search subscriptions on mobile"
      mobileSearchPlaceholder="Search subscriptions..."
      mobileSubtitle="Edit Subscription"
      topSearchLabel="Search subscriptions"
      topSearchPlaceholder="Search subscriptions..."
    >
      <PageHeader description={`Update recurring payment for ${subscription.name}.`} title="Edit Subscription" />
      <AddSubscriptionForm accounts={accounts} categories={categories} subscription={subscription} />
    </AppShell>
  );
}
