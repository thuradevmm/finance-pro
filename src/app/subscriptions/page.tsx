import Link from "next/link";

import { AppShell } from "@/components/app/app-shell";
import { PageHeader } from "@/components/app/page-header";
import { SummaryCards } from "@/components/app/summary-cards";
import { Icon } from "@/components/ui/icon";
import { SubscriptionsPageContent } from "@/features/subscriptions/subscriptions-page-content";
import { getAccounts } from "@/lib/accounts/supabase";
import { getCategories } from "@/lib/categories/supabase";
import { getSubscriptions, getSubscriptionSummaries, getUpcomingSubscriptionBillings } from "@/lib/subscriptions/supabase";
import { getUserSafely } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/server";

export default async function SubscriptionsPage() {
  const supabase = await createClient();
  const { user } = await getUserSafely(supabase);
  const accounts = user ? await getAccounts(supabase, user.id, { limit: 200 }) : [];
  const categories = user ? await getCategories({ limit: 200 }) : [];
  const subscriptions = user ? await getSubscriptions(supabase, user.id, accounts, categories, { limit: 200 }) : [];
  const billings = getUpcomingSubscriptionBillings(subscriptions);
  const summaries = getSubscriptionSummaries(subscriptions);

  return (
    <AppShell
      activeNavLabel="Subscriptions"
      mobileAction={{ label: "Add subscription", icon: "plus", href: "/subscriptions/add", title: "Add subscription" }}
      mobileSearchLabel="Search subscriptions on mobile"
      mobileSearchPlaceholder="Search subscriptions..."
      mobileSubtitle="Subscriptions"
      topSearchLabel="Search subscriptions"
      topSearchPlaceholder="Search subscriptions..."
    >
      <PageHeader
        actions={
          <Link
            className="inline-flex h-10 items-center gap-2 rounded-md bg-[#0b1c30] px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-[#1f2937]"
            href="/subscriptions/add"
          >
            <Icon className="size-4" name="plus" />
            Add Subscription
          </Link>
        }
        description="Manage recurring payments and upcoming billing commitments."
        title="Subscriptions"
      />

      <SummaryCards summaries={summaries} />
      <SubscriptionsPageContent billings={billings} subscriptions={subscriptions} />
    </AppShell>
  );
}
