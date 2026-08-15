import assert from "node:assert/strict";
import test from "node:test";

import { getDebtListEmptyState, getDebtVisibilityToggleState } from "../src/lib/debts/visibility.ts";

test("paid-debt toggle pressed state means paid debts are included", () => {
  assert.deepEqual(getDebtVisibilityToggleState(true), {
    ariaLabel: "Include completed borrowing and lending records",
    isPressed: false,
    label: "Show completed records",
  });
  assert.deepEqual(getDebtVisibilityToggleState(false), {
    ariaLabel: "Include completed borrowing and lending records",
    isPressed: true,
    label: "Hide completed records",
  });
});

test("distinguishes an all-paid list from a user with no debts", () => {
  assert.deepEqual(getDebtListEmptyState({
    hasAnyDebt: true,
    search: "",
    showActiveOnly: true,
  }), {
    description: "All borrowing and lending records are completed or canceled. Show all records to review their history.",
    title: "No active borrowing or lending",
  });

  assert.deepEqual(getDebtListEmptyState({
    hasAnyDebt: false,
    search: "",
    showActiveOnly: true,
  }), {
    description: "Add borrowing or lending to track payments, returns, and progress.",
    title: "No borrowing or lending yet",
  });
});

test("explains empty search results according to the active filter", () => {
  assert.equal(getDebtListEmptyState({
    hasAnyDebt: true,
    search: "visa",
    showActiveOnly: true,
  }).title, "No matching active records");

  assert.equal(getDebtListEmptyState({
    hasAnyDebt: true,
    search: "visa",
    showActiveOnly: false,
  }).title, "No matching records");
});
