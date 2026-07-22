import assert from "node:assert/strict";
import test from "node:test";

import { buildManualFuturePlanningTable, normalizePlanningYears } from "../src/lib/future-planning/manual-table.ts";

function plan(overrides = {}) {
  return {
    account: "Bank",
    accountAmountType: "General",
    accountId: "bank",
    amountValue: 100,
    category: "Food",
    categoryId: "food",
    date: "",
    dateValue: "2026-01-15",
    endDate: "",
    id: crypto.randomUUID(),
    note: "",
    recurrence: "Once",
    relatedEntityId: "",
    relatedEntityLabel: "",
    relatedEntityType: "none",
    status: "Active",
    title: "Plan",
    type: "Expense",
    ...overrides,
  };
}

test("planning years support arbitrary mixed selections", () => {
  assert.deepEqual(normalizePlanningYears([2027, 2026, 2027, Number.NaN]), [2026, 2027]);
  assert.deepEqual(normalizePlanningYears([], 2028), [2028]);
  assert.equal(buildManualFuturePlanningTable([], [], [2026, 2028]).length, 24);
});

test("manual table aggregates active scheduled rows only and keeps savings separate", () => {
  const rows = buildManualFuturePlanningTable([
    plan({ amountValue: 3_000, categoryId: "salary", dateValue: "2026-01-27", type: "Income" }),
    plan({ amountValue: 500, categoryId: "food", dateValue: "2026-01-30" }),
    plan({ amountValue: 200, categoryId: "saving", dateValue: "2026-01-31", relatedEntityId: "goal", relatedEntityType: "savings_goal" }),
    plan({ amountValue: 999, categoryId: "food", dateValue: "2026-01-30", status: "Paused" }),
    plan({ amountValue: 800, categoryId: "food", dateValue: "2027-01-30" }),
  ], [
    { categoryId: "food", direction: "expense", id: "food-col", name: "Food", relatedEntityType: "", sortOrder: 0 },
    { categoryId: "", direction: "saving", id: "saving-col", name: "Goals", relatedEntityType: "savings_goal", sortOrder: 1 },
  ], [2026]);

  assert.equal(rows[0].totalIncome, 3_000);
  assert.equal(rows[0].totalExpense, 500);
  assert.equal(rows[0].totalSaving, 200);
  assert.equal(rows[0].netAmount, 2_300);
  assert.deepEqual(rows[0].columnAmounts, { "food-col": 500, "saving-col": 200 });
  assert.equal(rows[0].plans.length, 3);
});

test("linked module records retain the manually snapshotted plan amount and label", () => {
  const linked = plan({ amountValue: 275, relatedEntityId: "subscription-1", relatedEntityLabel: "Subscription · Cloud storage", relatedEntityType: "subscription" });
  const [january] = buildManualFuturePlanningTable([linked], [
    { categoryId: "", direction: "expense", id: "subscriptions", name: "Subscriptions", relatedEntityType: "subscription", sortOrder: 0 },
  ], [2026]);
  assert.equal(january.columnAmounts.subscriptions, 275);
  assert.equal(january.plans[0].relatedEntityLabel, "Subscription · Cloud storage");
});

test("custom directions override plan classification and neutral plans do not affect net", () => {
  const [january] = buildManualFuturePlanningTable([
    plan({ amountValue: 100, categoryId: "income-override" }),
    plan({ amountValue: 200, categoryId: "saving-override" }),
    plan({ amountValue: 300, categoryId: "expense-override", type: "Income" }),
    plan({ amountValue: 400, categoryId: "neutral-override" }),
    plan({ amountValue: 50, categoryId: "unmatched" }),
  ], [
    { categoryId: "income-override", direction: "income", id: "income", name: "Income override", relatedEntityType: "", sortOrder: 0 },
    { categoryId: "saving-override", direction: "saving", id: "saving", name: "Saving override", relatedEntityType: "", sortOrder: 1 },
    { categoryId: "expense-override", direction: "expense", id: "expense", name: "Expense override", relatedEntityType: "", sortOrder: 2 },
    { categoryId: "neutral-override", direction: "neutral", id: "neutral", name: "Neutral override", relatedEntityType: "", sortOrder: 3 },
  ], [2026]);

  assert.equal(january.totalIncome, 100);
  assert.equal(january.totalSaving, 200);
  assert.equal(january.totalExpense, 350);
  assert.equal(january.netAmount, -450);
  assert.equal(january.columnAmounts.neutral, 400);
});

test("overlapping columns display a plan twice but classify it once by earliest sort order", () => {
  const [january] = buildManualFuturePlanningTable([
    plan({ amountValue: 125, categoryId: "utilities", relatedEntityId: "cloud", relatedEntityType: "subscription" }),
  ], [
    { categoryId: "", direction: "income", id: "linked", name: "Linked subscriptions", relatedEntityType: "subscription", sortOrder: 10 },
    { categoryId: "utilities", direction: "neutral", id: "utilities", name: "Utilities", relatedEntityType: "", sortOrder: 0 },
  ], [2026]);

  assert.deepEqual(january.columnAmounts, { linked: 125, utilities: 125 });
  assert.equal(january.totalIncome, 0);
  assert.equal(january.totalExpense, 0);
  assert.equal(january.totalSaving, 0);
  assert.equal(january.netAmount, 0);
});
