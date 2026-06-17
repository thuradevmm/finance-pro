"use client";

import { useMemo, useState } from "react";

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
  transactions: Transaction[];
};

const transactionTabs: TransactionTab[] = ["All", "Income", "Expense", "Transfer"];

function getInitialFilters(filterOptions: TransactionFilterOptions, initialAccountFilter?: string): TransactionFiltersState {
  const accountFilter =
    initialAccountFilter && filterOptions.account.includes(initialAccountFilter) ? initialAccountFilter : filterOptions.account[0];

  return {
    amount: filterOptions.amount[0],
    account: accountFilter,
    category: filterOptions.category[0],
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

  if (amountFilter === "> $100") {
    return amount > 100;
  }

  if (amountFilter === "< $100") {
    return amount < 100;
  }

  if (amountFilter === "$500+") {
    return amount >= 500;
  }

  return true;
}

function matchesDateFilter(transaction: Transaction, dateFrom: string, dateTo: string) {
  const transactionTime = new Date(transaction.date).getTime();
  const fromTime = dateFrom ? new Date(`${dateFrom}T00:00:00`).getTime() : Number.NEGATIVE_INFINITY;
  const toTime = dateTo ? new Date(`${dateTo}T23:59:59`).getTime() : Number.POSITIVE_INFINITY;

  return transactionTime >= fromTime && transactionTime <= toTime;
}

function filterTransactions(transactions: Transaction[], filters: TransactionFiltersState) {
  return transactions.filter((transaction) => {
    const matchesCategory = filters.category === "Category" || transaction.category === filters.category;
    const matchesAccount = filters.account === "Account" || transaction.account === filters.account;
    const matchesType = filters.type === "Type" || transaction.type === filters.type;

    return (
      matchesCategory &&
      matchesAccount &&
      matchesType &&
      matchesDateFilter(transaction, filters.dateFrom, filters.dateTo) &&
      matchesAmountFilter(transaction, filters.amount)
    );
  });
}

export function TransactionsPageContent({ filterOptions, initialAccountFilter, transactions }: TransactionsPageContentProps) {
  const initialFilters = useMemo(() => getInitialFilters(filterOptions, initialAccountFilter), [filterOptions, initialAccountFilter]);
  const [draftFilters, setDraftFilters] = useState<TransactionFiltersState>(initialFilters);
  const [appliedFilters, setAppliedFilters] = useState<TransactionFiltersState>(initialFilters);
  const [activeTab, setActiveTab] = useState<TransactionTab>("All");

  const filteredTransactions = useMemo(() => filterTransactions(transactions, appliedFilters), [appliedFilters, transactions]);

  function updateDraftFilter(key: keyof TransactionFiltersState, value: string) {
    setDraftFilters((currentFilters) => ({ ...currentFilters, [key]: value }));
  }

  function applyFilters() {
    const nextType = draftFilters.type === "Type" ? activeTab : draftFilters.type;
    const nextFilters = { ...draftFilters, type: nextType };

    setAppliedFilters(nextFilters);
    setActiveTab(nextType === "Type" ? "All" : (nextType as TransactionTab));
  }

  function clearFilters() {
    const clearedFilters = getInitialFilters(filterOptions);

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
        filterOptions={filterOptions}
        filters={draftFilters}
        onApply={applyFilters}
        onClear={clearFilters}
        onFilterChange={updateDraftFilter}
      />
      <TransactionsTable totalResults={filteredTransactions.length} transactions={filteredTransactions} />
    </>
  );
}
