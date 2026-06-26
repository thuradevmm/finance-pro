"use client";

import { useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";

import { SegmentedTabs } from "@/components/app/segmented-tabs";
import { TransactionsFilters } from "@/features/transactions/transactions-filters";
import { TransactionsTable } from "@/features/transactions/transactions-table";
import type { Transaction, TransactionFilterOptions, TransactionType } from "@/types/finance";

type TransactionTab = "All" | TransactionType;

type TransactionFiltersState = {
  amount: string;
  account: string;
  category: string;
  dateFrom: string;
  dateTo: string;
  type: string;
};

type TransactionsPageContentProps = {
  filterOptions: TransactionFilterOptions;
  initialAccountFilter?: string;
  initialCategoryFilter?: string;
  transactions: Transaction[];
};

type SearchableTransactionFiltersState = TransactionFiltersState & {
  search: string;
};

const transactionTabs: TransactionTab[] = ["All", "Income", "Expense", "Transfer"];

function getInitialFilters(
  filterOptions: TransactionFilterOptions,
  initialAccountFilter?: string,
  initialCategoryFilter?: string,
): TransactionFiltersState {
  const accountFilter =
    initialAccountFilter && filterOptions.account.includes(initialAccountFilter) ? initialAccountFilter : filterOptions.account[0];
  const categoryFilter =
    initialCategoryFilter && filterOptions.category.includes(initialCategoryFilter) ? initialCategoryFilter : filterOptions.category[0];

  return {
    amount: filterOptions.amount[0],
    account: accountFilter,
    category: categoryFilter,
    dateFrom: "",
    dateTo: "",
    type: filterOptions.type[0],
  };
}

function parseAmount(value: string) {
  return Number(value.replace(/[^0-9.-]/g, ""));
}

function matchesAmountFilter(transaction: Transaction, amountFilter: string) {
  const amount = Math.abs(parseAmount(transaction.amount));

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

function matchesDateFilter(transaction: Transaction, dateFrom: string, dateTo: string) {
  const transactionTime = new Date(`${transaction.dateValue ?? transaction.date}T00:00:00`).getTime();
  const fromTime = dateFrom ? new Date(`${dateFrom}T00:00:00`).getTime() : Number.NEGATIVE_INFINITY;
  const toTime = dateTo ? new Date(`${dateTo}T23:59:59`).getTime() : Number.POSITIVE_INFINITY;

  return transactionTime >= fromTime && transactionTime <= toTime;
}

function filterTransactions(transactions: Transaction[], filters: SearchableTransactionFiltersState) {
  const normalizedSearch = filters.search.trim().toLowerCase();

  return transactions.filter((transaction) => {
    const searchable = `${transaction.date} ${transaction.type} ${transaction.category} ${transaction.account} ${transaction.accountAmountType} ${transaction.transferAccount ?? ""} ${transaction.transferAccountAmountType ?? ""} ${transaction.amount} ${transaction.note}`.toLowerCase();
    const matchesSearch = normalizedSearch === "" || searchable.includes(normalizedSearch);
    const matchesCategory = filters.category === "Category" || transaction.category === filters.category;
    const matchesAccount = filters.account === "Account" || transaction.account === filters.account || transaction.transferAccount === filters.account;
    const matchesType = filters.type === "Type" || transaction.type === filters.type;

    return (
      matchesSearch &&
      matchesCategory &&
      matchesAccount &&
      matchesType &&
      matchesDateFilter(transaction, filters.dateFrom, filters.dateTo) &&
      matchesAmountFilter(transaction, filters.amount)
    );
  });
}

export function TransactionsPageContent({ filterOptions, initialAccountFilter, initialCategoryFilter, transactions }: TransactionsPageContentProps) {
  const searchParams = useSearchParams();
  const shellSearch = searchParams.get("q") ?? "";
  const effectiveFilterOptions = useMemo(() => ({
    ...filterOptions,
    category: initialCategoryFilter && !filterOptions.category.includes(initialCategoryFilter)
      ? [filterOptions.category[0], initialCategoryFilter, ...filterOptions.category.slice(1)]
      : filterOptions.category,
  }), [filterOptions, initialCategoryFilter]);
  const initialFilters = useMemo(
    () => getInitialFilters(effectiveFilterOptions, initialAccountFilter, initialCategoryFilter),
    [effectiveFilterOptions, initialAccountFilter, initialCategoryFilter],
  );
  const [draftFilters, setDraftFilters] = useState<TransactionFiltersState>(initialFilters);
  const [appliedFilters, setAppliedFilters] = useState<TransactionFiltersState>(initialFilters);
  const [activeTab, setActiveTab] = useState<TransactionTab>("All");

  const filteredTransactions = useMemo(() => filterTransactions(transactions, { ...appliedFilters, search: shellSearch }), [appliedFilters, shellSearch, transactions]);

  function updateDraftFilter(key: keyof TransactionFiltersState, value: string) {
    setDraftFilters((currentFilters) => ({ ...currentFilters, [key]: value }));
    setAppliedFilters((currentFilters) => ({ ...currentFilters, [key]: value }));
    if (key === "type") {
      setActiveTab(value === "Type" ? "All" : (value as TransactionTab));
    }
  }

  function applyFilters() {
    const nextType = draftFilters.type === "Type" ? activeTab : draftFilters.type;
    const nextFilters = { ...draftFilters, type: nextType };

    setAppliedFilters(nextFilters);
    setActiveTab(nextType === "Type" ? "All" : (nextType as TransactionTab));
  }

  function clearFilters() {
    const clearedFilters = getInitialFilters(effectiveFilterOptions);

    setDraftFilters(clearedFilters);
    setAppliedFilters(clearedFilters);
    setActiveTab("All");
  }

  function handleTabChange(tab: string) {
    const nextTab = tab as TransactionTab;
    const nextType = nextTab === "All" ? "Type" : nextTab;
    const nextFilters = { ...appliedFilters, type: nextType };

    setActiveTab(nextTab);
    setDraftFilters((currentFilters) => ({ ...currentFilters, type: nextType }));
    setAppliedFilters(nextFilters);
  }

  return (
    <>
      <SegmentedTabs activeTab={activeTab} onTabChange={handleTabChange} tabs={transactionTabs} />
      <TransactionsFilters
        filterOptions={effectiveFilterOptions}
        filters={draftFilters}
        onApply={applyFilters}
        onClear={clearFilters}
        onFilterChange={updateDraftFilter}
      />
      <TransactionsTable totalResults={filteredTransactions.length} transactions={filteredTransactions} />
    </>
  );
}
