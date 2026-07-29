import assert from "node:assert/strict";
import test from "node:test";

import {
  normalizeReconciliationDateRange,
  reconcileFinancialPosition,
  summarizeNetWorth,
} from "../src/lib/reconciliation.ts";

const accountPosition = {
  cardCredit: 100,
  cardLiability: 500,
  cashBalance: 10_000,
  net: 9_600,
};

const debts = [
  { isCreditCardDebt: true, nature: "Borrowing", remainingBalanceValue: 500, status: "Active" },
  { isCreditCardDebt: false, nature: "Borrowing", remainingBalanceValue: 2_000, status: "Active" },
  { isCreditCardDebt: false, nature: "Lending", remainingBalanceValue: 1_200, status: "Active" },
  { isCreditCardDebt: false, nature: "Borrowing", remainingBalanceValue: 900, status: "Archived" },
];

test("dashboard reconciliation dates default safely and normalize reversed ranges", () => {
  const defaults = { dateFrom: "2025-07-29", dateTo: "2026-07-29" };

  assert.deepEqual(normalizeReconciliationDateRange({}, defaults), defaults);
  assert.deepEqual(
    normalizeReconciliationDateRange({ dateFrom: "2026-08-30", dateTo: "2026-07-28" }, defaults),
    { dateFrom: "2026-07-28", dateTo: "2026-08-30" },
  );
  assert.deepEqual(
    normalizeReconciliationDateRange({ dateFrom: "invalid", dateTo: "2026-07-20" }, defaults),
    { dateFrom: "2025-07-29", dateTo: "2026-07-20" },
  );
});

test("net worth includes lending receivables and standard debts without double-counting cards", () => {
  assert.deepEqual(summarizeNetWorth(accountPosition, debts), {
    borrowingLiabilities: 2_000,
    cardLiabilities: 500,
    cashAndCardCredit: 10_100,
    lendingReceivables: 1_200,
    netWorth: 8_800,
    totalAssets: 11_300,
    totalLiabilities: 2_500,
  });
});

test("historical income and expense reconcile through explicit opening and legacy adjustments", () => {
  assert.deepEqual(reconcileFinancialPosition(accountPosition, debts, {
    expenses: 3_000,
    income: 10_000,
  }), {
    borrowingLiabilities: 2_000,
    cardLiabilities: 500,
    cashAndCardCredit: 10_100,
    difference: 0,
    expenses: 3_000,
    income: 10_000,
    lendingReceivables: 1_200,
    net: 7_000,
    netWorth: 8_800,
    openingPositionAndAdjustments: 1_800,
    reconciledClosingNetWorth: 8_800,
    totalAssets: 11_300,
    totalLiabilities: 2_500,
  });
});
