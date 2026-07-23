import assert from "node:assert/strict";
import test from "node:test";

import { buildManualFuturePlanningTable, normalizePlanningYears } from "../src/lib/future-planning/manual-table.ts";

const columns = [
  { direction: "income", id: "salary", name: "Salary", sortOrder: 0 },
  { direction: "income", id: "freelance", name: "Freelance", sortOrder: 1 },
  { direction: "expense", id: "rent", name: "Rent", sortOrder: 2 },
  { direction: "saving", id: "reserve", name: "Reserve", sortOrder: 3 },
];

test("planning years support arbitrary mixed selections", () => {
  assert.deepEqual(normalizePlanningYears([2027, 2026, 2027, Number.NaN]), [2026, 2027]);
  assert.deepEqual(normalizePlanningYears([], 2028), [2028]);
  assert.equal(buildManualFuturePlanningTable([], [], [2026, 2028]).length, 24);
});

test("manual amounts provide multiple types under income, expense, and saving totals", () => {
  const [january] = buildManualFuturePlanningTable([], columns, [2026], [
    { actualAmount: 2_900, amount: 3_000, columnId: "salary", id: "a", periodMonth: "2026-01-01" },
    { actualAmount: 700, amount: 500, columnId: "freelance", id: "b", periodMonth: "2026-01-01" },
    { actualAmount: 950, amount: 1_000, columnId: "rent", id: "c", periodMonth: "2026-01-01" },
    { actualAmount: 450, amount: 400, columnId: "reserve", id: "d", periodMonth: "2026-01-01" },
  ]);

  assert.equal(january.totalIncome, 3_500);
  assert.equal(january.totalExpense, 1_000);
  assert.equal(january.totalSaving, 400);
  assert.equal(january.netAmount, 2_100);
  assert.equal(january.actualIncome, 3_600);
  assert.equal(january.actualExpense, 950);
  assert.equal(january.actualSaving, 450);
  assert.equal(january.actualNetAmount, 2_200);
  assert.deepEqual(january.columnAmounts, { freelance: 500, rent: 1_000, reserve: 400, salary: 3_000 });
  assert.deepEqual(january.actualColumnAmounts, { freelance: 700, rent: 950, reserve: 450, salary: 2_900 });
});

test("amounts are isolated by month and never inferred from scheduled transactions", () => {
  const fakeScheduledTransaction = {
    amountValue: 999_999,
    dateValue: "2026-01-15",
    status: "Active",
    type: "Income",
  };
  const [january, february] = buildManualFuturePlanningTable([fakeScheduledTransaction], columns, [2026], [
    { actualAmount: 90, amount: 100, columnId: "freelance", id: "jan", periodMonth: "2026-01-01" },
    { actualAmount: 120, amount: 110, columnId: "freelance", id: "feb", periodMonth: "2026-02-01" },
  ]);

  assert.equal(january.totalIncome, 100);
  assert.equal(february.totalIncome, 110);
  assert.equal(january.plans.length, 1);
});
