"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import { deleteTransaction, reverseTransaction } from "@/app/transactions/actions";
import { DeleteConfirmationDialog } from "@/components/ui/delete-confirmation-dialog";
import { DetailModal, DetailModalField, DetailModalSection } from "@/components/ui/detail-modal";
import { Icon } from "@/components/ui/icon";
import { compareSortValues, SortHeader, type SortDirection } from "@/components/ui/sort-header";
import { useToast } from "@/components/ui/toast-provider";
import { CategoryBadge, TransactionTypeBadge } from "@/features/transactions/transaction-badges";
import { amountClass } from "@/features/transactions/transaction-styles";
import { dateTimeSortValue } from "@/lib/date-format";
import type { Transaction } from "@/types/finance";

type TransactionsTableProps = {
  transactions: Transaction[];
  totalResults: number;
};

const rowsPerPageOptions = [10, 25, 50, 100];

type SortKey = "account" | "amount" | "amountType" | "category" | "date" | "note" | "type";

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

function getAttachmentLabel(attachment?: Transaction["attachment"]) {
  if (attachment === "receipt") {
    return "Receipt attached";
  }

  if (attachment === "document") {
    return "Document attached";
  }

  return "No file attached";
}

function getImpactLabel(transaction: Transaction) {
  if (transaction.linkedBudgetId) return "Linked budget";
  if (transaction.linkedSavingsGoalId) return "Linked savings goal";
  if (transaction.linkedDebtId) return "Linked debt";
  if (transaction.linkedSubscriptionId) return "Linked subscription";
  if (transaction.linkedAssetId) return "Linked asset";
  return "No linked record";
}

type TransactionAction = "view" | "edit" | "reverse" | "delete";

const transactionActions: {
  label: string;
  action: TransactionAction;
  icon: "eye" | "edit" | "sync" | "trash";
  tone: string;
}[] = [
  { label: "View details", action: "view", icon: "eye", tone: "text-[#45464d] hover:text-[#0b1c30]" },
  { label: "Edit transaction", action: "edit", icon: "edit", tone: "text-[#45464d] hover:text-[#0b1c30]" },
  { label: "Reverse transaction", action: "reverse", icon: "sync", tone: "text-[#4f46e5] hover:text-[#3730a3]" },
  { label: "Delete transaction", action: "delete", icon: "trash", tone: "text-[#b42318] hover:text-[#8f1d14]" },
];

function parseCurrency(value: string) {
  return Number(value.replace(/[^0-9.-]/g, "")) || 0;
}

function sortableValue(transaction: Transaction, key: SortKey) {
  if (key === "amount") return transaction.amountValue ?? parseCurrency(transaction.amount);
  if (key === "date") return dateTimeSortValue(transaction.dateTimeValue ?? `${transaction.dateValue ?? transaction.date}T00:00:00`);
  if (key === "amountType") return `${transaction.accountAmountType} ${transaction.transferAccountAmountType ?? ""}`.toLowerCase();
  return String(transaction[key] ?? "").toLowerCase();
}

function compareTransactions(first: Transaction, second: Transaction, key: SortKey, direction: SortDirection) {
  const firstValue = sortableValue(first, key);
  const secondValue = sortableValue(second, key);
  return compareSortValues(firstValue, secondValue, direction);
}

function accountMovementLabel(transaction: Transaction) {
  if (transaction.type !== "Transfer") return transaction.account;
  if (transaction.transferFromAccount && transaction.transferToAccount) {
    return `${transaction.transferFromAccount} → ${transaction.transferToAccount}`;
  }
  return transaction.transferAccount ? `${transaction.account} → ${transaction.transferAccount}` : transaction.account;
}

function amountTypeMovementLabel(transaction: Transaction) {
  if (transaction.type !== "Transfer") return transaction.accountAmountType;
  if (transaction.transferDirection === "Credit") {
    return transaction.transferAccountAmountType
      ? `${transaction.transferAccountAmountType} → ${transaction.accountAmountType}`
      : transaction.accountAmountType;
  }
  return transaction.transferAccountAmountType
    ? `${transaction.accountAmountType} → ${transaction.transferAccountAmountType}`
    : transaction.accountAmountType;
}

