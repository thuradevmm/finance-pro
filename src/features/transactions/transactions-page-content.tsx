"use client";

import { useMemo, useState } from "react";

import { SegmentedTabs } from "@/components/app/segmented-tabs";
import { SummaryCards } from "@/components/app/summary-cards";
import { TransactionsFilters } from "@/features/transactions/transactions-filters";
import { TransactionsTable } from "@/features/transactions/transactions-table";
import { getTransactionSummaries } from "@/lib/transactions/supabase";
import type { Transaction, TransactionFilterOptions, TransactionType } from "@/types/finance";

type TransactionTab = "All" | TransactionType;

type TransactionFiltersState = {
  amount: string;
  account: string;
  category: string;
  dateFrom: string;
  dateTo: string;
  fromAccount: string;
  toAccount: string;
  type: string;
};

type TransactionsPageContentProps = {
  filterOptions: TransactionFilterOptions;
  initialAccountFilter?: string;
  initialCategoryFilter?: string;
  transactions: Transaction[];
};

const transactionTabs: TransactionTab[] = ["All", "Income", "Expense", "Transfer"];

function formatDateInput(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function defaultDateRange() {
  const today = new Date();
  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);

  return {
    dateFrom: formatDateInput(monthStart),
    dateTo: formatDateInput(today),
  };
}

function getInitialFilters(
  filterOptions: TransactionFilterOptions,
  initialAccountFilter?: string,
  initialCategoryFilter?: string,
): TransactionFiltersState {
  const accountFilter =
    initialAccountFilter && filterOptions.account.includes(initialAccountFilter) ? initialAccountFilter : filterOptions.account[0];
  const categoryFilter =
    initialCategoryFilter && filterOptions.category.includes(initialCategoryFilter) ? initialCategoryFilter : filterOptions.category[0];
  const range = defaultDateRange();

  return {
    amount: filterOptions.amount[0],
    account: accountFilter,
    category: categoryFilter,
    dateFrom: range.dateFrom,
    dateTo: range.dateTo,
    fromAccount: filterOptions.account[0],
    toAccount: filterOptions.account[0],
    type: filterOptions.type[0],
  };
}

function parseAmount(value: string) {
  return Number(value.replace(/[^0-9.-]/g, ""));
}

function matchesAmountFilter(transaction: Transaction, amountFilter: string) {
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

function matchesDateFilter(transaction: Transaction, dateFrom: string, dateTo: string) {
  const transactionDate = toDateInputValue(transaction.dateValue ?? transaction.date);
  if (!transactionDate) return false;

  const fromDate = toDateInputValue(dateFrom);
  const toDate = toDateInputValue(dateTo);

  return (!fromDate || transactionDate >= fromDate) && (!toDate || transactionDate <= toDate);
}

function filterTransactions(transactions: Transaction[], filters: TransactionFiltersState) {
  return transactions.filter((transaction) => {
    const matchesCategory = filters.category === "Category" || transaction.category === filters.category;
    const matchesAccount = filters.account === "Account" || transaction.account === filters.account || transaction.transferAccount === filters.account;
    const matchesFromAccount = filters.fromAccount === "Account" || (transaction.type === "Transfer" && transaction.account === filters.fromAccount);
    const matchesToAccount = filters.toAccount === "Account" || (transaction.type === "Transfer" && transaction.transferAccount === filters.toAccount);
    const matchesType = filters.type === "Type" || transaction.type === filters.type;

    return (
      matchesCategory &&
      matchesAccount &&
      matchesFromAccount &&
      matchesToAccount &&
      matchesType &&
      matchesDateFilter(transaction, filters.dateFrom, filters.dateTo) &&
      matchesAmountFilter(transaction, filters.amount)
    );
  });
}

export function TransactionsPageContent({ filterOptions, initialAccountFilter, initialCategoryFilter, transactions }: TransactionsPageContentProps) {
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

  const filteredTransactions = useMemo(() => filterTransactions(transactions, appliedFilters), [appliedFilters, transactions]);
  const filteredSummaries = useMemo(() => getTransactionSummaries(filteredTransactions), [filteredTransactions]);
  const tableKey = useMemo(() => JSON.stringify(appliedFilters), [appliedFilters]);

  function updateDraftFilter(key: keyof TransactionFiltersState, value: string) {
    setDraftFilters((currentFilters) => ({ ...currentFilters, [key]: value }));
  }

  function applyFilters() {
    const nextFilters = {
      ...draftFilters,
      dateFrom: toDateInputValue(draftFilters.dateFrom),
      dateTo: toDateInputValue(draftFilters.dateTo),
    };

    setAppliedFilters(nextFilters);
    setDraftFilters(nextFilters);
    setActiveTab(nextFilters.type === "Type" ? "All" : (nextFilters.type as TransactionTab));
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
      <SummaryCards summaries={filteredSummaries} />
      <TransactionsFilters
        filterOptions={effectiveFilterOptions}
        filters={draftFilters}
        onApply={applyFilters}
        onClear={clearFilters}
        onFilterChange={updateDraftFilter}
      />
      <TransactionsTable key={tableKey} totalResults={filteredTransactions.length} transactions={filteredTransactions} />
    </>
  );
}
