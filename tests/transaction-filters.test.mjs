import assert from "node:assert/strict";
import test from "node:test";

import {
  filterTransactions,
  normalizeTransactionDate,
  sanitizeTransactionFilters,
  transactionFiltersFromFormData,
  updateTransactionFilterSearchParams,
} from "../src/lib/transactions/filters.ts";
import { summarizeTransactionCards } from "../src/lib/ledger.ts";

const options = {
  account: ["Account", "Cash", "Bank"],
  amount: ["Amount", "> MMK 100", "< MMK 100", "MMK 500+"],
  category: ["Category", "Food", "Salary", "Transfer"],
  status: ["Status", "Cleared", "Pending"],
  type: ["Type", "Income", "Expense", "Transfer"],
};

const defaults = {
  account: "Account",
  amount: "Amount",
  category: "Category",
  dateFrom: "2025-07-28",
  dateTo: "2026-07-28",
  fromAccount: "Account",
  search: "",
  status: "Status",
  toAccount: "Account",
  type: "Type",
};

const records = [
  {
    id: "expense",
    title: "Lunch",
    note: "Team meal",
    type: "Expense",
    category: "Food",
    account: "Cash",
    amount: "- MMK 80",
    amountValue: 80,
    date: "15 / 01 / 2026",
    dateValue: "2026-01-15",
    status: "cleared",
  },
  {
    id: "income",
    title: "Payday",
    note: "Monthly pay",
    type: "Income",
    category: "Salary",
    account: "Bank",
    creditCardAccount: "",
    amount: "+ MMK 600",
    amountValue: 600,
    date: "28 / 07 / 2026",
    dateValue: "2026-07-28T00:00:00",
    status: "pending",
  },
  {
    id: "transfer",
    title: "Move funds",
    note: "Wallet top up",
    type: "Transfer",
    category: "Transfer",
    account: "Cash",
    transferAccount: "Bank",
    transferFromAccount: "Cash",
    transferToAccount: "Bank",
    transferDirection: "Debit",
    amount: "MMK 500",
    amountValue: 500,
    date: "01 / 02 / 2026",
    dateValue: "2026-02-01",
    status: "cleared",
  },
];

function ids(overrides) {
  return filterTransactions(records, { ...defaults, ...overrides }).map((record) => record.id);
}

test("normalizes ISO timestamps and displayed transaction dates without timezone parsing", () => {
  assert.equal(normalizeTransactionDate("2026-07-28T23:30:00+06:30"), "2026-07-28");
  assert.equal(normalizeTransactionDate("28 / 07 / 2026"), "2026-07-28");
  assert.equal(normalizeTransactionDate("2026-02-30"), "");
});

test("applies inclusive from and to date filters", () => {
  assert.deepEqual(ids({ dateFrom: "2026-01-15", dateTo: "2026-02-01" }), ["expense", "transfer"]);
  assert.deepEqual(ids({ dateFrom: "2026-07-28", dateTo: "2026-07-28" }), ["income"]);
  assert.deepEqual(ids({ dateFrom: "2026-07-29", dateTo: "2026-08-30" }), []);
});

test("supports either date boundary being cleared for an open-ended range", () => {
  assert.deepEqual(ids({ dateFrom: "", dateTo: "2026-01-15" }), ["expense"]);
  assert.deepEqual(ids({ dateFrom: "2026-02-01", dateTo: "" }), ["income", "transfer"]);
});

test("applies search, category, account, type, status, and amount filters", () => {
  assert.deepEqual(ids({ search: "team meal" }), ["expense"]);
  assert.deepEqual(ids({ category: "Salary" }), ["income"]);
  assert.deepEqual(ids({ account: "Bank" }), ["income"]);
  assert.deepEqual(ids({ type: "Transfer" }), ["transfer"]);
  assert.deepEqual(ids({ status: "Pending" }), ["income"]);
  assert.deepEqual(ids({ amount: "< MMK 100" }), ["expense"]);
  assert.deepEqual(ids({ amount: "MMK 500+" }), ["income", "transfer"]);
});

test("applies transfer from/to filters and searches transfer account names", () => {
  assert.deepEqual(ids({ fromAccount: "Cash", toAccount: "Bank", type: "Transfer" }), ["transfer"]);
  assert.deepEqual(ids({ search: "bank" }), ["income", "transfer"]);
});

test("applies all selected filters together rather than allowing any single match", () => {
  assert.deepEqual(ids({
    account: "Cash",
    amount: "< MMK 100",
    category: "Food",
    dateFrom: "2026-01-01",
    dateTo: "2026-01-31",
    search: "lunch",
    status: "Cleared",
    type: "Expense",
  }), ["expense"]);
  assert.deepEqual(ids({
    account: "Cash",
    amount: "MMK 500+",
    category: "Food",
    dateFrom: "2026-01-01",
    dateTo: "2026-01-31",
    search: "lunch",
    status: "Cleared",
    type: "Expense",
  }), []);
});

