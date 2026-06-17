"use client";

import { useState } from "react";

import { Icon } from "@/components/ui/icon";
import { RecordActions } from "@/components/ui/record-actions";
import type { SubscriptionRecord, SubscriptionStatus, UpcomingSubscriptionBilling } from "@/types/finance";

const statusStyles: Record<SubscriptionStatus, string> = {
  Active: "bg-[#ecfdf5] text-[#166534]",
  Paused: "bg-[#f8f9ff] text-[#45464d]",
  Expiring: "bg-[#ffdad6] text-[#93000a]",
};

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
            <p className={`pl-2 text-xs font-bold ${billing.isNext ? "text-[#0058be]" : "text-[#45464d]"}`}>{billing.dateLabel}</p>
            <div className="flex items-center gap-3 pl-2">
              <span className="grid size-10 shrink-0 place-items-center rounded-full bg-[#eff4ff] text-[#45464d]">
                <Icon className="size-5" name={billing.icon} />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-[#0b1c30]">{billing.name}</p>
                <p className="mt-1 text-xs font-medium text-[#45464d]">{billing.billingCycle}</p>
              </div>
              <p className="text-lg font-semibold text-[#0b1c30]">{billing.amount}</p>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

function SubscriptionsTable({ onDelete, subscriptions }: { onDelete: (id: string) => void; subscriptions: SubscriptionRecord[] }) {
  return (
    <section>
      <h2 className="mb-3 text-xl font-semibold text-[#0b1c30]">All Subscriptions</h2>
      <div className="overflow-hidden rounded-lg border border-[#c6c6cd]/70 bg-white shadow-[0_4px_20px_rgba(15,23,42,0.04)]">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1000px] border-collapse text-left">
            <thead>
              <tr className="border-b border-[#c6c6cd]/60 bg-[#eff4ff] text-xs font-semibold text-[#45464d]">
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3 text-right">Amount</th>
                <th className="px-4 py-3">Billing Cycle</th>
                <th className="px-4 py-3">Category</th>
                <th className="px-4 py-3">Payment Account</th>
                <th className="px-4 py-3">Next Billing</th>
                <th className="px-4 py-3">Status</th>
                <th className="w-24 px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#c6c6cd]/40 text-sm">
              {subscriptions.map((subscription) => (
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
                  <td className="whitespace-nowrap px-4 py-4 text-[#45464d]">{subscription.billingCycle}</td>
                  <td className="whitespace-nowrap px-4 py-4 text-[#45464d]">{subscription.category}</td>
                  <td className="whitespace-nowrap px-4 py-4 text-[#0b1c30]">{subscription.paymentAccount}</td>
                  <td className="whitespace-nowrap px-4 py-4 text-[#45464d]">{subscription.nextBillingDate}</td>
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
  const [visibleSubscriptions, setVisibleSubscriptions] = useState(subscriptions);

  return (
    <>
      <BillingTimeline billings={billings} />
      <SubscriptionsTable
        onDelete={(id) => setVisibleSubscriptions((items) => items.filter((item) => item.id !== id))}
        subscriptions={visibleSubscriptions}
      />
    </>
  );
}
