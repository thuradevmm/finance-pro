"use client";

import { useMemo } from "react";

import { SegmentedTabs } from "@/components/app/segmented-tabs";
import { SummaryCards } from "@/components/app/summary-cards";
import { TransactionsFilters } from "@/features/transactions/transactions-filters";
import { usePersistentFilterState } from "@/hooks/use-persistent-filter-state";
import { TransactionsTable } from "@/features/transactions/transactions-table";
import { getTransactionSummaries, type TransactionRecord } from "@/lib/transactions/supabase";
import type { TransactionFilterOptions, TransactionType } from "@/types/finance";

type TransactionTab = "All" | TransactionType;

type TransactionFiltersState = {
  account: string;
  amount: string;
  category: string;
  dateFrom: string;
  dateTo: string;
  fromAccount: string;
  search: string;
  status: string;
  toAccount: string;
  type: string;
};

type TransactionsPageContentProps = {
  filterOptions: TransactionFilterOptions;
  initialAccountFilter?: string;
  initialCategoryFilter?: string;
  initialDateFrom: string;
  initialDateTo: string;
  initialSearchFilter?: string;
  initialStatusFilter?: string;
  initialTypeFilter?: string;
  restoreSavedFilters?: boolean;
  transactions: TransactionRecord[];
};

const transactionTabs: TransactionTab[] = ["All", "Income", "Expense", "Transfer"];

function formatDateInput(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getInitialFilters(
  filterOptions: TransactionFilterOptions,
  initialAccountFilter?: string,
  initialCategoryFilter?: string,
  initialDateFrom = "",
  initialDateTo = "",
  initialSearchFilter = "",
  initialStatusFilter = "",
  initialTypeFilter = "",
): TransactionFiltersState {
  const accountFilter =
    initialAccountFilter && filterOptions.account.includes(initialAccountFilter) ? initialAccountFilter : filterOptions.account[0];
  const categoryFilter =
    initialCategoryFilter && filterOptions.category.includes(initialCategoryFilter) ? initialCategoryFilter : filterOptions.category[0];

  return {
    account: accountFilter,
    amount: filterOptions.amount[0],
    category: categoryFilter,
    dateFrom: toDateInputValue(initialDateFrom),
    dateTo: toDateInputValue(initialDateTo),
    fromAccount: filterOptions.account[0],
    search: initialSearchFilter,
    status: initialStatusFilter
      ? filterOptions.status.find((option) => option.toLowerCase() === initialStatusFilter.toLowerCase()) ?? filterOptions.status[0]
      : filterOptions.status[0],
    toAccount: filterOptions.account[0],
    type: initialTypeFilter && filterOptions.type.includes(initialTypeFilter) ? initialTypeFilter : filterOptions.type[0],
  };
}

function parseAmount(value: string) {
  return Number(value.replace(/[^0-9.-]/g, ""));
}

function matchesAmountFilter(transaction: TransactionRecord, amountFilter: string) {
  const amount = Math.abs(transaction.amountValue ?? parseAmount(transaction.amount));

  if (amountFilter === "> MMK 100") {
    return amount > 100;
  }

  if (amountFilter === "< MMK 100") {
    return amount < 100;
  }

  if (amountFilter === "MMK 500+") {
    return amount >= 500;
  }

  return true;
}

function toDateInputValue(value: string | undefined) {
  if (!value) return "";
  const trimmedValue = value.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmedValue)) return trimmedValue;

  const parsedDate = new Date(trimmedValue);
  return Number.isNaN(parsedDate.getTime()) ? "" : formatDateInput(parsedDate);
}

function matchesDateFilter(transaction: TransactionRecord, dateFrom: string, dateTo: string) {
  const transactionDate = toDateInputValue(transaction.dateValue ?? transaction.date);
  if (!transactionDate) return false;

  const fromDate = toDateInputValue(dateFrom);
  const toDate = toDateInputValue(dateTo);

  return (!fromDate || transactionDate >= fromDate) && (!toDate || transactionDate <= toDate);
}

function filterTransactions(transactions: TransactionRecord[], filters: TransactionFiltersState) {
  function matchesAffectedAccount(transaction: TransactionRecord, accountFilter: string) {
    if (accountFilter === "Account") return true;
    if (transaction.type === "Transfer" && transaction.transferDirection) return transaction.account === accountFilter;
    return transaction.account === accountFilter
      || transaction.transferAccount === accountFilter
      || transaction.creditCardAccount === accountFilter;
  }

  return transactions.filter((transaction) => {
    const normalizedSearch = filters.search.trim().toLowerCase();
    const searchable = `${transaction.title} ${transaction.note} ${transaction.type} ${transaction.category} ${transaction.account} ${transaction.transferAccount ?? ""} ${transaction.amount} ${transaction.status}`.toLowerCase();
    const matchesAccount = matchesAffectedAccount(transaction, filters.account);
    const matchesCategory = filters.category === "Category" || transaction.category === filters.category;
    const matchesFromAccount = filters.fromAccount === "Account" || (transaction.type === "Transfer" && transaction.transferFromAccount === filters.fromAccount);
    const matchesSearch = normalizedSearch === "" || searchable.includes(normalizedSearch);
    const matchesStatus = filters.status === "Status" || transaction.status === filters.status.toLowerCase();
    const matchesToAccount = filters.toAccount === "Account" || (transaction.type === "Transfer" && transaction.transferToAccount === filters.toAccount);
    const matchesType = filters.type === "Type" || transaction.type === filters.type;

    return (
      matchesAccount &&
      matchesCategory &&
      matchesFromAccount &&
      matchesSearch &&
      matchesStatus &&
      matchesToAccount &&
      matchesType &&
      matchesDateFilter(transaction, filters.dateFrom, filters.dateTo) &&
      matchesAmountFilter(transaction, filters.amount)
    );
  });
}