test("repairs invalid persisted options and reversed or invalid date ranges", () => {
  assert.deepEqual(
    sanitizeTransactionFilters({
      ...defaults,
      account: "Deleted account",
      amount: "Old threshold",
      dateFrom: "not-a-date",
      status: "Removed status",
    }, options, defaults),
    defaults,
  );

  assert.deepEqual(
    sanitizeTransactionFilters({ ...defaults, dateFrom: "2026-08-01", dateTo: "2026-07-01" }, options, defaults),
    { ...defaults, dateFrom: "2026-07-01", dateTo: "2026-08-01" },
  );

  assert.deepEqual(
    sanitizeTransactionFilters({ ...defaults, dateFrom: "", dateTo: "2026-07-01" }, options, defaults),
    { ...defaults, dateFrom: "", dateTo: "2026-07-01" },
  );
  assert.deepEqual(
    sanitizeTransactionFilters({ ...defaults, dateFrom: "2026-07-01", dateTo: "" }, options, defaults),
    { ...defaults, dateFrom: "2026-07-01", dateTo: "" },
  );
});

test("reads every submitted control and retains hidden conditional filter values", () => {
  const submitted = new Map([
    ["account", "Cash"],
    ["amount", "< MMK 100"],
    ["category", "Food"],
    ["dateFrom", "2026-01-01"],
    ["dateTo", "2026-01-31"],
    ["search", " lunch "],
    ["status", "Cleared"],
    ["type", "Expense"],
  ]);

  assert.deepEqual(
    transactionFiltersFromFormData({ get: (name) => submitted.get(name) ?? null }, defaults),
    {
      ...defaults,
      account: "Cash",
      amount: "< MMK 100",
      category: "Food",
      dateFrom: "2026-01-01",
      dateTo: "2026-01-31",
      search: " lunch ",
      status: "Cleared",
      type: "Expense",
    },
  );
});

test("stores every non-default filter in the URL and removes all filters on reset", () => {
  const activeFilters = {
    account: "Cash",
    amount: "< MMK 100",
    category: "Food",
    dateFrom: "2026-01-01",
    dateTo: "2026-01-31",
    fromAccount: "Cash",
    search: "lunch",
    status: "Cleared",
    toAccount: "Bank",
    type: "Transfer",
  };
  const activeParams = updateTransactionFilterSearchParams(
    new URLSearchParams("unrelated=keep"),
    activeFilters,
    defaults,
  );

  assert.deepEqual(Object.fromEntries(activeParams), {
    account: "Cash",
    amount: "< MMK 100",
    category: "Food",
    dateFrom: "2026-01-01",
    dateTo: "2026-01-31",
    fromAccount: "Cash",
    q: "lunch",
    status: "Cleared",
    toAccount: "Bank",
    type: "Transfer",
    unrelated: "keep",
  });
  assert.equal(
    updateTransactionFilterSearchParams(activeParams, defaults, defaults).toString(),
    "unrelated=keep",
  );
});

test("a custom date range always calculates Net from its displayed Income and Expenses", () => {
  const dateRangeRecords = [
    {
      account: "Bank",
      accountId: "bank",
      amount: "+ MMK 5,000",
      amountValue: 5_000,
      category: "Salary",
      date: "28 / 07 / 2026",
      dateValue: "2026-07-28",
      id: "july-income",
      ledgerMetadata: {},
      status: "cleared",
      title: "Salary",
      type: "Income",
    },
    {
      account: "Bank",
      accountId: "bank",
      amount: "- MMK 1,000",
      amountValue: 1_000,
      category: "Food",
      date: "30 / 08 / 2026",
      dateValue: "2026-08-30",
      id: "visa-payment",
      ledgerMetadata: {
        credit_card_account_id: "visa",
        credit_card_payment: true,
        financial_event: "credit_card_payment",
      },
      status: "cleared",
      title: "Visa repayment",
      type: "Expense",
    },
    {
      account: "Bank",
      accountId: "bank",
      amount: "+ MMK 9,000",
      amountValue: 9_000,
      category: "Salary",
      date: "01 / 09 / 2026",
      dateValue: "2026-09-01",
      id: "september-income",
      ledgerMetadata: {},
      status: "cleared",
      title: "Later salary",
      type: "Income",
    },
  ];
  const filtered = filterTransactions(dateRangeRecords, {
    ...defaults,
    dateFrom: "2026-07-28",
    dateTo: "2026-08-31",
  });
  const summary = summarizeTransactionCards(filtered.map((transaction) => ({
    account_id: transaction.accountId,
    amount: transaction.amountValue,
    metadata: transaction.ledgerMetadata,
    related_entity_id: transaction.relatedEntityId ?? null,
    related_entity_type: transaction.relatedEntityType ?? null,
    status: transaction.status,
    type: transaction.type,
  })));

  assert.deepEqual(summary, {
    expenses: 0,
    financingPayments: 1_000,
    financingReceipts: 0,
    income: 5_000,
    net: 5_000,
  });
  assert.equal(summary.net, summary.income - summary.expenses);
});
