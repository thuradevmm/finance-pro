import type { TransactionRecord } from "@/lib/transactions/supabase";
import type { TransactionFilterOptions } from "@/types/finance";

export type TransactionFiltersState = {
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

type FilterFormValues = {
  get(name: string): FormDataEntryValue | null;
};

export function transactionFiltersFromFormData(
  formData: FilterFormValues,
  fallback: TransactionFiltersState,
): TransactionFiltersState {
  const value = (name: keyof TransactionFiltersState) => String(formData.get(name) ?? fallback[name]);
  const fromAccount = value("fromAccount");
  const toAccount = value("toAccount");

  return {
    account: value("account"),
    amount: value("amount"),
    category: value("category"),
    dateFrom: value("dateFrom"),
    dateTo: value("dateTo"),
    fromAccount: fromAccount === "From Account" ? "Account" : fromAccount,
    search: value("search"),
    status: value("status"),
    toAccount: toAccount === "To Account" ? "Account" : toAccount,
    type: value("type"),
  };
}

export function updateTransactionFilterSearchParams(
  currentParams: URLSearchParams,
  filters: TransactionFiltersState,
  defaults: TransactionFiltersState,
) {
  const params = new URLSearchParams(currentParams);
  const values: Array<[string, string, string]> = [
    ["account", filters.account, defaults.account],
    ["amount", filters.amount, defaults.amount],
    ["category", filters.category, defaults.category],
    ["dateFrom", filters.dateFrom, defaults.dateFrom],
    ["dateTo", filters.dateTo, defaults.dateTo],
    ["fromAccount", filters.fromAccount, defaults.fromAccount],
    ["q", filters.search.trim(), defaults.search],
    ["status", filters.status, defaults.status],
    ["toAccount", filters.toAccount, defaults.toAccount],
    ["type", filters.type, defaults.type],
  ];

  for (const [key, value, defaultValue] of values) {
    if (!value || value === defaultValue) params.delete(key);
    else params.set(key, value);
  }
  return params;
}

function datePart(value: string | undefined) {
  if (!value) return "";
  const trimmedValue = value.trim();
  const isoMatch = /^(\d{4}-\d{2}-\d{2})(?:[T\s].*)?$/.exec(trimmedValue);
  if (isoMatch) return isoMatch[1];

  const displayMatch = /^(\d{2})\s*\/\s*(\d{2})\s*\/\s*(\d{4})$/.exec(trimmedValue);
  if (displayMatch) return `${displayMatch[3]}-${displayMatch[2]}-${displayMatch[1]}`;

  return "";
}

export function normalizeTransactionDate(value: string | undefined) {
  const normalized = datePart(value);
  if (!normalized) return "";

  const [year, month, day] = normalized.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year
    && date.getUTCMonth() === month - 1
    && date.getUTCDate() === day
    ? normalized
    : "";
}

function parseAmount(value: string) {
  return Number(value.replace(/[^0-9.-]/g, ""));
}

function matchesAmountFilter(transaction: TransactionRecord, amountFilter: string) {
  const amount = Math.abs(transaction.amountValue ?? parseAmount(transaction.amount));

  if (amountFilter === "> MMK 100") return amount > 100;
  if (amountFilter === "< MMK 100") return amount < 100;
  if (amountFilter === "MMK 500+") return amount >= 500;
  return true;
}

function matchesDateFilter(transaction: TransactionRecord, dateFrom: string, dateTo: string) {
  const transactionDate = normalizeTransactionDate(transaction.dateValue ?? transaction.date);
  if (!transactionDate) return false;

  const fromDate = normalizeTransactionDate(dateFrom);
  const toDate = normalizeTransactionDate(dateTo);
  return (!fromDate || transactionDate >= fromDate) && (!toDate || transactionDate <= toDate);
}

function matchesAffectedAccount(transaction: TransactionRecord, accountFilter: string) {
  if (accountFilter === "Account") return true;
  if (transaction.type === "Transfer" && transaction.transferDirection) return transaction.account === accountFilter;
  return transaction.account === accountFilter
    || transaction.transferAccount === accountFilter
    || transaction.creditCardAccount === accountFilter;
}

export function filterTransactions(transactions: TransactionRecord[], filters: TransactionFiltersState) {
  return transactions.filter((transaction) => {
    const normalizedSearch = filters.search.trim().toLowerCase();
    const searchable = [
      transaction.title,
      transaction.note,
      transaction.type,
      transaction.category,
      transaction.account,
      transaction.transferAccount,
      transaction.transferFromAccount,
      transaction.transferToAccount,
      transaction.creditCardAccount,
      transaction.amount,
      transaction.status,
    ].filter(Boolean).join(" ").toLowerCase();

    return (
      matchesAffectedAccount(transaction, filters.account)
      && (filters.category === "Category" || transaction.category === filters.category)
      && (filters.fromAccount === "Account"
        || (transaction.type === "Transfer" && transaction.transferFromAccount === filters.fromAccount))
      && (normalizedSearch === "" || searchable.includes(normalizedSearch))
      && (filters.status === "Status" || transaction.status === filters.status.toLowerCase())
      && (filters.toAccount === "Account"
        || (transaction.type === "Transfer" && transaction.transferToAccount === filters.toAccount))
      && (filters.type === "Type" || transaction.type === filters.type)
      && matchesDateFilter(transaction, filters.dateFrom, filters.dateTo)
      && matchesAmountFilter(transaction, filters.amount)
    );
  });
}

function validOption(value: string, options: string[], fallback: string) {
  return options.includes(value) ? value : fallback;
}

export function sanitizeTransactionFilters(
  filters: TransactionFiltersState,
  filterOptions: TransactionFilterOptions,
  fallback: TransactionFiltersState,
) {
  const dateFrom = filters.dateFrom.trim() === ""
    ? ""
    : normalizeTransactionDate(filters.dateFrom) || fallback.dateFrom;
  const dateTo = filters.dateTo.trim() === ""
    ? ""
    : normalizeTransactionDate(filters.dateTo) || fallback.dateTo;
  const datesAreReversed = Boolean(dateFrom && dateTo && dateFrom > dateTo);

  return {
    account: validOption(filters.account, filterOptions.account, fallback.account),
    amount: validOption(filters.amount, filterOptions.amount, fallback.amount),
    category: validOption(filters.category, filterOptions.category, fallback.category),
    dateFrom: datesAreReversed ? dateTo : dateFrom,
    dateTo: datesAreReversed ? dateFrom : dateTo,
    fromAccount: validOption(filters.fromAccount, filterOptions.account, fallback.fromAccount),
    search: filters.search,
    status: validOption(filters.status, filterOptions.status, fallback.status),
    toAccount: validOption(filters.toAccount, filterOptions.account, fallback.toAccount),
    type: validOption(filters.type, filterOptions.type, fallback.type),
  };
}
