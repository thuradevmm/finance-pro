"use client";

import { useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";

import { deleteSubscription } from "@/app/subscriptions/actions";
import { Icon } from "@/components/ui/icon";
import { RecordActions } from "@/components/ui/record-actions";
import { compareSortValues, SortHeader, type SortDirection } from "@/components/ui/sort-header";
import { useToast } from "@/components/ui/toast-provider";
import { dateTimeSortValue } from "@/lib/date-format";
import type { SubscriptionRecord, SubscriptionStatus, UpcomingSubscriptionBilling } from "@/types/finance";

const statusStyles: Record<SubscriptionStatus, string> = {
  Active: "bg-[#ecfdf5] text-[#166534]",
  Paused: "bg-[#f8f9ff] text-[#45464d]",
  Expiring: "bg-[#ffdad6] text-[#93000a]",
};
type SubscriptionSortKey = "amount" | "billedAmount" | "billingCycle" | "category" | "exchangeRate" | "name" | "nextBillingDate" | "paymentAccount" | "reminder" | "status";

function parseCurrency(value: string) {
  return Number(value.replace(/[^0-9.-]/g, "")) || 0;
}

function ReminderStatusBadge({ status }: { status: string }) {
  const urgent = status === "Overdue" || status === "Due today" || status.startsWith("Due in");

  return (
    <span className={`inline-flex whitespace-nowrap rounded px-2 py-1 text-xs font-bold uppercase ${urgent ? "bg-[#fff1f0] text-[#991b1b]" : status === "Off" ? "bg-[#f3f4f6] text-[#45464d]" : "bg-[#eef2ff] text-[#3730a3]"}`}>
      {status}
    </span>
  );
}

function ReminderPanel({ subscriptions }: { subscriptions: SubscriptionRecord[] }) {
  const reminderItems = subscriptions.filter((subscription) => subscription.reminderStatus === "Overdue" || subscription.reminderStatus === "Due today" || subscription.reminderStatus.startsWith("Due in")).slice(0, 4);

  return (
    <section className="mb-6 rounded-lg border border-[#c6c6cd]/70 bg-white p-5 shadow-[0_4px_20px_rgba(15,23,42,0.04)]">
      <div className="mb-4 flex items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold text-[#0b1c30]">Subscription Reminders</h2>
          <p className="mt-1 text-sm font-medium text-[#45464d]">{reminderItems.length ? "Renewals that need attention based on reminder settings." : "No subscriptions are inside the active reminder window."}</p>
        </div>
        <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-[#eef2ff] text-[#4f46e5]">
          <Icon name="bell" />
        </span>
      </div>
      {reminderItems.length ? (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {reminderItems.map((subscription) => (
            <article className="rounded-md border border-[#fecaca] bg-[#fffafa] p-4" key={subscription.id}>
              <div className="mb-3 flex items-center justify-between gap-3">
                <p className="truncate text-sm font-semibold text-[#0b1c30]">{subscription.name}</p>
                <ReminderStatusBadge status={subscription.reminderStatus} />
              </div>
              <p className="text-xs font-bold uppercase text-[#45464d]">Next billing</p>
              <p className="mt-1 text-sm font-semibold text-[#0b1c30]">{subscription.nextBillingDate}</p>
              <p className="mt-3 amount-value text-sm font-bold text-[#0b1c30]">{subscription.amount}</p>
              <p className="mt-1 text-xs font-semibold text-[#45464d]">{subscription.billedAmount}</p>
            </article>
          ))}
        </div>
      ) : null}
    </section>
  );
}

function BillingTimeline({ billings }: { billings: UpcomingSubscriptionBilling[] }) {
  return (
    <section className="mb-6">
      <h2 className="mb-3 text-xl font-semibold text-[#0b1c30]">Upcoming Billing Timeline</h2>
      <div className="flex gap-4 overflow-x-auto pb-3">
        {billings.map((billing) => (
          <article
            className="relative flex w-72 shrink-0 flex-col gap-4 rounded-lg border border-[#c6c6cd]/70 bg-white p-4 shadow-[0_4px_20px_rgba(15,23,42,0.04)]"
            key={billing.id}
          >
            <div className={`absolute bottom-0 left-0 top-0 w-1 rounded-l-lg ${billing.isNext ? "bg-[#0058be]" : "bg-[#c6c6cd]"}`} />
            <div className="flex items-center justify-between gap-3 pl-2">
              <p className={`text-xs font-bold ${billing.isNext ? "text-[#0058be]" : "text-[#45464d]"}`}>{billing.dateLabel}</p>
              {billing.reminderDue ? <span className="rounded bg-[#fff1f0] px-2 py-1 text-[11px] font-bold uppercase text-[#991b1b]">Reminder</span> : null}
            </div>
            <div className="flex items-center gap-3 pl-2">
              <span className="grid size-10 shrink-0 place-items-center rounded-full bg-[#eff4ff] text-[#45464d]">
                <Icon className="size-5" name={billing.icon} />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-[#0b1c30]">{billing.name}</p>
                <p className="mt-1 text-xs font-medium text-[#45464d]">{billing.billingCycle} · {billing.reminderLabel}</p>
                <p className="mt-1 truncate text-xs font-semibold text-[#0058be]">{billing.billedAmount}</p>
              </div>
              <p className="amount-value text-lg font-semibold text-[#0b1c30]">{billing.amount}</p>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

function SubscriptionsTable({ onDelete, subscriptions }: { onDelete: (id: string) => void | Promise<void>; subscriptions: SubscriptionRecord[] }) {
  const [sortKey, setSortKey] = useState<SubscriptionSortKey>("nextBillingDate");
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");
  const sortedSubscriptions = useMemo(() => {
    function value(subscription: SubscriptionRecord) {
      if (sortKey === "amount") return parseCurrency(subscription.amount);
      if (sortKey === "billedAmount") return parseCurrency(subscription.billedAmount);
      if (sortKey === "exchangeRate") return parseCurrency(subscription.exchangeRateLabel);
      if (sortKey === "nextBillingDate") return dateTimeSortValue(subscription.nextBillingDateTimeValue ?? subscription.nextBillingDate);
      if (sortKey === "reminder") return subscription.reminderStatus.toLowerCase();
      return String(subscription[sortKey]).toLowerCase();
    }
    return [...subscriptions].sort((first, second) => compareSortValues(value(first), value(second), sortDirection));
  }, [sortDirection, sortKey, subscriptions]);

  function handleSort(key: SubscriptionSortKey) {
    setSortKey((currentKey) => {
      if (currentKey === key) {
        setSortDirection((direction) => (direction === "asc" ? "desc" : "asc"));
        return currentKey;
      }
      setSortDirection(key === "amount" || key === "billedAmount" || key === "exchangeRate" ? "desc" : "asc");
      return key;
    });
  }

  return (
    <section>
      <h2 className="mb-3 text-xl font-semibold text-[#0b1c30]">All Subscriptions</h2>
      <div className="overflow-hidden rounded-lg border border-[#c6c6cd]/70 bg-white shadow-[0_4px_20px_rgba(15,23,42,0.04)]">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1280px] border-collapse text-left">
            <thead>
              <tr className="border-b border-[#c6c6cd]/60 bg-[#eff4ff] text-xs font-semibold text-[#45464d]">
                <th className="px-4 py-3"><SortHeader onSort={() => handleSort("name")} sortDirection={sortKey === "name" ? sortDirection : undefined}>Name</SortHeader></th>
                <th className="px-4 py-3 text-right"><SortHeader align="right" onSort={() => handleSort("amount")} sortDirection={sortKey === "amount" ? sortDirection : undefined}>MMK Amount</SortHeader></th>
                <th className="px-4 py-3"><SortHeader onSort={() => handleSort("billedAmount")} sortDirection={sortKey === "billedAmount" ? sortDirection : undefined}>Billed Amount</SortHeader></th>
                <th className="px-4 py-3"><SortHeader onSort={() => handleSort("exchangeRate")} sortDirection={sortKey === "exchangeRate" ? sortDirection : undefined}>Exchange Rate</SortHeader></th>
                <th className="px-4 py-3"><SortHeader onSort={() => handleSort("billingCycle")} sortDirection={sortKey === "billingCycle" ? sortDirection : undefined}>Billing Cycle</SortHeader></th>
                <th className="px-4 py-3"><SortHeader onSort={() => handleSort("category")} sortDirection={sortKey === "category" ? sortDirection : undefined}>Category</SortHeader></th>
                <th className="px-4 py-3"><SortHeader onSort={() => handleSort("paymentAccount")} sortDirection={sortKey === "paymentAccount" ? sortDirection : undefined}>Payment Account</SortHeader></th>
                <th className="px-4 py-3"><SortHeader onSort={() => handleSort("nextBillingDate")} sortDirection={sortKey === "nextBillingDate" ? sortDirection : undefined}>Next Billing</SortHeader></th>
                <th className="px-4 py-3"><SortHeader onSort={() => handleSort("reminder")} sortDirection={sortKey === "reminder" ? sortDirection : undefined}>Reminder</SortHeader></th>
                <th className="px-4 py-3"><SortHeader onSort={() => handleSort("status")} sortDirection={sortKey === "status" ? sortDirection : undefined}>Status</SortHeader></th>
                <th className="w-24 px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#c6c6cd]/40 text-sm">
              {sortedSubscriptions.map((subscription) => (
                <tr className="transition hover:bg-[#f8f9ff]" key={subscription.id}>
                  <td className="px-4 py-4">
                    <div className="flex items-center gap-3">
                      <span className={`grid size-9 place-items-center rounded-md ${subscription.bg} ${subscription.tone}`}>
                        <Icon className="size-4" name={subscription.icon} />
                      </span>
                      <span className="font-semibold text-[#0b1c30]">{subscription.name}</span>
                    </div>
                  </td>
                  <td className="whitespace-nowrap px-4 py-4 text-right font-semibold text-[#0b1c30]">{subscription.amount}</td>
                  <td className="whitespace-nowrap px-4 py-4 font-semibold text-[#0058be]">{subscription.billedAmount}</td>
                  <td className="whitespace-nowrap px-4 py-4 text-[#45464d]">{subscription.exchangeRateLabel}</td>
                  <td className="whitespace-nowrap px-4 py-4 text-[#45464d]">{subscription.billingCycle}</td>
                  <td className="whitespace-nowrap px-4 py-4 text-[#45464d]">{subscription.category}</td>
                  <td className="whitespace-nowrap px-4 py-4 text-[#0b1c30]">{subscription.paymentAccount}</td>
                  <td className="whitespace-nowrap px-4 py-4 text-[#45464d]">{subscription.nextBillingDate}</td>
                  <td className="px-4 py-4"><ReminderStatusBadge status={subscription.reminderStatus} /></td>
                  <td className="px-4 py-4">
                    <span className={`inline-flex rounded px-2 py-1 text-xs font-bold uppercase ${statusStyles[subscription.status]}`}>
                      {subscription.status}
                    </span>
                  </td>
                  <td className="px-4 py-4">
                    <div className="flex justify-end gap-1">
                      <RecordActions
                        editHref={`/subscriptions/${subscription.id}/edit`}
                        itemId={subscription.id}
                        itemLabel={subscription.name}
                        onDelete={onDelete}
                        deleteDescription={`Deleting ${subscription.name} will remove this subscription from your list.`}
                      />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}

export function SubscriptionsPageContent({
  billings,
  subscriptions,
}: {
  billings: UpcomingSubscriptionBilling[];
  subscriptions: SubscriptionRecord[];
}) {
  const { showError, showSuccess } = useToast();
  const searchParams = useSearchParams();
  const [visibleSubscriptions, setVisibleSubscriptions] = useState(subscriptions);
  const [isPending, setIsPending] = useState(false);
  const search = searchParams.get("q") ?? "";
  const filteredSubscriptions = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();
    return visibleSubscriptions.filter((subscription) => {
      const searchable = `${subscription.name} ${subscription.amount} ${subscription.billedAmount} ${subscription.exchangeRateLabel} ${subscription.billingCycle} ${subscription.category} ${subscription.paymentAccount} ${subscription.nextBillingDate} ${subscription.reminderStatus} ${subscription.status}`.toLowerCase();
      return normalizedSearch === "" || searchable.includes(normalizedSearch);
    });
  }, [search, visibleSubscriptions]);

  async function handleDelete(subscriptionId: string) {
    setIsPending(true);
    const result = await deleteSubscription(subscriptionId);
    setIsPending(false);
    if (result.error) {
      showError(result.error);
      return;
    }
    setVisibleSubscriptions((items) => items.filter((item) => item.id !== subscriptionId));
    showSuccess("Subscription deleted successfully.");
  }

  return (
    <>
      {isPending ? <p className="mb-4 text-sm font-medium text-[#45464d]">Updating subscriptions…</p> : null}
      <ReminderPanel subscriptions={filteredSubscriptions} />
      <BillingTimeline billings={billings} />
      <SubscriptionsTable
        onDelete={handleDelete}
        subscriptions={filteredSubscriptions}
      />
    </>
  );
}