export function TransactionsPageContent({
  filterOptions,
  initialAccountFilter,
  initialCategoryFilter,
  initialDateFrom,
  initialDateTo,
  initialSearchFilter,
  initialStatusFilter,
  initialTypeFilter,
  restoreSavedFilters = true,
  transactions,
}: TransactionsPageContentProps) {
  const effectiveFilterOptions = useMemo(() => ({
    ...filterOptions,
    category: initialCategoryFilter && !filterOptions.category.includes(initialCategoryFilter)
      ? [filterOptions.category[0], initialCategoryFilter, ...filterOptions.category.slice(1)]
      : filterOptions.category,
  }), [filterOptions, initialCategoryFilter]);
  const initialFilters = useMemo(
    () => getInitialFilters(effectiveFilterOptions, initialAccountFilter, initialCategoryFilter, initialDateFrom, initialDateTo, initialSearchFilter, initialStatusFilter, initialTypeFilter),
    [effectiveFilterOptions, initialAccountFilter, initialCategoryFilter, initialDateFrom, initialDateTo, initialSearchFilter, initialStatusFilter, initialTypeFilter],
  );
  const {
    appliedFilters: filters,
    applyFilters: persistFilters,
    draftFilters,
    resetFilters: resetPersistedFilters,
    setDraftFilters,
  } = usePersistentFilterState("transactions", initialFilters, restoreSavedFilters);
  const activeTab: TransactionTab = filters.type === "Type" ? "All" : filters.type as TransactionTab;

  const filteredTransactions = useMemo(() => filterTransactions(transactions, filters), [filters, transactions]);
  const filteredSummaries = useMemo(() => getTransactionSummaries(filteredTransactions), [filteredTransactions]);

  function updateDraftFilter(key: keyof TransactionFiltersState, value: string) {
    const normalizedValue = key === "dateFrom" || key === "dateTo" ? toDateInputValue(value) : value;

    setDraftFilters((currentFilters) => {
      const nextFilters = { ...currentFilters, [key]: normalizedValue };
      if (key === "dateFrom" && normalizedValue && nextFilters.dateTo && normalizedValue > nextFilters.dateTo) {
        nextFilters.dateTo = normalizedValue;
      }
      if (key === "dateTo" && normalizedValue && nextFilters.dateFrom && normalizedValue < nextFilters.dateFrom) {
        nextFilters.dateFrom = normalizedValue;
      }
      if (key === "type") {
        if (normalizedValue !== "Transfer") {
          nextFilters.fromAccount = effectiveFilterOptions.account[0];
          nextFilters.toAccount = effectiveFilterOptions.account[0];
        } else {
          nextFilters.fromAccount = currentFilters.account === effectiveFilterOptions.account[0] ? currentFilters.fromAccount : currentFilters.account;
          nextFilters.account = effectiveFilterOptions.account[0];
        }
      }
      return nextFilters;
    });
  }

  function handleTabChange(tab: string) {
    const nextTab = tab as TransactionTab;
    const nextType = nextTab === "All" ? "Type" : nextTab;

    function withType(currentFilters: TransactionFiltersState) {
      return {
        ...currentFilters,
        account: nextType === "Transfer" ? effectiveFilterOptions.account[0] : currentFilters.account,
        fromAccount: nextType === "Transfer"
          ? currentFilters.account === effectiveFilterOptions.account[0] ? currentFilters.fromAccount : currentFilters.account
          : effectiveFilterOptions.account[0],
        toAccount: nextType === "Transfer" ? currentFilters.toAccount : effectiveFilterOptions.account[0],
        type: nextType,
      };
    }
    const nextFilters = withType(filters);
    persistFilters(nextFilters);
    setDraftFilters((current) => withType(current));
    replaceFilterUrl(nextFilters);
  }

  function replaceFilterUrl(nextFilters: TransactionFiltersState) {
    if (typeof window === "undefined") return;
    const url = new URL(window.location.href);
    const values: Array<[string, string, string]> = [
      ["account", nextFilters.account, effectiveFilterOptions.account[0]],
      ["category", nextFilters.category, effectiveFilterOptions.category[0]],
      ["dateFrom", nextFilters.dateFrom, ""],
      ["dateTo", nextFilters.dateTo, ""],
      ["q", nextFilters.search.trim(), ""],
      ["status", nextFilters.status, effectiveFilterOptions.status[0]],
      ["type", nextFilters.type, effectiveFilterOptions.type[0]],
    ];
    for (const [key, value, defaultValue] of values) {
      if (!value || value === defaultValue) url.searchParams.delete(key);
      else url.searchParams.set(key, value);
    }
    window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
  }

  function applyFilters() {
    persistFilters(draftFilters);
    replaceFilterUrl(draftFilters);
  }

  function resetFilters() {
    resetPersistedFilters();
    replaceFilterUrl(initialFilters);
  }

  return (
    <>
      <SegmentedTabs activeTab={activeTab} onTabChange={handleTabChange} tabs={transactionTabs} />
      <SummaryCards summaries={filteredSummaries} />
      <TransactionsFilters
        filterOptions={effectiveFilterOptions}
        filters={draftFilters}
        onFilterChange={updateDraftFilter}
        onReset={resetFilters}
        onSearch={applyFilters}
      />
      <TransactionsTable totalResults={filteredTransactions.length} transactions={filteredTransactions} />
    </>
  );
}
