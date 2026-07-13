"use client";

import { useMemo, useState } from "react";

import { SegmentedTabs } from "@/components/app/segmented-tabs";
import { SummaryCards } from "@/components/app/summary-cards";
import { TransactionsFilters } from "@/features/transactions/transactions-filters";
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
  relatedAccount: string;
  toAccount: string;
  type: string;
};

type TransactionsPageContentProps = {
  filterOptions: TransactionFilterOptions;
  initialAccountFilter?: string;
  initialCategoryFilter?: string;
  transactions: TransactionRecord[];
};

const transactionTabs: TransactionTab[] = ["All", "Income", "Expense", "Transfer"];

function formatDateInput(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function addYears(date: Date, yearCount: number) {
  const nextDate = new Date(date);
  const month = nextDate.getMonth();
  nextDate.setFullYear(nextDate.getFullYear() + yearCount);
  if (nextDate.getMonth() !== month) nextDate.setDate(0);
  return nextDate;
}

function defaultDateRange() {
  const today = new Date();
  return {
    dateFrom: formatDateInput(addYears(today, -1)),
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
    account: accountFilter,
    amount: filterOptions.amount[0],
    category: categoryFilter,
    dateFrom: range.dateFrom,
    dateTo: range.dateTo,
    fromAccount: filterOptions.account[0],
    relatedAccount: accountFilter,
    toAccount: filterOptions.account[0],
    type: filterOptions.type[0],
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
    const matchesAccount = matchesAffectedAccount(transaction, filters.account);
    const matchesCategory = filters.category === "Category" || transaction.category === filters.category;
    const matchesFromAccount = filters.fromAccount === "Account" || (transaction.type === "Transfer" && transaction.transferFromAccount === filters.fromAccount);
    const matchesRelatedAccount = matchesAffectedAccount(transaction, filters.relatedAccount);
    const matchesToAccount = filters.toAccount === "Account" || (transaction.type === "Transfer" && transaction.transferToAccount === filters.toAccount);
    const matchesType = filters.type === "Type" || transaction.type === filters.type;

    return (
      matchesAccount &&
      matchesCategory &&
      matchesFromAccount &&
      matchesRelatedAccount &&
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
  const [filters, setFilters] = useState<TransactionFiltersState>(initialFilters);
  const [activeTab, setActiveTab] = useState<TransactionTab>(initialFilters.type === "Type" ? "All" : (initialFilters.type as TransactionTab));

  const filteredTransactions = useMemo(() => filterTransactions(transactions, filters), [filters, transactions]);
  const filteredSummaries = useMemo(() => getTransactionSummaries(filteredTransactions), [filteredTransactions]);
  const tableKey = useMemo(() => JSON.stringify(filters), [filters]);

  function updateFilter(key: keyof TransactionFiltersState, value: string) {
    const normalizedValue = key === "dateFrom" || key === "dateTo" ? toDateInputValue(value) : value;

    setFilters((currentFilters) => {
      const nextFilters = { ...currentFilters, [key]: normalizedValue };
      if (key === "dateFrom" && normalizedValue && nextFilters.dateTo && normalizedValue > nextFilters.dateTo) {
        nextFilters.dateTo = normalizedValue;
      }
      if (key === "dateTo" && normalizedValue && nextFilters.dateFrom && normalizedValue < nextFilters.dateFrom) {
        nextFilters.dateFrom = normalizedValue;
      }
      if (key === "type") {
        setActiveTab(normalizedValue === "Type" ? "All" : (normalizedValue as TransactionTab));
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

    setActiveTab(nextTab);
    setFilters((currentFilters) => ({
      ...currentFilters,
      account: nextType === "Transfer" ? effectiveFilterOptions.account[0] : currentFilters.account,
      fromAccount: nextType === "Transfer"
        ? currentFilters.account === effectiveFilterOptions.account[0] ? currentFilters.fromAccount : currentFilters.account
        : effectiveFilterOptions.account[0],
      toAccount: nextType === "Transfer" ? currentFilters.toAccount : effectiveFilterOptions.account[0],
      type: nextType,
    }));
  }

  return (
    <>
      <SegmentedTabs activeTab={activeTab} onTabChange={handleTabChange} tabs={transactionTabs} />
      <SummaryCards summaries={filteredSummaries} />
      <TransactionsFilters
        filterOptions={effectiveFilterOptions}
        filters={filters}
        onFilterChange={updateFilter}
      />
      <TransactionsTable key={tableKey} totalResults={filteredTransactions.length} transactions={filteredTransactions} />
    </>
  );
}
