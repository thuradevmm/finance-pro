import { AppShell } from "@/components/app/app-shell";
import { PageHeader } from "@/components/app/page-header";
import { AddSubscriptionForm } from "@/features/subscriptions/add-subscription-form";

export default function AddSubscriptionPage() {
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
      <AddSubscriptionForm />
    </AppShell>
  );
}
