"use client";

import { useMemo } from "react";

import { SegmentedTabs } from "@/components/app/segmented-tabs";
import { TransactionsFilters } from "@/features/transactions/transactions-filters";
import { usePersistentFilterState } from "@/hooks/use-persistent-filter-state";
import { TransactionsTable } from "@/features/transactions/transactions-table";
import type { TransactionRecord } from "@/lib/transactions/supabase";
import {
  filterTransactions,
  normalizeTransactionDate,
  sanitizeTransactionFilters,
  updateTransactionFilterSearchParams,
  type TransactionFiltersState,
} from "@/lib/transactions/filters";
import type { TransactionFilterOptions, TransactionType } from "@/types/finance";
import { transactionTypeFromLabel, transactionTypeLabel, type TransactionDisplayType } from "@/lib/transactions/terminology";

type TransactionTab = "All" | TransactionDisplayType;

type TransactionsPageContentProps = {
  defaultDateFrom: string;
  defaultDateTo: string;
  filterOptions: TransactionFilterOptions;
  initialAccountFilter?: string;
  initialCategoryFilter?: string;
  initialDateFrom: string;
  initialDateTo: string;
  initialFromAccountFilter?: string;
  initialSearchFilter?: string;
  initialStatusFilter?: string;
  initialToAccountFilter?: string;
  initialTypeFilter?: string;
  restoreSavedFilters?: boolean;
  transactions: TransactionRecord[];
};

const transactionTabs: TransactionTab[] = ["All", "Credit", "Debit", "Transfer"];

function getInitialFilters(
  filterOptions: TransactionFilterOptions,
  initialAccountFilter?: string,
  initialCategoryFilter?: string,
  initialDateFrom = "",
  initialDateTo = "",
  initialFromAccountFilter?: string,
  initialSearchFilter = "",
  initialStatusFilter = "",
  initialToAccountFilter?: string,
  initialTypeFilter = "",
): TransactionFiltersState {
  const normalizedInitialType = initialTypeFilter
    ? transactionTypeLabel(transactionTypeFromLabel(initialTypeFilter) ?? initialTypeFilter as TransactionType)
    : "";
  const accountFilter =
    initialAccountFilter && filterOptions.account.includes(initialAccountFilter) ? initialAccountFilter : filterOptions.account[0];
  const categoryFilter =
    initialCategoryFilter && filterOptions.category.includes(initialCategoryFilter) ? initialCategoryFilter : filterOptions.category[0];

  return {
    account: accountFilter,
    category: categoryFilter,
    dateFrom: normalizeTransactionDate(initialDateFrom),
    dateTo: normalizeTransactionDate(initialDateTo),
    fromAccount: initialFromAccountFilter && filterOptions.account.includes(initialFromAccountFilter) ? initialFromAccountFilter : filterOptions.account[0],
    search: initialSearchFilter,
    status: initialStatusFilter
      ? filterOptions.status.find((option) => option.toLowerCase() === initialStatusFilter.toLowerCase()) ?? filterOptions.status[0]
      : filterOptions.status[0],
    toAccount: initialToAccountFilter && filterOptions.account.includes(initialToAccountFilter) ? initialToAccountFilter : filterOptions.account[0],
    type: normalizedInitialType && filterOptions.type.includes(normalizedInitialType) ? normalizedInitialType : filterOptions.type[0],
  };
}

export function TransactionsPageContent({
  defaultDateFrom,
  defaultDateTo,
  filterOptions,
  initialAccountFilter,
  initialCategoryFilter,
  initialDateFrom,
  initialDateTo,
  initialFromAccountFilter,
  initialSearchFilter,
  initialStatusFilter,
  initialToAccountFilter,
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
    () => getInitialFilters(effectiveFilterOptions, initialAccountFilter, initialCategoryFilter, initialDateFrom, initialDateTo, initialFromAccountFilter, initialSearchFilter, initialStatusFilter, initialToAccountFilter, initialTypeFilter),
    [effectiveFilterOptions, initialAccountFilter, initialCategoryFilter, initialDateFrom, initialDateTo, initialFromAccountFilter, initialSearchFilter, initialStatusFilter, initialToAccountFilter, initialTypeFilter],
  );
  const defaultFilters = useMemo(
    () => getInitialFilters(effectiveFilterOptions, undefined, undefined, defaultDateFrom, defaultDateTo),
    [defaultDateFrom, defaultDateTo, effectiveFilterOptions],
  );
  const normalizeFilters = useMemo(
    () => (value: TransactionFiltersState) => sanitizeTransactionFilters(value, effectiveFilterOptions, initialFilters),
    [effectiveFilterOptions, initialFilters],
  );
  const {
    appliedFilters: filters,
    applyFilters: persistFilters,
    draftFilters,
    setDraftFilters,
  } = usePersistentFilterState("transactions", initialFilters, restoreSavedFilters, normalizeFilters);
  const activeTab: TransactionTab = filters.type === "Type"
    ? "All"
    : transactionTypeLabel(transactionTypeFromLabel(filters.type) ?? filters.type as TransactionType);

  const filteredTransactions = useMemo(() => filterTransactions(transactions, filters), [filters, transactions]);

  function updateDraftFilter(key: keyof TransactionFiltersState, value: string) {
    const normalizedValue = key === "dateFrom" || key === "dateTo" ? normalizeTransactionDate(value) : value;

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
    url.search = updateTransactionFilterSearchParams(url.searchParams, nextFilters, defaultFilters).toString();
    window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
  }

  function applyFilters(nextFilters: TransactionFiltersState) {
    persistFilters(nextFilters);
    replaceFilterUrl(nextFilters);
  }

  function resetFilters() {
    persistFilters(defaultFilters);
    replaceFilterUrl(defaultFilters);
  }

  return (
    <>
      <SegmentedTabs activeTab={activeTab} onTabChange={handleTabChange} tabs={transactionTabs} />
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
