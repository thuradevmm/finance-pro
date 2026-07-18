"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";

import { deleteSubscription } from "@/app/subscriptions/actions";
import { Icon } from "@/components/ui/icon";
import { RecordActions } from "@/components/ui/record-actions";
import { compareSortValues, SortHeader, type SortDirection } from "@/components/ui/sort-header";
import { useToast } from "@/components/ui/toast-provider";
import { dateTimeSortValue } from "@/lib/date-format";
import type { SubscriptionPaymentStatus, SubscriptionRecord, SubscriptionStatus, UpcomingSubscriptionBilling } from "@/types/finance";

const statusStyles: Record<SubscriptionStatus, string> = {
  Active: "bg-[#ecfdf5] text-[#166534]",
  Paused: "bg-[#f8f9ff] text-[#45464d]",
  Expiring: "bg-[#ffdad6] text-[#93000a]",
};

const paymentStatusStyles: Record<SubscriptionPaymentStatus, string> = {
  "Due soon": "bg-[#fff7ed] text-[#9a3412]",
  "No schedule": "bg-[#f3f4f6] text-[#45464d]",
  Overdue: "bg-[#fff1f0] text-[#991b1b]",
  Paid: "bg-[#ecfdf5] text-[#166534]",
  Paused: "bg-[#f8f9ff] text-[#45464d]",
  Upcoming: "bg-[#eff4ff] text-[#0058be]",
};

type SubscriptionSortKey = "amount" | "billedAmount" | "billingCycle" | "category" | "exchangeRate" | "lastPaidDate" | "name" | "nextBillingDate" | "paymentAccount" | "paymentStatus" | "reminder" | "status";

const subscriptionSortOptions: { label: string; value: SubscriptionSortKey }[] = [
  { label: "Name", value: "name" },
  { label: "MMK Amount", value: "amount" },
  { label: "Billed Amount", value: "billedAmount" },
  { label: "Exchange Rate", value: "exchangeRate" },
  { label: "Billing Cycle", value: "billingCycle" },
  { label: "Category", value: "category" },
  { label: "Payment Account", value: "paymentAccount" },
  { label: "Next Billing", value: "nextBillingDate" },
  { label: "Payment", value: "paymentStatus" },
  { label: "Last Paid", value: "lastPaidDate" },
  { label: "Reminder", value: "reminder" },
  { label: "Status", value: "status" },
];

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

function PaymentStatusBadge({ subscription }: { subscription: SubscriptionRecord }) {
  const label = subscription.paymentStatus === "Paid" ? subscription.paidCycleLabel : subscription.paymentStatus;

  return (
    <span className={`inline-flex whitespace-nowrap rounded px-2 py-1 text-xs font-bold uppercase ${paymentStatusStyles[subscription.paymentStatus]}`} title={subscription.paymentStatusDetail}>
      {label}
    </span>
  );
}

function RecordPaymentLink({ className, subscription }: { className?: string; subscription: SubscriptionRecord }) {
  return (
    <Link
      className={className ?? "inline-flex min-h-9 items-center justify-center gap-2 rounded-md border border-[#c6c6cd]/70 bg-white px-3 text-xs font-bold text-[#0b1c30] transition hover:bg-[#eff4ff]"}
      href={`/transactions/add?subscription=${subscription.id}`}
      title={`Record payment for ${subscription.name}`}
    >
      <Icon className="size-4" name="receipt" />
      Record Payment
    </Link>
  );
}

function billingTimelineMeta(billing: UpcomingSubscriptionBilling) {
  const reminderLabel = billing.reminderLabel === "Off" ? "" : billing.reminderLabel;
  return [`${billing.billingCycle} billing`, reminderLabel].filter(Boolean).join(" · ");
}

