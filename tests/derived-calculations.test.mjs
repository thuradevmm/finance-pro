import assert from "node:assert/strict";
import test from "node:test";

import { resolveAssetCurrentValue, resolveAssetPurchaseValue } from "../src/lib/assets/calculations.ts";
import { currentBudgetRecords, inferBudgetEndDate, linkedBudgetEditError } from "../src/lib/budgets/calculations.ts";
import { calculateUsageDuration } from "../src/lib/date-duration.ts";
import { getBudgetComparisons } from "../src/lib/future-planning/budget-comparisons.ts";
import { calculateOpeningCashPosition } from "../src/lib/future-planning/opening-position.ts";
import { calculateLinkedSavingsAmounts, calculateSavingsContributionCapacity, resolveStoredSavingsAmount } from "../src/lib/savings-goals/calculations.ts";
import { annualizedSubscriptionCost, monthlySubscriptionCost, nextSubscriptionBillingDate, subscriptionBillingOccurrence, subscriptionPaymentCoversCycle, subscriptionPaymentIsAfterCutoff } from "../src/lib/subscriptions/calculations.ts";

test("asset zero values remain authoritative while legacy rows can use linked evidence", () => {
  assert.equal(resolveAssetPurchaseValue(0, 0, 500), 0);
  assert.equal(resolveAssetPurchaseValue(0, undefined, 500), 500);
  assert.equal(resolveAssetCurrentValue(0, 700, 1_000), 0);
});

test("budget ranges infer leap month ends and current totals de-duplicate overlapping legacy plans", () => {
  assert.equal(inferBudgetEndDate("2028-02-10", "Monthly"), "2028-02-29");
  const records = [
    { categoryId: "food", endDate: "2028-02-29", period: "Monthly", planStatus: "Active", startDate: "2028-02-01", startDateTimeValue: "2028-02-01T01:00:00" },
    { categoryId: "food", endDate: "2028-02-29", period: "Monthly", planStatus: "Active", startDate: "2028-02-01", startDateTimeValue: "2028-02-01T02:00:00" },
    { categoryId: "food", endDate: "2028-12-31", period: "Yearly", planStatus: "Active", startDate: "2028-01-01", startDateTimeValue: "2028-01-01T00:00:00" },
  ];
  assert.equal(currentBudgetRecords(records, new Date(2028, 1, 10), "Monthly").length, 1);
  assert.equal(currentBudgetRecords(records, new Date(2028, 1, 10), "Yearly").length, 1);
  const linked = [{ transaction_date: "2028-02-15" }];
  assert.match(linkedBudgetEditError("food", { categoryId: "travel", startDate: "2028-02-01", endDate: "2028-02-29" }, linked), /category/i);
  assert.match(linkedBudgetEditError("food", { categoryId: "food", startDate: "2028-02-16", endDate: "2028-02-29" }, linked), /dates/i);
  assert.equal(linkedBudgetEditError("food", { categoryId: "food", startDate: "2028-02-01", endDate: "2028-02-29" }, linked), "");
});

test("Budget Watch uses exact event dates and combined actual plus forecast usage", () => {
  const budget = {
    actualValue: 700,
    alertPercentage: 80,
    amountValue: 1_000,
    category: "Food",
    categoryId: "food",
    endDate: "2028-07-31",
    period: "Monthly",
    planStatus: "Active",
    startDate: "2028-07-20",
    startDateTimeValue: "2028-07-20T00:00:00",
  };
  const rows = [{
    monthKey: "2028-07",
    events: [
      { amount: 900, category: "Food", date: "2028-07-19", kind: "expense" },
      { amount: 100, category: "food", date: "2028-07-20", kind: "expense" },
    ],
  }];
  const [comparison] = getBudgetComparisons([budget], rows);
  assert.equal(comparison.projectedAmount, 100);
  assert.equal(comparison.usagePercent, 80);
  assert.equal(comparison.status, "Watch");
  const [alreadyOver] = getBudgetComparisons([{ ...budget, actualValue: 1_100 }], rows.map((row) => ({ ...row, events: [] })));
  assert.equal(alreadyOver.status, "Needs attention");
  const [cardCreditCovered] = getBudgetComparisons([budget], [{
    monthKey: "2028-07",
    events: [{ amount: 0, budgetAmount: 100, budgetDate: "2028-07-20", category: "Food", date: "2028-08-25", kind: "expense" }],
  }]);
  assert.equal(cardCreditCovered.projectedAmount, 100);
});

