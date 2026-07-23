import assert from "node:assert/strict";
import test from "node:test";

import {
  buildCategoryActivity,
  pageCategoryActivityRows,
  pageCategoryRollupLabels,
  transactionCategoryActivityRows,
} from "../src/lib/categories/rollups.ts";

function emptyInput(overrides = {}) {
  return {
    accounts: [],
    assets: [],
    categoryIdByName: new Map(),
    debts: [],
    savingsGoals: [],
    subscriptions: [],
    transactions: [],
    ...overrides,
  };
}

test("account category rollups use live ledger balances and available card credit", () => {
  const rows = pageCategoryActivityRows(emptyInput({
    accounts: [
      {
        created_at: "2028-01-01T00:00:00Z",
        id: "bank",
        metadata: { category_id: "accounts" },
        type: "bank_account",
      },
      {
        created_at: "2028-01-01T00:00:00Z",
        id: "card",
        metadata: { category_id: "accounts", credit_limit: 5_000 },
        type: "credit_card",
      },
    ],
    transactions: [
      {
        account_id: "bank",
        amount: 5_000,
        category_id: "income",
        id: "income",
        metadata: {},
        related_entity_id: null,
        related_entity_type: null,
        status: "cleared",
        transaction_date: "2028-01-02",
        transfer_account_id: null,
        type: "income",
      },
      {
        account_id: "bank",
        amount: 1_300,
        category_id: "expense",
        id: "expense",
        metadata: {},
        related_entity_id: null,
        related_entity_type: null,
        status: "cleared",
        transaction_date: "2028-01-03",
        transfer_account_id: null,
        type: "expense",
      },
      {
        account_id: "bank",
        amount: 999,
        category_id: "expense",
        id: "scheduled",
        metadata: {},
        related_entity_id: null,
        related_entity_type: null,
        status: "scheduled",
        transaction_date: "2028-01-04",
        transfer_account_id: null,
        type: "expense",
      },
    ],
  }));
  const activity = buildCategoryActivity(rows).get("accounts");

  assert.equal(activity?.total, 8_700);
  assert.equal(activity?.transactionCount, 2);
});

test("page category rollups mirror module fallbacks and ongoing-record semantics", () => {
  const rows = pageCategoryActivityRows(emptyInput({
    assets: [
      {
        category_id: "assets",
        created_at: "2028-01-01T00:00:00Z",
        id: "legacy-asset",
        metadata: {},
        purchase_amount: 0,
        purchase_date: "2028-01-01",
      },
      {
        category_id: "assets",
        created_at: "2028-01-01T00:00:00Z",
        id: "explicit-zero-asset",
        metadata: { purchase_amount: 0 },
        purchase_amount: 0,
        purchase_date: "2028-01-01",
      },
    ],
    debts: [{
      category_id: "debts",
      created_at: "2028-01-01T00:00:00Z",
      id: "card-debt",
      metadata: { auto_credit_card_account_id: "card" },
      payment_account_id: "card",
      repaid_amount: 0,
      start_date: "2028-01-01",
      total_amount: 1_000,
      type: "Credit Card",
    }],
    savingsGoals: [{
      category_id: null,
      created_at: "2028-01-01T00:00:00Z",
      metadata: { category_id: "goals", target_amount: 900 },
      target_amount: 0,
      target_date: "2028-12-31",
    }],
    subscriptions: [
      {
        amount: 120,
        billing_cycle: "Weekly",
        category_id: "subscriptions",
        created_at: "2028-01-01T00:00:00Z",
        metadata: {},
        next_billing_date: "2028-01-08",
        status: "active",
      },
      {
        amount: 0,
        billing_cycle: null,
        category_id: null,
        created_at: "2028-01-01T00:00:00Z",
        metadata: { amount: 1_200, billing_cycle: "yearly", category_id: "subscriptions", status: "expiring" },
        next_billing_date: "2028-12-31",
        status: null,
      },
      {
        amount: 999,
        billing_cycle: "Monthly",
        category_id: "subscriptions",
        created_at: "2028-01-01T00:00:00Z",
        metadata: {},
        next_billing_date: "2028-01-31",
        status: "paused",
      },
    ],
    transactions: [
      {
        account_id: "bank",
        amount: 500,
        category_id: "expense",
        id: "asset-purchase",
        metadata: {},
        related_entity_id: "legacy-asset",
        related_entity_type: "asset",
        status: "cleared",
        transaction_date: "2028-01-01",
        transfer_account_id: null,
        type: "expense",
      },
      {
        account_id: "card",
        amount: 200,
        category_id: "expense",
        id: "card-charge",
        metadata: {
          credit_card_account_id: "card",
          credit_card_debt_id: "card-debt",
          credit_card_debt_impact: "charge",
        },
        related_entity_id: "card-debt",
        related_entity_type: "debt",
        status: "cleared",
        transaction_date: "2028-01-02",
        transfer_account_id: null,
        type: "expense",
      },
    ],
  }));
  const activity = buildCategoryActivity(rows);

  assert.deepEqual(activity.get("assets"), { monthlyAverage: 500, total: 500, transactionCount: 2 });
  assert.deepEqual(activity.get("debts"), { monthlyAverage: 1_200, total: 1_200, transactionCount: 1 });
  assert.deepEqual(activity.get("goals"), { monthlyAverage: 900, total: 900, transactionCount: 1 });
  assert.deepEqual(activity.get("subscriptions"), { monthlyAverage: 620 / 12, total: 620, transactionCount: 2 });
});

test("page category labels match the related module's primary metric", () => {
  assert.deepEqual(pageCategoryRollupLabels, {
    Account: { activity: "Current Balance", count: "Accounts" },
    Asset: { activity: "Purchase Value", count: "Assets" },
    Debt: { activity: "Total Debt", count: "Debts" },
    "Savings Goal": { activity: "Total Target", count: "Goals" },
    Subscription: { activity: "Monthly Cost", count: "Ongoing Subscriptions" },
  });
});

test("transaction category rollups honor the selected date range and exclude transfer pairs", () => {
  const base = {
    account_id: "bank",
    category_id: "expense",
    related_entity_id: null,
    related_entity_type: null,
    status: "cleared",
    transfer_account_id: null,
    type: "expense",
  };
  const rows = transactionCategoryActivityRows([
    { ...base, amount: 300, id: "included", metadata: {}, transaction_date: "2028-01-15" },
    { ...base, amount: 900, id: "too-early", metadata: {}, transaction_date: "2027-12-31" },
    {
      ...base,
      amount: 500,
      id: "legacy-transfer-expense",
      metadata: { transfer_direction: "debit", transfer_group_id: "pair-1" },
      transaction_date: "2028-01-20",
      transfer_account_id: "savings",
    },
    {
      ...base,
      amount: 500,
      category_id: "income",
      id: "legacy-transfer-income",
      metadata: { transfer_direction: "credit", transfer_group_id: "pair-1" },
      transaction_date: "2028-01-20",
      transfer_account_id: "bank",
      type: "income",
    },
  ], { dateFrom: "2028-01-01", dateTo: "2028-03-31" });
  const activity = buildCategoryActivity(rows, { dateFrom: "2028-01-01", dateTo: "2028-03-31" });

  assert.deepEqual(rows, [{ amount: 300, category_id: "expense", date: "2028-01-15" }]);
  assert.deepEqual(activity.get("expense"), { monthlyAverage: 100, total: 300, transactionCount: 1 });
  assert.equal(activity.has("income"), false);
});
