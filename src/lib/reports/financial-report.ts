import { roundCurrencyValue } from "../ledger.ts";
import { transactionStatusIsFinalized } from "../transactions/status.ts";
import type { TransactionRecord } from "../transactions/supabase.ts";

export type FinancialReportGroup = "account" | "category" | "month";

export type FinancialReportRow = {
  credit: number;
  debit: number;
  label: string;
  net: number;
  transactionCount: number;
};

export type FinancialReport = {
  credit: number;
  debit: number;
  excludedMissingRates: number;
  net: number;
  rows: FinancialReportRow[];
  transactionCount: number;
};

function monthLabel(date: string) {
  const value = new Date(`${date.slice(0, 10)}T00:00:00Z`);
  return Number.isNaN(value.getTime())
    ? date.slice(0, 7)
    : new Intl.DateTimeFormat("en-US", { month: "long", timeZone: "UTC", year: "numeric" }).format(value);
}

function groupLabel(transaction: TransactionRecord, group: FinancialReportGroup) {
  if (group === "account") return transaction.account || "Unknown account";
  if (group === "category") return transaction.category || "Uncategorized";
  return monthLabel(transaction.dateValue);
}

export function buildFinancialReport(
  transactions: TransactionRecord[],
  options: { dateFrom?: string; dateTo?: string; group?: FinancialReportGroup } = {},
): FinancialReport {
  const group = options.group ?? "month";
  const filtered = transactions.filter((transaction) => (
    transactionStatusIsFinalized(transaction.status)
    && !transaction.isReversal
    && !transaction.isReversed
    && transaction.type !== "Transfer"
    && (!options.dateFrom || transaction.dateValue >= options.dateFrom)
    && (!options.dateTo || transaction.dateValue <= options.dateTo)
  ));
  const converted = filtered.filter((transaction) => transaction.hasExchangeRate);
  const grouped = new Map<string, FinancialReportRow>();

  for (const transaction of converted) {
    const label = groupLabel(transaction, group);
    const row = grouped.get(label) ?? { credit: 0, debit: 0, label, net: 0, transactionCount: 0 };
    if (transaction.type === "Income") row.credit = roundCurrencyValue(row.credit + transaction.amountBaseValue);
    if (transaction.type === "Expense") row.debit = roundCurrencyValue(row.debit + transaction.amountBaseValue);
    row.net = roundCurrencyValue(row.credit - row.debit);
    row.transactionCount += 1;
    grouped.set(label, row);
  }

  const credit = roundCurrencyValue(converted.reduce((total, transaction) => (
    transaction.type === "Income" ? total + transaction.amountBaseValue : total
  ), 0));
  const debit = roundCurrencyValue(converted.reduce((total, transaction) => (
    transaction.type === "Expense" ? total + transaction.amountBaseValue : total
  ), 0));

  return {
    credit,
    debit,
    excludedMissingRates: filtered.length - converted.length,
    net: roundCurrencyValue(credit - debit),
    rows: [...grouped.values()].sort((left, right) => left.label.localeCompare(right.label)),
    transactionCount: converted.length,
  };
}
