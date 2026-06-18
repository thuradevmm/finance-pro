import { notFound } from "next/navigation";

import { AppShell } from "@/components/app/app-shell";
import { PageHeader } from "@/components/app/page-header";
import { SimpleRecordEditPage } from "@/components/ui/simple-record-edit-page";
import { accounts } from "@/lib/accounts/mock-data";
import { getCategoriesForScope } from "@/lib/categories/category-scopes";
import { categories } from "@/lib/categories/mock-data";
import { subscriptions } from "@/lib/subscriptions/mock-data";
import type { BillingCycle, SubscriptionStatus } from "@/types/finance";

const billingCycles: BillingCycle[] = ["Weekly", "Monthly", "Yearly"];
const statuses: SubscriptionStatus[] = ["Active", "Paused", "Expiring"];

export default async function EditSubscriptionPage({ params }: { params: Promise<{ subscriptionId: string }> }) {
  const { subscriptionId } = await params;
  const subscription = subscriptions.find((item) => item.id === subscriptionId);

  if (!subscription) {
    notFound();
  }
  const categoryOptions = getCategoriesForScope(categories, "Subscriptions", "Expense").map((category) => category.name);
  const paymentAccountOptions = accounts.filter((account) => account.status === "Active").map((account) => account.name);

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
      <SimpleRecordEditPage
        cancelHref="/subscriptions"
        fields={[
          { key: "name", label: "Service Name" },
          { key: "amount", label: "Amount", type: "currency" },
          { key: "billingCycle", label: "Billing Cycle", options: billingCycles },
          { key: "category", label: "Category", options: categoryOptions.length > 0 ? categoryOptions : ["Software Tools"] },
          { key: "paymentAccount", label: "Payment Account", options: paymentAccountOptions.length > 0 ? paymentAccountOptions : ["Main Checking"] },
          { key: "nextBillingDate", label: "Next Billing Date", type: "date" },
          { key: "status", label: "Status", options: statuses },
        ]}
        preview={{
          icon: subscription.icon,
          iconClassName: `${subscription.bg} ${subscription.tone}`,
          label: "Subscription Preview",
          metrics: [
            { label: "Amount", key: "amount" },
            { label: "Cycle", key: "billingCycle" },
            { label: "Status", key: "status" },
          ],
          primaryKey: "name",
          secondaryKey: "paymentAccount",
        }}
        record={subscription as unknown as Record<string, string>}
        saveLabel="Save Subscription"
      />
    </AppShell>
  );
}