export function TransactionsTable({ transactions, totalResults }: TransactionsTableProps) {
  const { showError, showSuccess } = useToast();
  const [currentPage, setCurrentPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const [sortKey, setSortKey] = useState<SortKey>("date");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");
  const [deletedTransactionIds, setDeletedTransactionIds] = useState<string[]>([]);
  const [reversedTransactionIds, setReversedTransactionIds] = useState<string[]>([]);
  const [selectedTransactionIds, setSelectedTransactionIds] = useState<string[]>([]);
  const [viewedTransaction, setViewedTransaction] = useState<Transaction | null>(null);
  const [deletingTransaction, setDeletingTransaction] = useState<Transaction | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [reversingTransactionId, setReversingTransactionId] = useState("");
  const visibleTransactions = useMemo(
    () => transactions.filter((transaction) => !deletedTransactionIds.includes(transaction.id)),
    [deletedTransactionIds, transactions],
  );
  const sortedTransactions = useMemo(
    () => [...visibleTransactions].sort((first, second) => compareTransactions(first, second, sortKey, sortDirection)),
    [sortDirection, sortKey, visibleTransactions],
  );
  const pageCount = Math.max(Math.ceil(sortedTransactions.length / rowsPerPage), 1);
  const effectiveCurrentPage = Math.min(currentPage, pageCount);
  const pageStartIndex = (effectiveCurrentPage - 1) * rowsPerPage;
  const paginatedTransactions = sortedTransactions.slice(pageStartIndex, pageStartIndex + rowsPerPage);
  const resultStart = sortedTransactions.length > 0 ? pageStartIndex + 1 : 0;
  const resultEnd = Math.min(pageStartIndex + paginatedTransactions.length, sortedTransactions.length);
  const visibleTotalResults = Math.min(totalResults, sortedTransactions.length);
  const pageTransactionIds = useMemo(() => paginatedTransactions.map((transaction) => transaction.id), [paginatedTransactions]);
  const selectedVisibleTransactions = useMemo(
    () => visibleTransactions.filter((transaction) => selectedTransactionIds.includes(transaction.id)),
    [selectedTransactionIds, visibleTransactions],
  );
  const selectedVisibleCount = selectedVisibleTransactions.length;
  const selectedPageCount = selectedTransactionIds.filter((id) => pageTransactionIds.includes(id)).length;
  const hasSelectedTransactions = selectedVisibleCount > 0;
  const allVisibleSelected = paginatedTransactions.length > 0 && selectedPageCount === paginatedTransactions.length;
  const paginationItems = useMemo(() => {
    if (pageCount <= 5) return Array.from({ length: pageCount }, (_, index) => index + 1);

    const pages = new Set([1, pageCount, effectiveCurrentPage - 1, effectiveCurrentPage, effectiveCurrentPage + 1]);
    return Array.from(pages)
      .filter((page) => page >= 1 && page <= pageCount)
      .sort((first, second) => first - second)
      .flatMap((page, index, pagesList) => {
        const previousPage = pagesList[index - 1];
        return previousPage && page - previousPage > 1 ? [`ellipsis-${previousPage}-${page}`, page] : [page];
      });
  }, [effectiveCurrentPage, pageCount]);

  function handleAction(action: TransactionAction, transaction: Transaction) {
    if (action === "view") {
      setViewedTransaction(transaction);
      return;
    }

    if (action === "delete") {
      setViewedTransaction(null);
      setDeletingTransaction(transaction);
      return;
    }

    if (action === "reverse") {
      void confirmReverseTransaction(transaction);
    }
  }

  function handleSort(key: SortKey) {
    setCurrentPage(1);
    setSortKey((currentKey) => {
      if (currentKey === key) {
        setSortDirection((direction) => (direction === "asc" ? "desc" : "asc"));
        return currentKey;
      }
      setSortDirection(key === "date" || key === "amount" ? "desc" : "asc");
      return key;
    });
  }

  async function confirmReverseTransaction(transaction: Transaction) {
    setReversingTransactionId(transaction.id);
    const result = await reverseTransaction(transaction.id);
    setReversingTransactionId("");
    if (result.error) {
      showError(result.error);
      return;
    }
    setReversedTransactionIds((ids) => [...ids, transaction.id]);
    showSuccess("Transaction reversed successfully.");
  }

  async function confirmDeleteTransaction() {
    if (!deletingTransaction) {
      return;
    }

    setIsDeleting(true);
    const result = await deleteTransaction(deletingTransaction.id);
    setIsDeleting(false);
    if (result.error) {
      showError(result.error);
      return;
    }

    const deletedIds = result.transactionIds?.length ? result.transactionIds : [deletingTransaction.id];
    setDeletedTransactionIds((ids) => [...ids, ...deletedIds]);
    setSelectedTransactionIds((currentIds) => currentIds.filter((id) => !deletedIds.includes(id)));
    setViewedTransaction((currentTransaction) => (currentTransaction && deletedIds.includes(currentTransaction.id) ? null : currentTransaction));
    setDeletingTransaction(null);
    showSuccess("Transaction deleted successfully.");
  }

  function csvCell(value: string) {
    return `"${value.replace(/"/g, "\"\"")}"`;
  }

  function exportSelectedTransactions() {
    if (selectedVisibleTransactions.length === 0) return;

    const headers = ["Date", "Type", "Category", "Account", "Amount Type", "Amount", "Note", "Reflects"];
    const rows = selectedVisibleTransactions.map((transaction) => [
      transaction.date,
      transaction.type,
      transaction.category,
      transaction.account,
      transaction.accountAmountType,
      transaction.amount,
      transaction.note,
      getImpactLabel(transaction),
    ]);
    const csv = [headers, ...rows].map((row) => row.map(csvCell).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `transactions-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  async function deleteSelectedTransactions() {
    if (selectedVisibleTransactions.length === 0) return;

    setIsDeleting(true);
    const deletedIds: string[] = [];
    const deletedIdSet = new Set<string>();
    for (const transaction of selectedVisibleTransactions) {
      if (deletedIdSet.has(transaction.id)) continue;
      const result = await deleteTransaction(transaction.id);
      if (result.error) {
        showError(result.error);
        break;
      }
      for (const deletedId of result.transactionIds?.length ? result.transactionIds : [transaction.id]) {
        deletedIdSet.add(deletedId);
        deletedIds.push(deletedId);
      }
    }
    setIsDeleting(false);
    if (deletedIds.length === 0) return;

    setDeletedTransactionIds((ids) => [...ids, ...deletedIds]);
    setSelectedTransactionIds((currentIds) => currentIds.filter((id) => !deletedIds.includes(id)));
    setViewedTransaction((currentTransaction) => (currentTransaction && deletedIds.includes(currentTransaction.id) ? null : currentTransaction));
    showSuccess(`${deletedIds.length} transaction${deletedIds.length === 1 ? "" : "s"} deleted successfully.`);
  }

  function toggleTransactionSelection(transactionId: string) {
    setSelectedTransactionIds((currentIds) =>
      currentIds.includes(transactionId) ? currentIds.filter((id) => id !== transactionId) : [...currentIds, transactionId],
    );
  }

  function toggleAllVisibleTransactions() {
    setSelectedTransactionIds((currentIds) => {
      const hiddenSelectedIds = currentIds.filter((id) => !pageTransactionIds.includes(id));

      if (allVisibleSelected) {
        return hiddenSelectedIds;
      }

      return [...hiddenSelectedIds, ...pageTransactionIds];
    });
  }

  function goToPage(page: number) {
    setCurrentPage(Math.min(Math.max(page, 1), pageCount));
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
            onClick={exportSelectedTransactions}
            type="button"
          >
            <Icon className="size-4" name="download" />
            Export selected
          </button>
          <button
            className="inline-flex h-9 items-center gap-2 rounded-md border border-[#fecaca] bg-white px-3 text-sm font-semibold text-[#b42318] transition hover:bg-[#fff1f0] disabled:cursor-not-allowed disabled:opacity-50"
            disabled={!hasSelectedTransactions || isDeleting}
            onClick={deleteSelectedTransactions}
            type="button"
          >
            <Icon className="size-4" name="trash" />
            {isDeleting ? "Deleting..." : "Delete selected"}
          </button>
        </div>
      </div>
      <div className="hidden overflow-x-auto lg:block">
        <table className="w-full min-w-[960px] border-collapse text-left">
          <thead>
            <tr className="border-b border-[#c6c6cd]/60 bg-[#f8f9ff]">
              <th className="w-12 px-4 py-3 text-center">
                <input
                  aria-label="Select all visible transactions"
                  checked={allVisibleSelected}
                  className="size-4 rounded border-[#c6c6cd]"
                  disabled={visibleTransactions.length === 0}
                  onChange={toggleAllVisibleTransactions}
                  type="checkbox"
                />
              </th>
              <th className="px-4 py-3"><SortHeader onSort={() => handleSort("date")} sortDirection={sortKey === "date" ? sortDirection : undefined}>Date</SortHeader></th>
              <th className="px-4 py-3"><SortHeader onSort={() => handleSort("type")} sortDirection={sortKey === "type" ? sortDirection : undefined}>Type</SortHeader></th>
              <th className="w-40 px-4 py-3"><SortHeader onSort={() => handleSort("category")} sortDirection={sortKey === "category" ? sortDirection : undefined}>Category</SortHeader></th>
              <th className="px-4 py-3"><SortHeader onSort={() => handleSort("account")} sortDirection={sortKey === "account" ? sortDirection : undefined}>Account</SortHeader></th>
              <th className="px-4 py-3"><SortHeader onSort={() => handleSort("amountType")} sortDirection={sortKey === "amountType" ? sortDirection : undefined}>Amount Type</SortHeader></th>
              <th className="px-4 py-3 text-right"><SortHeader align="right" onSort={() => handleSort("amount")} sortDirection={sortKey === "amount" ? sortDirection : undefined}>Amount</SortHeader></th>
              <th className="px-4 py-3"><SortHeader onSort={() => handleSort("note")} sortDirection={sortKey === "note" ? sortDirection : undefined}>Note</SortHeader></th>
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
            {paginatedTransactions.length > 0 ? (
              paginatedTransactions.map((transaction) => (
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
                    <TransactionTypeBadge transferDirection={transaction.transferDirection} type={transaction.type} />
                  </td>
                  <td className="w-40 px-4 py-4 align-middle">
                    <div className="flex max-w-36 items-center">
                      <CategoryBadge category={transaction.category} />
                    </div>
                  </td>
                  <td className="whitespace-nowrap px-4 py-4 text-[#45464d]">
                    {transaction.account}
                    {transaction.type === "Transfer" && transaction.transferDirection ? <span className="block text-xs font-medium text-[#76777d]">{transaction.transferDirection === "Credit" ? "credit side" : "debit side"}</span> : null}
                  </td>
                  <td className="whitespace-nowrap px-4 py-4 text-[#45464d]">
                    {amountTypeMovementLabel(transaction)}
                  </td>
                  <td className={`whitespace-nowrap px-4 py-4 text-right font-semibold ${amountClass(transaction.type, transaction.transferDirection)}`}>
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
                        item.action === "edit" ? (
                          <Link
                            aria-label={`${item.label} for ${transaction.id}`}
                            className={`grid size-8 place-items-center rounded-full border border-transparent transition hover:border-[#c6c6cd] hover:bg-[#eff4ff] focus-visible:border-[#0058be] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0058be]/20 ${item.tone}`}
                            href={`/transactions/${transaction.id}/edit`}
                            key={item.action}
                            title={item.label}
                          >
                            <Icon className="size-4" name={item.icon} />
                          </Link>
                        ) : (
                          <button
                            aria-label={`${item.label} for ${transaction.id}`}
                            className={`grid size-8 place-items-center rounded-full border border-transparent transition hover:border-[#c6c6cd] hover:bg-[#eff4ff] focus-visible:border-[#0058be] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0058be]/20 ${item.tone}`}
                            disabled={item.action === "reverse" && (reversingTransactionId === transaction.id || reversedTransactionIds.includes(transaction.id))}
                            key={item.action}
                            onClick={() => handleAction(item.action, transaction)}
                            title={item.action === "reverse" && reversedTransactionIds.includes(transaction.id) ? "Reversal created" : item.label}
                            type="button"
                          >
                            <Icon className="size-4" name={item.icon} />
                          </button>
                        )
                      ))}
                    </div>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td className="px-4 py-12 text-center text-sm font-medium text-[#45464d]" colSpan={11}>
                  No transactions match the current filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="grid gap-3 lg:hidden">
        {paginatedTransactions.length > 0 ? (
          paginatedTransactions.map((transaction) => (
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
                  <p className={`amount-value text-sm font-semibold ${amountClass(transaction.type, transaction.transferDirection)}`}>{transaction.amount}</p>
                </div>
              </div>
              <div className="mt-4 flex flex-wrap items-center gap-2">
                <TransactionTypeBadge transferDirection={transaction.transferDirection} type={transaction.type} />
                <CategoryBadge category={transaction.category} />
                <span className="rounded-md border border-[#c6c6cd]/60 px-2.5 py-1 text-xs font-semibold text-[#45464d]">
                  {accountMovementLabel(transaction)}
                </span>
                <span className="rounded-md border border-[#c6c6cd]/60 px-2.5 py-1 text-xs font-semibold text-[#45464d]">
                  {amountTypeMovementLabel(transaction)}
                </span>
              </div>
              <div className="mt-4 flex items-center justify-end gap-1 border-t border-[#c6c6cd]/40 pt-3">
                {transactionActions.map((item) => (
                  item.action === "edit" ? (
                    <Link
                      aria-label={`${item.label} for ${transaction.id}`}
                      className={`grid size-8 place-items-center rounded-full border border-transparent transition hover:border-[#c6c6cd] hover:bg-[#eff4ff] focus-visible:border-[#0058be] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0058be]/20 ${item.tone}`}
                      href={`/transactions/${transaction.id}/edit`}
                      key={item.action}
                      title={item.label}
                    >
                      <Icon className="size-4" name={item.icon} />
                    </Link>
                  ) : (
                    <button
                      aria-label={`${item.label} for ${transaction.id}`}
                      className={`grid size-8 place-items-center rounded-full border border-transparent transition hover:border-[#c6c6cd] hover:bg-[#eff4ff] focus-visible:border-[#0058be] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0058be]/20 ${item.tone}`}
                      disabled={item.action === "reverse" && (reversingTransactionId === transaction.id || reversedTransactionIds.includes(transaction.id))}
                      key={item.action}
                      onClick={() => handleAction(item.action, transaction)}
                      title={item.action === "reverse" && reversedTransactionIds.includes(transaction.id) ? "Reversal created" : item.label}
                      type="button"
                    >
                      <Icon className="size-4" name={item.icon} />
                    </button>
                  )
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
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-4">
          <p className="text-sm text-[#45464d]">
            Showing <span className="font-semibold text-[#0b1c30]">{resultStart}</span> to{" "}
            <span className="font-semibold text-[#0b1c30]">{resultEnd}</span> of{" "}
            <span className="font-semibold text-[#0b1c30]">{visibleTotalResults}</span> results
          </p>
          <label className="inline-flex items-center gap-2 text-sm font-semibold text-[#45464d]">
            Rows
            <select
              className="h-9 rounded-md border border-[#c6c6cd] bg-white px-2 text-sm font-semibold text-[#0b1c30] outline-none transition focus:border-[#2170e4] focus:ring-2 focus:ring-[#2170e4]/20"
              onChange={(event) => {
                setRowsPerPage(Number(event.target.value));
                setCurrentPage(1);
              }}
              value={rowsPerPage}
            >
              {rowsPerPageOptions.map((option) => <option key={option} value={option}>{option}</option>)}
            </select>
          </label>
        </div>
        <nav aria-label="Pagination" className="inline-flex w-fit overflow-hidden rounded-md border border-[#c6c6cd] bg-white shadow-sm">
          <button
            aria-label="Previous page"
            className="grid size-10 place-items-center border-r border-[#c6c6cd] text-[#45464d] transition hover:bg-[#eff4ff] disabled:cursor-not-allowed disabled:opacity-50"
            disabled={effectiveCurrentPage === 1}
            onClick={() => goToPage(effectiveCurrentPage - 1)}
            type="button"
          >
            <Icon className="size-4" name="chevronLeft" />
          </button>
          {paginationItems.map((item) => (
            typeof item === "number" ? (
              <button
                aria-current={item === effectiveCurrentPage ? "page" : undefined}
                className={
                  item === effectiveCurrentPage
                    ? "h-10 min-w-10 border-r border-[#c6c6cd] bg-[#d8e2ff] px-3 text-sm font-semibold text-[#0058be]"
                    : "h-10 min-w-10 border-r border-[#c6c6cd] px-3 text-sm font-semibold text-[#45464d] transition hover:bg-[#eff4ff]"
                }
                key={item}
                onClick={() => goToPage(item)}
                type="button"
              >
                {item}
              </button>
            ) : (
              <span className="grid h-10 min-w-10 place-items-center border-r border-[#c6c6cd] px-3 text-sm text-[#45464d]" key={item}>...</span>
            )
          ))}
          <button
            aria-label="Next page"
            className="grid size-10 place-items-center text-[#45464d] transition hover:bg-[#eff4ff] disabled:cursor-not-allowed disabled:opacity-50"
            disabled={effectiveCurrentPage === pageCount}
            onClick={() => goToPage(effectiveCurrentPage + 1)}
            type="button"
          >
            <Icon className="size-4" name="chevronRight" />
          </button>
        </nav>
      </div>
      <DetailModal
        actions={
          <>
            <Link
              className="inline-flex h-10 items-center gap-2 rounded-md border border-[#c6c6cd] bg-white px-4 text-sm font-semibold text-[#0b1c30] transition hover:bg-[#eff4ff]"
              href={viewedTransaction ? `/transactions/${viewedTransaction.id}/edit` : "/transactions"}
            >
              <Icon className="size-4" name="edit" />
              Edit
            </Link>
            <button
              className="inline-flex h-10 items-center gap-2 rounded-md border border-[#fecaca] bg-white px-4 text-sm font-semibold text-[#b42318] transition hover:bg-[#fff1f0]"
              onClick={() => {
                if (viewedTransaction) {
                  handleAction("delete", viewedTransaction);
                }
              }}
              type="button"
            >
              <Icon className="size-4" name="trash" />
              Delete
            </button>
          </>
        }
        icon="receipt"
        iconClassName="bg-[#eff6ff] text-[#0058be]"
        isOpen={viewedTransaction !== null}
        onClose={() => setViewedTransaction(null)}
        subtitle={viewedTransaction ? `${viewedTransaction.date} · ${viewedTransaction.account}` : undefined}
        title={viewedTransaction ? viewedTransaction.id : "Transaction detail"}
      >
        {viewedTransaction ? (
          <div className="space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-[#c6c6cd]/60 bg-white p-4">
              <div className="flex flex-wrap items-center gap-2">
                <TransactionTypeBadge transferDirection={viewedTransaction.transferDirection} type={viewedTransaction.type} />
                <CategoryBadge category={viewedTransaction.category} />
              </div>
              <p className={`amount-value text-lg font-bold ${amountClass(viewedTransaction.type, viewedTransaction.transferDirection)}`}>{viewedTransaction.amount}</p>
            </div>
            <DetailModalSection title="Transaction information">
              <DetailModalField label="Date" value={viewedTransaction.date} />
              <DetailModalField label="Account" value={viewedTransaction.account} />
              <DetailModalField label="Amount type" value={viewedTransaction.accountAmountType} />
              {viewedTransaction.transferDirection ? <DetailModalField label="Transfer side" value={viewedTransaction.transferDirection} /> : null}
              {viewedTransaction.transferFromAccount ? <DetailModalField label="From account" value={viewedTransaction.transferFromAccount} /> : null}
              {viewedTransaction.transferToAccount ? <DetailModalField label="To account" value={viewedTransaction.transferToAccount} /> : null}
              {viewedTransaction.transferAccountAmountType ? <DetailModalField label="Transfer amount type" value={amountTypeMovementLabel(viewedTransaction)} /> : null}
              <DetailModalField label="Attachment" value={getAttachmentLabel(viewedTransaction.attachment)} />
              <DetailModalField label="Reflects to" value={getImpactLabel(viewedTransaction)} />
            </DetailModalSection>
            <DetailModalSection title="Note">
              <div className="rounded-md border border-[#c6c6cd]/60 bg-[#f8f9ff] px-3 py-3 sm:col-span-2">
                <p className="text-sm font-medium text-[#0b1c30]">{viewedTransaction.note}</p>
              </div>
            </DetailModalSection>
          </div>
        ) : null}
      </DetailModal>
      <DeleteConfirmationDialog
        description="Deleting this transaction will remove it from the transaction list and clear any selected state for this record."
        isOpen={deletingTransaction !== null}
        isPending={isDeleting}
        itemLabel={deletingTransaction ? `${deletingTransaction.id} · ${deletingTransaction.note}` : "Transaction"}
        onCancel={() => setDeletingTransaction(null)}
        onConfirm={confirmDeleteTransaction}
        title="Delete Transaction"
      />
    </section>
  );
}
