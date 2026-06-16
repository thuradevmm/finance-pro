"use client";

import { useMemo, useState } from "react";

import { Icon } from "@/components/ui/icon";
import { CategoryBadge, TransactionTypeBadge } from "@/features/transactions/transaction-badges";
import { amountClass } from "@/features/transactions/transaction-styles";
import type { Transaction } from "@/types/finance";

type TransactionsTableProps = {
  transactions: Transaction[];
  totalResults: number;
};

function AttachmentIcon({ attachment }: { attachment?: Transaction["attachment"] }) {
  if (!attachment) {
    return (
      <span
        aria-label="No file attached"
        className="mx-auto grid size-8 place-items-center rounded-md border border-[#e4e4e7] bg-[#f8f9ff] text-xs font-semibold text-[#a1a1aa]"
        title="No file attached"
      >
        -
      </span>
    );
  }

  const attachmentLabel = attachment === "receipt" ? "Receipt attached" : "Document attached";

  return (
    <span
      aria-label={attachmentLabel}
      className="mx-auto grid size-8 place-items-center rounded-md border border-[#bfdbfe] bg-[#eff6ff] text-[#1d4ed8]"
      title={attachmentLabel}
    >
      <Icon className="size-4" name={attachment === "receipt" ? "receipt" : "document"} />
    </span>
  );
}

type TransactionAction = "view" | "edit" | "delete";

const transactionActions: {
  label: string;
  action: TransactionAction;
  icon: "eye" | "edit" | "trash";
  tone: string;
}[] = [
  { label: "View details", action: "view", icon: "eye", tone: "text-[#45464d] hover:text-[#0b1c30]" },
  { label: "Edit transaction", action: "edit", icon: "edit", tone: "text-[#45464d] hover:text-[#0b1c30]" },
  { label: "Delete transaction", action: "delete", icon: "trash", tone: "text-[#b42318] hover:text-[#8f1d14]" },
];

