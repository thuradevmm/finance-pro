import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  dashboardAmountTypeOptions,
  dashboardScopeTransferNet,
  sanitizeDashboardAmountTypes,
  summarizeAccountPositionForAmountTypes,
  transactionMatchesDashboardAmountTypes,
} from "../src/lib/dashboard/amount-type-filter.ts";

const filterSource = readFileSync(new URL("../src/features/dashboard/financial-position-date-filter.tsx", import.meta.url), "utf8");

const account = (overrides) => ({
  balanceBreakdowns: [],
  creditBalanceBaseValue: 0,
  creditUsedBaseValue: 0,
  exchangeRateToBase: 1,
  status: "Active",
  type: "Bank Account",
  ...overrides,
});

test("dashboard amount type options and multi-selection are normalized and deduplicated", () => {
  const accounts = [
    account({ balanceBreakdowns: [{ amountValue: 100, type: "Operation" }, { amountValue: 50, type: "Emergency" }] }),
    account({ type: "Credit Card" }),
  ];
  const options = dashboardAmountTypeOptions(accounts);
  assert.deepEqual(options, ["Credit Card", "Emergency", "Operation"]);
  assert.deepEqual(sanitizeDashboardAmountTypes(["operation", "Emergency", "unknown"], options), ["Operation", "Emergency"]);
  assert.deepEqual(sanitizeDashboardAmountTypes([], options), options);
});

test("dashboard position includes only selected cash buckets and card liabilities", () => {
  const accounts = [
    account({ balanceBreakdowns: [{ amountValue: 100, type: "Operation" }, { amountValue: 50, type: "Emergency" }] }),
    account({ creditBalanceBaseValue: 20, creditUsedBaseValue: 200, type: "Credit Card" }),
  ];
  assert.deepEqual(summarizeAccountPositionForAmountTypes(accounts, ["Emergency"]), {
    cardCredit: 0,
    cardLiability: 0,
    cashBalance: 50,
    net: 50,
  });
  assert.equal(summarizeAccountPositionForAmountTypes(accounts, ["Operation", "Credit Card"]).net, -80);
});

test("transaction matching uses the posted endpoint and scoped transfer net bridges the boundary", () => {
  const debit = { accountAmountType: "Operation", accountId: "bank", amountBaseValue: 300, transferDirection: "Debit", type: "Transfer" };
  const credit = { accountAmountType: "Emergency", accountId: "bank", amountBaseValue: 300, transferDirection: "Credit", type: "Transfer" };
  const selected = [debit, credit].filter((transaction) => transactionMatchesDashboardAmountTypes(transaction, ["Emergency"], new Set()));
  assert.deepEqual(selected, [credit]);
  assert.equal(dashboardScopeTransferNet(selected), 300);
  assert.equal(dashboardScopeTransferNet([debit, credit]), 0);
});

test("dashboard amount types use a compact overlay instead of an expanding chip field", () => {
  assert.match(filterSource, /aria-haspopup="dialog"/);
  assert.match(filterSource, /absolute left-0 top-\[calc\(100%\+0\.5rem\)\]/);
  assert.match(filterSource, /max-h-64 overflow-y-auto/);
  assert.match(filterSource, /Select all/);
  assert.match(filterSource, /selectedCount}\/\{options\.length/);
  assert.doesNotMatch(filterSource, /flex min-h-12 flex-wrap items-center gap-2/);
});