function ReminderPanel({ subscriptions }: { subscriptions: SubscriptionRecord[] }) {
  const reminderItems = subscriptions.filter((subscription) => subscription.status !== "Paused" && (subscription.reminderStatus === "Overdue" || subscription.reminderStatus === "Due today" || subscription.reminderStatus.startsWith("Due in"))).slice(0, 4);

  return (
    <section className="mb-6 min-w-0 rounded-lg border border-[#c6c6cd]/70 bg-white p-4 shadow-[0_4px_20px_rgba(15,23,42,0.04)] sm:p-5">
      <div className="mb-4 flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h2 className="break-words text-lg font-semibold text-[#0b1c30] sm:text-xl">Subscription Reminders</h2>
          <p className="mt-1 text-sm font-medium text-[#45464d]">{reminderItems.length ? "Renewals that need attention based on reminder settings." : "No subscriptions are inside the active reminder window."}</p>
        </div>
        <span className="grid size-11 shrink-0 place-items-center rounded-lg bg-[#eef2ff] text-[#4f46e5]">
          <Icon name="bell" />
        </span>
      </div>
      {reminderItems.length ? (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {reminderItems.map((subscription) => (
            <article className="min-w-0 rounded-md border border-[#fecaca] bg-[#fffafa] p-4" key={subscription.id}>
              <div className="mb-3 flex min-w-0 flex-wrap items-start justify-between gap-2">
                <p className="min-w-0 break-words text-sm font-semibold text-[#0b1c30]">{subscription.name}</p>
                <ReminderStatusBadge status={subscription.reminderStatus} />
              </div>
              <p className="text-xs font-bold uppercase text-[#45464d]">Next billing</p>
              <p className="mt-1 text-sm font-semibold text-[#0b1c30]">{subscription.nextBillingDate}</p>
              <p className="mt-3 amount-value text-sm font-bold text-[#0b1c30]" title={subscription.amount}>{subscription.amount}</p>
              <p className="mt-1 text-xs font-semibold text-[#45464d]">{subscription.billedAmount}</p>
            </article>
          ))}
        </div>
      ) : null}
    </section>
  );
}

function PaidCyclePanel({ subscriptions }: { subscriptions: SubscriptionRecord[] }) {
  const paidItems = subscriptions.filter((subscription) => subscription.status !== "Paused" && subscription.isPaidForCurrentPeriod).slice(0, 4);
  const attentionItems = subscriptions.filter((subscription) => subscription.paymentStatus === "Overdue" || subscription.paymentStatus === "Due soon").slice(0, 4);

  return (
    <section className="mb-6 grid min-w-0 gap-4 lg:grid-cols-2">
      <div className="min-w-0 rounded-lg border border-[#c6c6cd]/70 bg-white p-4 shadow-[0_4px_20px_rgba(15,23,42,0.04)] sm:p-5">
        <div className="mb-4 flex items-center justify-between gap-4">
          <div className="min-w-0">
            <h2 className="break-words text-lg font-semibold text-[#0b1c30] sm:text-xl">Paid This Cycle</h2>
            <p className="mt-1 text-sm font-medium text-[#45464d]">{paidItems.length ? "Subscriptions already covered for the current billing period." : "No current-cycle subscription payments recorded yet."}</p>
          </div>
          <span className="grid size-11 shrink-0 place-items-center rounded-lg bg-[#ecfdf5] text-[#047857]">
            <Icon name="check" />
          </span>
        </div>
        <div className="space-y-3">
          {paidItems.length ? paidItems.map((subscription) => (
            <div className="flex min-w-0 flex-col items-start gap-3 rounded-md border border-[#bbf7d0] bg-[#f0fdf4] p-3 sm:flex-row sm:items-center sm:justify-between" key={subscription.id}>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-[#0b1c30]">{subscription.name}</p>
                <p className="mt-1 text-xs font-semibold text-[#166534]">{subscription.lastPaidAmount} paid on {subscription.lastPaidDate}</p>
                <p className="mt-1 text-xs font-semibold text-[#45464d]">{subscription.lastPaidBilledAmount} · {subscription.lastPaymentExchangeRateLabel}</p>
              </div>
              <PaymentStatusBadge subscription={subscription} />
            </div>
          )) : (
            <div className="rounded-md border border-[#c6c6cd]/60 bg-[#f8f9ff] p-3 text-sm font-medium text-[#45464d]">Linked subscription payments will appear here after the transaction is saved.</div>
          )}
        </div>
      </div>

      <div className="min-w-0 rounded-lg border border-[#c6c6cd]/70 bg-white p-4 shadow-[0_4px_20px_rgba(15,23,42,0.04)] sm:p-5">
        <div className="mb-4 flex items-center justify-between gap-4">
          <div className="min-w-0">
            <h2 className="break-words text-lg font-semibold text-[#0b1c30] sm:text-xl">Needs Payment</h2>
            <p className="mt-1 text-sm font-medium text-[#45464d]">{attentionItems.length ? "Due or overdue subscriptions based on the active billing schedule." : "No due or overdue subscription payments right now."}</p>
          </div>
          <span className="grid size-11 shrink-0 place-items-center rounded-lg bg-[#fff7ed] text-[#9a3412]">
            <Icon name="calendar" />
          </span>
        </div>
        <div className="space-y-3">
          {attentionItems.length ? attentionItems.map((subscription) => (
            <div className="flex min-w-0 flex-wrap items-center justify-between gap-3 rounded-md border border-[#fed7aa] bg-[#fffaf5] p-3" key={subscription.id}>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-[#0b1c30]">{subscription.name}</p>
                <p className="mt-1 text-xs font-semibold text-[#9a3412]">{subscription.paymentStatusDetail}</p>
              </div>
              <RecordPaymentLink subscription={subscription} />
            </div>
          )) : (
            <div className="rounded-md border border-[#c6c6cd]/60 bg-[#f8f9ff] p-3 text-sm font-medium text-[#45464d]">Upcoming subscriptions will stay on the billing timeline until they enter the payment window.</div>
          )}
        </div>
      </div>
    </section>
  );
}

function BillingTimeline({ billings }: { billings: UpcomingSubscriptionBilling[] }) {
  return (
    <section className="mb-6 min-w-0 max-w-full">
      <h2 className="mb-3 text-lg font-semibold text-[#0b1c30] sm:text-xl">Upcoming Billing Timeline</h2>
      <div className="flex max-w-full gap-4 overflow-x-auto px-0.5 pb-3 [-webkit-overflow-scrolling:touch]">
        {billings.map((billing) => (
          <article
            className="relative flex w-[min(19rem,calc(100vw-2rem))] shrink-0 flex-col gap-4 overflow-hidden rounded-lg border border-[#c6c6cd]/70 bg-white p-4 shadow-[0_4px_20px_rgba(15,23,42,0.04)] sm:w-80"
            key={billing.id}
          >
            <div className={`absolute bottom-0 left-0 top-0 w-1 rounded-l-lg ${billing.isNext ? "bg-[#0058be]" : "bg-[#c6c6cd]"}`} />
            <div className="flex min-w-0 flex-wrap items-center justify-between gap-2 pl-2">
              <p className={`min-w-0 truncate text-xs font-bold ${billing.isNext ? "text-[#0058be]" : "text-[#45464d]"}`}>{billing.dateLabel}</p>
              {billing.reminderDue ? <span className="shrink-0 rounded bg-[#fff1f0] px-2 py-1 text-[11px] font-bold uppercase text-[#991b1b]">Reminder</span> : null}
            </div>
            <div className="grid min-w-0 grid-cols-[auto_minmax(0,1fr)] gap-3 pl-2">
              <span className="grid size-10 shrink-0 place-items-center rounded-full bg-[#eff4ff] text-[#45464d]">
                <Icon className="size-5" name={billing.icon} />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-[#0b1c30]">{billing.name}</p>
                <p className="mt-1 text-xs font-medium text-[#45464d]">{billingTimelineMeta(billing)}</p>
                <p className="amount-value mt-1 text-xs font-semibold text-[#0058be]" title={billing.billedAmount}>{billing.billedAmount}</p>
              </div>
              <p className="amount-value col-span-2 max-w-full rounded-md bg-[#f8f9ff] px-3 py-2 text-left text-base font-semibold text-[#0b1c30] sm:text-lg" title={billing.amount}>{billing.amount}</p>
              <p className="col-span-2 break-words text-xs font-semibold text-[#45464d]">{billing.paymentStatusDetail}</p>
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
      if (sortKey === "lastPaidDate") return dateTimeSortValue(subscription.lastPaidDateValue);
      if (sortKey === "nextBillingDate") return dateTimeSortValue(subscription.nextBillingDateTimeValue ?? subscription.nextBillingDate);
      if (sortKey === "paymentStatus") return `${subscription.paymentStatus} ${subscription.paymentStatusDetail}`.toLowerCase();
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
      setSortDirection(key === "amount" || key === "billedAmount" || key === "exchangeRate" || key === "lastPaidDate" ? "desc" : "asc");
      return key;
    });
  }

  return (
    <section className="min-w-0">
      <h2 className="mb-3 text-lg font-semibold text-[#0b1c30] sm:text-xl">All Subscriptions</h2>
      <div className="min-w-0 max-w-full overflow-hidden rounded-lg border border-[#c6c6cd]/70 bg-white shadow-[0_4px_20px_rgba(15,23,42,0.04)]">
        <div className="hidden max-w-full overflow-x-auto [-webkit-overflow-scrolling:touch] xl:block">
          <table className="w-full min-w-[1580px] border-collapse text-left">
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
                <th className="px-4 py-3"><SortHeader onSort={() => handleSort("paymentStatus")} sortDirection={sortKey === "paymentStatus" ? sortDirection : undefined}>Payment</SortHeader></th>
                <th className="px-4 py-3"><SortHeader onSort={() => handleSort("lastPaidDate")} sortDirection={sortKey === "lastPaidDate" ? sortDirection : undefined}>Last Paid</SortHeader></th>
                <th className="px-4 py-3"><SortHeader onSort={() => handleSort("reminder")} sortDirection={sortKey === "reminder" ? sortDirection : undefined}>Reminder</SortHeader></th>
                <th className="px-4 py-3"><SortHeader onSort={() => handleSort("status")} sortDirection={sortKey === "status" ? sortDirection : undefined}>Status</SortHeader></th>
                <th className="w-36 px-4 py-3 text-right">Actions</th>
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
                  <td className="px-4 py-4"><PaymentStatusBadge subscription={subscription} /></td>
                  <td className="whitespace-nowrap px-4 py-4 text-[#45464d]">
                    <div className="font-semibold text-[#0b1c30]">{subscription.lastPaidDate}</div>
                    <div className="mt-1 text-xs font-semibold text-[#76777d]">{subscription.lastPaidAmount}</div>
                    <div className="mt-1 text-xs font-semibold text-[#76777d]">{subscription.lastPaidBilledAmount}</div>
                    <div className="mt-1 text-xs font-semibold text-[#76777d]">{subscription.lastPaymentExchangeRateLabel}</div>
                  </td>
                  <td className="px-4 py-4"><ReminderStatusBadge status={subscription.reminderStatus} /></td>
                  <td className="px-4 py-4">
                    <span className={`inline-flex rounded px-2 py-1 text-xs font-bold uppercase ${statusStyles[subscription.status]}`}>
                      {subscription.status}
                    </span>
                  </td>
                  <td className="px-4 py-4">
                    <div className="flex justify-end gap-1">
                      <Link
                        className="grid size-9 place-items-center rounded-md text-[#45464d] transition hover:bg-[#eff4ff] hover:text-[#0b1c30]"
                        href={`/transactions/add?subscription=${subscription.id}`}
                        title={`Record payment for ${subscription.name}`}
                      >
                        <Icon className="size-4" name="receipt" />
                      </Link>
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
        <div className="grid min-w-0 grid-cols-1 gap-2 border-b border-[#c6c6cd]/40 bg-white p-3 min-[420px]:grid-cols-[minmax(0,1fr)_auto] sm:p-4 xl:hidden">
          <label className="min-w-0">
            <span className="mb-1 block text-xs font-bold uppercase text-[#45464d]">Sort by</span>
            <span className="relative block min-w-0">
              <select
                aria-label="Sort subscription cards by"
                className="h-11 w-full appearance-none rounded-md border border-[#c6c6cd] bg-white px-3 pr-10 text-sm font-semibold text-[#0b1c30] outline-none transition focus:border-[#2170e4] focus:ring-2 focus:ring-[#2170e4]/20"
                onChange={(event) => handleSort(event.target.value as SubscriptionSortKey)}
                value={sortKey}
              >
                {subscriptionSortOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
              <Icon className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-[#76777d]" name="chevronDown" />
            </span>
          </label>
          <button
            aria-label={`Sort subscription cards ${sortDirection === "asc" ? "descending" : "ascending"}`}
            className="inline-flex min-h-11 w-full items-center justify-center gap-2 self-end rounded-md border border-[#c6c6cd] bg-white px-3 text-sm font-semibold text-[#45464d] transition hover:bg-[#eff4ff] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2170e4]/25 min-[420px]:w-auto"
            onClick={() => handleSort(sortKey)}
            type="button"
          >
            <Icon className="size-4" name={sortDirection === "asc" ? "trendingUp" : "trendingDown"} />
            {sortDirection === "asc" ? "Ascending" : "Descending"}
          </button>
        </div>
        <div className="grid min-w-0 gap-3 p-3 sm:grid-cols-2 sm:p-4 xl:hidden">
          {sortedSubscriptions.map((subscription) => (
            <article className="min-w-0 rounded-lg border border-[#c6c6cd]/60 bg-white p-4 shadow-sm" key={`mobile-${subscription.id}`}>
              <div className="flex min-w-0 flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div className="flex min-w-0 items-center gap-3">
                  <span className={`grid size-10 shrink-0 place-items-center rounded-md ${subscription.bg} ${subscription.tone}`}>
                    <Icon className="size-4" name={subscription.icon} />
                  </span>
                  <div className="min-w-0">
                    <h3 className="break-words font-semibold text-[#0b1c30]">{subscription.name}</h3>
                    <p className="mt-1 break-words text-xs font-medium text-[#45464d]">{subscription.category}</p>
                  </div>
                </div>
                <span className={`w-fit shrink-0 rounded px-2 py-1 text-xs font-bold uppercase ${statusStyles[subscription.status]}`}>
                  {subscription.status}
                </span>
              </div>

              <dl className="mt-4 grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="min-w-0 rounded-md bg-[#f8f9ff] p-3 sm:col-span-2">
                  <dt className="text-xs font-bold uppercase text-[#45464d]">MMK Amount</dt>
                  <dd className="amount-value mt-1 font-semibold text-[#0b1c30]" title={subscription.amount}>{subscription.amount}</dd>
                </div>
                <div className="min-w-0 rounded-md bg-[#eff6ff] p-3">
                  <dt className="text-xs font-bold uppercase text-[#0058be]">Billed Amount</dt>
                  <dd className="amount-value mt-1 font-semibold text-[#0058be]" title={subscription.billedAmount}>{subscription.billedAmount}</dd>
                </div>
                <div className="min-w-0 rounded-md bg-[#f8f9ff] p-3">
                  <dt className="text-xs font-bold uppercase text-[#45464d]">Exchange Rate</dt>
                  <dd className="amount-value mt-1 font-semibold text-[#0b1c30]" title={subscription.exchangeRateLabel}>{subscription.exchangeRateLabel}</dd>
                </div>
                <div className="min-w-0 rounded-md bg-[#f8f9ff] p-3">
                  <dt className="text-xs font-bold uppercase text-[#45464d]">Billing Cycle</dt>
                  <dd className="mt-1 break-words font-semibold text-[#0b1c30]">{subscription.billingCycle}</dd>
                </div>
                <div className="min-w-0 rounded-md bg-[#f8f9ff] p-3">
                  <dt className="text-xs font-bold uppercase text-[#45464d]">Next Billing</dt>
                  <dd className="mt-1 break-words font-semibold text-[#0b1c30]">{subscription.nextBillingDate}</dd>
                </div>
              </dl>

              <div className="mt-4 space-y-3 rounded-md border border-[#c6c6cd]/40 bg-white p-3">
                <div className="flex min-w-0 flex-wrap items-start justify-between gap-2">
                  <span className="text-xs font-bold uppercase text-[#45464d]">Payment</span>
                  <PaymentStatusBadge subscription={subscription} />
                </div>
                <p className="break-words text-xs font-medium text-[#45464d]">{subscription.paymentStatusDetail}</p>
                <div className="flex min-w-0 flex-wrap items-start justify-between gap-2">
                  <span className="text-xs font-bold uppercase text-[#45464d]">Reminder</span>
                  <ReminderStatusBadge status={subscription.reminderStatus} />
                </div>
              </div>

              <dl className="mt-4 min-w-0 rounded-md bg-[#f8f9ff] p-3 text-xs">
                <dt className="font-bold uppercase text-[#45464d]">Payment Account</dt>
                <dd className="mt-1 break-words font-semibold text-[#0b1c30]">{subscription.paymentAccount}</dd>
                <dt className="mt-3 font-bold uppercase text-[#45464d]">Last Paid</dt>
                <dd className="mt-1 break-words font-semibold text-[#0b1c30]">{subscription.lastPaidDate}</dd>
                <dd className="amount-value mt-1 font-semibold text-[#45464d]" title={subscription.lastPaidAmount}>{subscription.lastPaidAmount}</dd>
                <dd className="amount-value mt-1 font-semibold text-[#45464d]" title={subscription.lastPaidBilledAmount}>{subscription.lastPaidBilledAmount}</dd>
                <dd className="amount-value mt-1 font-semibold text-[#45464d]" title={subscription.lastPaymentExchangeRateLabel}>{subscription.lastPaymentExchangeRateLabel}</dd>
              </dl>

              <div className="mt-4 flex min-w-0 flex-wrap items-center justify-end gap-2 border-t border-[#c6c6cd]/40 pt-3">
                <RecordPaymentLink className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md border border-[#c6c6cd]/70 bg-white px-3 text-xs font-bold text-[#0b1c30] transition hover:bg-[#eff4ff]" subscription={subscription} />
                <RecordActions
                  deleteDescription={`Deleting ${subscription.name} will remove this subscription from your list.`}
                  editHref={`/subscriptions/${subscription.id}/edit`}
                  itemId={subscription.id}
                  itemLabel={subscription.name}
                  onDelete={onDelete}
                />
              </div>
            </article>
          ))}
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
      const searchable = `${subscription.name} ${subscription.amount} ${subscription.billedAmount} ${subscription.exchangeRateLabel} ${subscription.billingCycle} ${subscription.category} ${subscription.paymentAccount} ${subscription.nextBillingDate} ${subscription.paymentStatus} ${subscription.paymentStatusDetail} ${subscription.lastPaidDate} ${subscription.lastPaidAmount} ${subscription.lastPaidBilledAmount} ${subscription.lastPaymentExchangeRateLabel} ${subscription.reminderStatus} ${subscription.status}`.toLowerCase();
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
      <PaidCyclePanel subscriptions={filteredSubscriptions} />
      <BillingTimeline billings={billings} />
      <SubscriptionsTable
        onDelete={handleDelete}
        subscriptions={filteredSubscriptions}
      />
    </>
  );
}