test("savings keeps explicit zero, consumes entries once, and signs transfer direction by goal account", () => {
  assert.equal(resolveStoredSavingsAmount({ currentAmount: 900, initialSavedAmount: 800, metadataCurrentAmount: 700, metadataSavedAmount: 600, savedAmount: 0 }), 0);
  const transactions = [
    { id: "incoming", account_id: "bank", transfer_account_id: "saving", related_entity_id: "goal", amount: 200, metadata: { transfer_direction: "debit" }, status: "cleared", type: "transfer" },
    { id: "incoming-credit", account_id: "saving", transfer_account_id: "bank", related_entity_id: "goal", amount: 200, metadata: { transfer_direction: "credit" }, status: "cleared", type: "transfer" },
    { id: "outgoing", account_id: "saving", transfer_account_id: "bank", related_entity_id: "goal", amount: 50, metadata: { transfer_direction: "debit" }, status: "cleared", type: "transfer" },
    { id: "pending", account_id: "bank", transfer_account_id: "saving", related_entity_id: "goal", amount: 777, metadata: { transfer_direction: "debit" }, status: "pending", type: "transfer" },
    { id: "scheduled", account_id: "bank", transfer_account_id: "saving", related_entity_id: "goal", amount: 999, metadata: { transfer_direction: "debit" }, status: "scheduled", type: "transfer" },
    { id: "expense", account_id: "bank", related_entity_id: "goal", amount: 25, metadata: {}, status: "cleared", type: "expense" },
  ];
  const result = calculateLinkedSavingsAmounts([], transactions, new Map([["goal", "saving"]]));
  assert.equal(result.progressByGoalId.get("goal"), 175);
  assert.equal(result.reserveByGoalId.get("goal"), 150);
});

test("savings contribution capacity follows derived linked progress", () => {
  assert.deepEqual(calculateSavingsContributionCapacity({
    contributionAmount: 301,
    linkedSavedAmount: 500,
    storedSavedAmount: 200,
    targetAmount: 1_000,
  }), {
    exceedsRemaining: true,
    isComplete: false,
    remainingAmount: 300,
    savedAmount: 700,
  });
  assert.equal(calculateSavingsContributionCapacity({
    contributionAmount: 1,
    linkedSavedAmount: 800,
    storedSavedAmount: 200,
    targetAmount: 1_000,
  }).isComplete, true);
});

test("opening cash reserves transfers/manual savings but not expense-funded external savings", () => {
  assert.deepEqual(calculateOpeningCashPosition([{ id: "bank", type: "Bank Account", balanceValues: [800] }], [{ accountId: "bank", savedAmount: 0 }]), {
    cashBalance: 800,
    reservedCash: 0,
    spendableCash: 800,
  });
  assert.deepEqual(calculateOpeningCashPosition([{ id: "bank", type: "Bank Account", balanceValues: [1_000] }], [{ accountId: "bank", savedAmount: 200 }]), {
    cashBalance: 1_000,
    reservedCash: 200,
    spendableCash: 800,
  });
});

test("subscription periods preserve anchors and weekly annualization uses 52 weeks", () => {
  assert.equal(annualizedSubscriptionCost(10, "Weekly"), 520);
  assert.equal(monthlySubscriptionCost(10, "Weekly"), 520 / 12);
  assert.equal(subscriptionBillingOccurrence("2028-01-31", "Monthly", 1), "2028-02-29");
  assert.equal(subscriptionBillingOccurrence("2028-01-31", "Monthly", 2), "2028-03-31");
  assert.equal(subscriptionBillingOccurrence("2028-02-29", "Yearly", 1), "2029-02-28");
  assert.equal(nextSubscriptionBillingDate("2028-01-31", "2028-02-29", "Monthly"), "2028-03-31");
  assert.equal(subscriptionPaymentIsAfterCutoff(
    { billingDueDate: "2028-08-01", createdAt: "2028-07-18T10:00:01.000Z", paymentDate: "2028-08-01" },
    "2028-07-18T10:00:00.000Z",
  ), true);
  assert.equal(subscriptionPaymentIsAfterCutoff(
    { billingDueDate: "2028-08-01", createdAt: "2028-07-18T09:59:59.000Z", paymentDate: "2028-08-01" },
    "2028-07-18T10:00:00.000Z",
  ), false);
  assert.equal(subscriptionPaymentIsAfterCutoff(
    { billingDueDate: "2028-01-01", paymentDate: "2028-02-01" },
    "2028-01-31",
  ), false);
  assert.equal(subscriptionPaymentCoversCycle(99.99, 100), false);
  assert.equal(subscriptionPaymentCoversCycle(100, 100), true);
  assert.equal(subscriptionPaymentCoversCycle(110, 100), true);
});

test("future usage dates report Not started instead of a negative duration", () => {
  const nextYear = new Date().getFullYear() + 1;
  assert.equal(calculateUsageDuration(`${nextYear}-01-01`), "Not started");
});
