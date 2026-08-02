import assert from "node:assert/strict";
import test from "node:test";

import {
  categoryMonthlyAverages,
  planningControlStatus,
  planningDirectionForCategoryType,
  rollingCompleteMonthKeys,
} from "../src/lib/future-planning/category-controls.ts";

test("planning direction is derived from category type", () => {
  assert.equal(planningDirectionForCategoryType("Income"), "income");
  assert.equal(planningDirectionForCategoryType("Savings Goal"), "saving");
  assert.equal(planningDirectionForCategoryType("Expense"), "expense");
});

test("six-month averages include complete zero-activity months", () => {
  assert.deepEqual(rollingCompleteMonthKeys("2026-08-02"), [
    "2026-02", "2026-03", "2026-04", "2026-05", "2026-06", "2026-07",
  ]);
  const averages = categoryMonthlyAverages([
    { amount: 300, categoryId: "food", dateValue: "2026-02-15" },
    { amount: 300, categoryId: "food", dateValue: "2026-07-01" },
    { amount: 999, categoryId: "food", dateValue: "2026-08-01" },
  ], "2026-08-02");
  assert.equal(averages.get("food"), 100);
});

test("planning controls distinguish spending limits and income targets", () => {
  assert.deepEqual(planningControlStatus(850, 1_000, "expense"), {
    label: "Near limit", remaining: 150, usagePercent: 85,
  });
  assert.equal(planningControlStatus(1_100, 1_000, "expense").label, "Over plan");
  assert.equal(planningControlStatus(900, 1_000, "income").label, "Below target");
  assert.equal(planningControlStatus(0, 0, "saving").label, "Not set");
});
