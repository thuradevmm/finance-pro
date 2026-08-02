import assert from "node:assert/strict";
import test from "node:test";

import { assetPurchaseAmountMatchesRange, resolveAssetCurrentValue, resolveAssetPurchaseValue } from "../src/lib/assets/calculations.ts";
import { calculateUsageDuration } from "../src/lib/date-duration.ts";
import { calculateLinkedSavingsAmounts, calculateSavingsContributionCapacity, resolveStoredSavingsAmount } from "../src/lib/savings-goals/calculations.ts";
import { annualizedSubscriptionCost, monthlySubscriptionCost, nextSubscriptionBillingDate, subscriptionBillingOccurrence, subscriptionPaymentCoversCycle, subscriptionPaymentIsAfterCutoff } from "../src/lib/subscriptions/calculations.ts";

test("asset zero values remain authoritative while legacy rows can use linked evidence", () => {
  assert.equal(resolveAssetPurchaseValue(0, 0, 500), 0);
  assert.equal(resolveAssetPurchaseValue(0, undefined, 500), 500);
  assert.equal(resolveAssetCurrentValue(0, 700, 1_000), 0);
});

test("asset history amount ranges are non-overlapping and include the 1,500+ boundary", () => {
  assert.equal(assetPurchaseAmountMatchesRange(499.99, "Under MMK 500"), true);
  assert.equal(assetPurchaseAmountMatchesRange(500, "MMK 500 - 1,500"), true);
  assert.equal(assetPurchaseAmountMatchesRange(1499.99, "MMK 500 - 1,500"), true);
  assert.equal(assetPurchaseAmountMatchesRange(1500, "MMK 500 - 1,500"), false);
  assert.equal(assetPurchaseAmountMatchesRange(1500, "MMK 1,500+"), true);
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
