import assert from "node:assert/strict";
import test from "node:test";

import { getDebtListEmptyState, getDebtVisibilityToggleState } from "../src/lib/debts/visibility.ts";

test("paid-debt toggle pressed state means paid debts are included", () => {
  assert.deepEqual(getDebtVisibilityToggleState(true), {
    ariaLabel: "Include paid debts",
    isPressed: false,
    label: "Show paid debts",
  });
  assert.deepEqual(getDebtVisibilityToggleState(false), {
    ariaLabel: "Include paid debts",
    isPressed: true,
    label: "Hide paid debts",
  });
});

test("distinguishes an all-paid list from a user with no debts", () => {
  assert.deepEqual(getDebtListEmptyState({
    hasAnyDebt: true,
    search: "",
    showActiveOnly: true,
  }), {
    description: "All liabilities are paid. Show paid debts to review their repayment history.",
    title: "No active debts",
  });

  assert.deepEqual(getDebtListEmptyState({
    hasAnyDebt: false,
    search: "",
    showActiveOnly: true,
  }), {
    description: "Add a debt to track repayment progress.",
    title: "No debts yet",
  });
});

test("explains empty search results according to the active filter", () => {
  assert.equal(getDebtListEmptyState({
    hasAnyDebt: true,
    search: "visa",
    showActiveOnly: true,
  }).title, "No matching active debts");

  assert.equal(getDebtListEmptyState({
    hasAnyDebt: true,
    search: "visa",
    showActiveOnly: false,
  }).title, "No matching debts");
});