export function TransactionsTable({ transactions, totalResults }: TransactionsTableProps) {
  const [selectedTransactionIds, setSelectedTransactionIds] = useState<string[]>([]);
  const resultStart = transactions.length > 0 ? 1 : 0;
  const visibleTransactionIds = useMemo(() => transactions.map((transaction) => transaction.id), [transactions]);
  const selectedVisibleCount = selectedTransactionIds.filter((id) => visibleTransactionIds.includes(id)).length;
  const hasSelectedTransactions = selectedVisibleCount > 0;
  const allVisibleSelected = transactions.length > 0 && selectedVisibleCount === transactions.length;

  function handleAction() {
    // Placeholder for wiring transaction detail, edit, and delete flows.
  }

  function handleBulkAction() {
    setSelectedTransactionIds([]);
  }

  function toggleTransactionSelection(transactionId: string) {
    setSelectedTransactionIds((currentIds) =>
      currentIds.includes(transactionId) ? currentIds.filter((id) => id !== transactionId) : [...currentIds, transactionId],
    );
  }

  function toggleAllVisibleTransactions() {
    setSelectedTransactionIds((currentIds) => {
      const hiddenSelectedIds = currentIds.filter((id) => !visibleTransactionIds.includes(id));

      if (allVisibleSelected) {
        return hiddenSelectedIds;
      }

      return [...hiddenSelectedIds, ...visibleTransactionIds];
    });
  }

  return (
    <section className="space-y-3 lg:overflow-hidden lg:rounded-lg lg:border lg:border-[#c6c6cd]/70 lg:bg-white lg:shadow-[0_4px_20px_rgba(15,23,42,0.04)]">
      <div
        className={`flex min-h-14 flex-col gap-3 rounded-lg border px-4 py-3 transition sm:flex-row sm:items-center sm:justify-between lg:rounded-none lg:border-x-0 lg:border-t-0 ${
          hasSelectedTransactions
            ? "border-[#bfdbfe] bg-[#eff6ff] text-[#1d4ed8]"
            : "border-[#c6c6cd]/60 bg-white text-[#45464d] lg:bg-[#f8f9ff]"
        }`}
      >
        <p className="text-sm font-medium">
          {hasSelectedTransactions ? `${selectedVisibleCount} selected for bulk actions` : "Select transactions to export or delete multiple records."}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <button
            className="inline-flex h-9 items-center gap-2 rounded-md border border-[#c6c6cd]/70 bg-white px-3 text-sm font-semibold text-[#45464d] transition hover:bg-[#f8f9ff] disabled:cursor-not-allowed disabled:opacity-50"
            disabled={!hasSelectedTransactions}
            onClick={handleBulkAction}
            type="button"
          >
            <Icon className="size-4" name="download" />
            Export selected
          </button>
          <button
            className="inline-flex h-9 items-center gap-2 rounded-md border border-[#fecaca] bg-white px-3 text-sm font-semibold text-[#b42318] transition hover:bg-[#fff1f0] disabled:cursor-not-allowed disabled:opacity-50"
            disabled={!hasSelectedTransactions}
            onClick={handleBulkAction}
            type="button"
          >
            <Icon className="size-4" name="trash" />
            Delete selected
          </button>
        </div>
      </div>
      <div className="hidden overflow-x-auto lg:block">
        <table className="w-full min-w-[1040px] border-collapse text-left">
          <thead>
            <tr className="border-b border-[#c6c6cd]/60 bg-[#f8f9ff]">
              <th className="w-12 px-4 py-3 text-center">
                <input
                  aria-label="Select all visible transactions"
                  checked={allVisibleSelected}
                  className="size-4 rounded border-[#c6c6cd]"
                  disabled={transactions.length === 0}
                  onChange={toggleAllVisibleTransactions}
                  type="checkbox"
                />
              </th>
              <th className="px-4 py-3 text-xs font-semibold text-[#45464d]">Date</th>
              <th className="px-4 py-3 text-xs font-semibold text-[#45464d]">Type</th>
              <th className="px-4 py-3 text-xs font-semibold text-[#45464d]">Category</th>
              <th className="px-4 py-3 text-xs font-semibold text-[#45464d]">Account</th>
              <th className="px-4 py-3 text-xs font-semibold text-[#45464d]">Payment Method</th>
              <th className="px-4 py-3 text-right text-xs font-semibold text-[#45464d]">Amount</th>
              <th className="px-4 py-3 text-xs font-semibold text-[#45464d]">Note</th>
              <th className="w-16 px-4 py-3 text-center text-xs font-semibold text-[#45464d]">
                <span className="sr-only">Attachment</span>
                <span className="mx-auto grid size-8 place-items-center rounded-md text-[#45464d]" title="File">
                  <Icon className="size-4" name="attach" />
                </span>
              </th>
              <th className="w-36 px-4 py-3 text-center">
                <span className="text-xs font-semibold text-[#45464d]">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#c6c6cd]/40 text-sm">
            {transactions.length > 0 ? (
              transactions.map((transaction) => (
                <tr className="group transition hover:bg-[#f8f9ff]" key={transaction.id}>
                  <td className="px-4 py-4 text-center">
                    <input
                      aria-label={`Select ${transaction.id}`}
                      checked={selectedTransactionIds.includes(transaction.id)}
                      className="size-4 rounded border-[#c6c6cd]"
                      onChange={() => toggleTransactionSelection(transaction.id)}
                      type="checkbox"
                    />
                  </td>
                  <td className="whitespace-nowrap px-4 py-4 text-[#45464d]">{transaction.date}</td>
                  <td className="px-4 py-4">
                    <TransactionTypeBadge type={transaction.type} />
                  </td>
                  <td className="px-4 py-4">
                    <CategoryBadge category={transaction.category} />
                  </td>
                  <td className="whitespace-nowrap px-4 py-4 text-[#45464d]">{transaction.account}</td>
                  <td className="whitespace-nowrap px-4 py-4 text-[#45464d]">{transaction.paymentMethod}</td>
                  <td className={`whitespace-nowrap px-4 py-4 text-right font-semibold ${amountClass(transaction.type)}`}>
                    {transaction.amount}
                  </td>
                  <td className="max-w-52 truncate px-4 py-4 text-[#45464d]" title={transaction.note}>
                    {transaction.note}
                  </td>
                  <td className="w-16 px-4 py-4 text-center">
                    <AttachmentIcon attachment={transaction.attachment} />
                  </td>
                  <td className="w-36 px-4 py-4 text-right">
                    <div className="flex min-w-28 justify-end gap-1">
                      {transactionActions.map((item) => (
                        <button
                          aria-label={`${item.label} for ${transaction.id}`}
                          className={`grid size-8 place-items-center rounded-full border border-transparent transition hover:border-[#c6c6cd] hover:bg-[#eff4ff] focus-visible:border-[#0058be] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0058be]/20 ${item.tone}`}
                          key={item.action}
                          onClick={handleAction}
                          title={item.label}
                          type="button"
                        >
                          <Icon className="size-4" name={item.icon} />
                        </button>
                      ))}
                    </div>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td className="px-4 py-12 text-center text-sm font-medium text-[#45464d]" colSpan={10}>
                  No transactions match the current filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="grid gap-3 lg:hidden">
        {transactions.length > 0 ? (
          transactions.map((transaction) => (
            <article className="rounded-md border border-[#c6c6cd]/60 bg-white p-4" key={transaction.id}>
              <div className="flex items-start justify-between gap-3">
                <div className="flex min-w-0 gap-3">
                  <input
                    aria-label={`Select ${transaction.id}`}
                    checked={selectedTransactionIds.includes(transaction.id)}
                    className="mt-1 size-4 shrink-0 rounded border-[#c6c6cd]"
                    onChange={() => toggleTransactionSelection(transaction.id)}
                    type="checkbox"
                  />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-[#0b1c30]">{transaction.note}</p>
                    <p className="mt-1 text-xs text-[#45464d]">{transaction.date}</p>
                  </div>
                </div>
                <div className="shrink-0 text-right">
                  <p className={`text-sm font-semibold ${amountClass(transaction.type)}`}>{transaction.amount}</p>
                </div>
              </div>
              <div className="mt-4 flex flex-wrap items-center gap-2">
                <TransactionTypeBadge type={transaction.type} />
                <CategoryBadge category={transaction.category} />
                <span className="rounded-md border border-[#c6c6cd]/60 px-2.5 py-1 text-xs font-semibold text-[#45464d]">
                  {transaction.account}
                </span>
              </div>
              <div className="mt-4 flex items-center justify-end gap-1 border-t border-[#c6c6cd]/40 pt-3">
                {transactionActions.map((item) => (
                  <button
                    aria-label={`${item.label} for ${transaction.id}`}
                    className={`grid size-8 place-items-center rounded-full border border-transparent transition hover:border-[#c6c6cd] hover:bg-[#eff4ff] focus-visible:border-[#0058be] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0058be]/20 ${item.tone}`}
                    key={item.action}
                    onClick={handleAction}
                    title={item.label}
                    type="button"
                  >
                    <Icon className="size-4" name={item.icon} />
                  </button>
                ))}
              </div>
            </article>
          ))
        ) : (
          <div className="rounded-md border border-[#c6c6cd]/60 bg-white p-6 text-center text-sm font-medium text-[#45464d]">
            No transactions match the current filters.
          </div>
        )}
      </div>

      <div className="flex flex-col gap-3 rounded-lg border border-[#c6c6cd]/60 bg-white px-4 py-3 sm:flex-row sm:items-center sm:justify-between lg:rounded-none lg:border-x-0 lg:border-b-0 lg:bg-[#f8f9ff]">
        <p className="text-sm text-[#45464d]">
          Showing <span className="font-semibold text-[#0b1c30]">{resultStart}</span> to{" "}
          <span className="font-semibold text-[#0b1c30]">{transactions.length}</span> of{" "}
          <span className="font-semibold text-[#0b1c30]">{totalResults}</span> results
        </p>
        <nav aria-label="Pagination" className="inline-flex w-fit overflow-hidden rounded-md border border-[#c6c6cd] bg-white shadow-sm">
          <button
            aria-label="Previous page"
            className="grid size-10 place-items-center border-r border-[#c6c6cd] text-[#45464d] transition hover:bg-[#eff4ff]"
            type="button"
          >
            <Icon className="size-4" name="chevronLeft" />
          </button>
          {[1, 2, 3].map((page) => (
            <button
              aria-current={page === 1 ? "page" : undefined}
              className={
                page === 1
                  ? "h-10 min-w-10 border-r border-[#c6c6cd] bg-[#d8e2ff] px-3 text-sm font-semibold text-[#0058be]"
                  : "h-10 min-w-10 border-r border-[#c6c6cd] px-3 text-sm font-semibold text-[#45464d] transition hover:bg-[#eff4ff]"
              }
              key={page}
              type="button"
            >
              {page}
            </button>
          ))}
          <span className="grid h-10 min-w-10 place-items-center border-r border-[#c6c6cd] px-3 text-sm text-[#45464d]">...</span>
          <button
            aria-label="Next page"
            className="grid size-10 place-items-center text-[#45464d] transition hover:bg-[#eff4ff]"
            type="button"
          >
            <Icon className="size-4" name="chevronRight" />
          </button>
        </nav>
      </div>
    </section>
  );
}
