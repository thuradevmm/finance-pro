import assert from "node:assert/strict";
import test from "node:test";

import {
  findContextualPlanningOption,
  planningOptionMatchesTransaction,
} from "../src/lib/future-planning/transaction-option.ts";

const options = [
  { amount: 100, categoryId: "food", direction: "expense", id: "food-aug", label: "Food · Aug 2026", periodMonth: "2026-08-01" },
  { amount: 200, categoryId: "food", direction: "expense", id: "food-sep", label: "Food · Sep 2026", periodMonth: "2026-09-01" },
  { amount: 300, categoryId: "salary", direction: "income", id: "salary-aug", label: "Salary · Aug 2026", periodMonth: "2026-08-01" },
  { amount: 400, categoryId: "emergency", direction: "saving", id: "saving-aug", label: "Emergency · Aug 2026", periodMonth: "2026-08-01" },
];

test("finds only the plan matching the transaction category, month, and type", () => {
  assert.equal(findContextualPlanningOption(options, {
    categoryId: "food",
    date: "2026-08-04",
    transactionType: "Expense",
  })?.id, "food-aug");

  assert.equal(findContextualPlanningOption(options, {
    categoryId: "food",
    date: "2026-09-12",
    transactionType: "Expense",
  })?.id, "food-sep");

  assert.equal(findContextualPlanningOption(options, {
    categoryId: "food",
    date: "2026-08-04",
    transactionType: "Income",
  }), undefined);
});

test("shows saving plans only when the linked Savings Goal uses that category", () => {
  const input = {
    categoryId: "food",
    date: "2026-08-04",
    transactionType: "Expense",
  };

  assert.equal(planningOptionMatchesTransaction(options[3], input), false);
  assert.equal(planningOptionMatchesTransaction(options[3], {
    ...input,
    relatedSavingsGoalCategoryId: "emergency",
  }), true);
});
