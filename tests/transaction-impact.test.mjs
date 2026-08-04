import assert from "node:assert/strict";
import test from "node:test";

import {
  hasAdditionalAutomaticCreditCardDebtImpact,
  relatedImpactRecordName,
  relatedImpactSupportsTransactionType,
} from "../src/lib/transactions/impact.ts";

test("card-funded standard debt payments disclose the automatic card-debt impact", () => {
  assert.equal(hasAdditionalAutomaticCreditCardDebtImpact(true, {
    type: "debt",
    value: "personal-loan",
  }), true);
});

test("other explicit primary records also disclose the automatic card-debt impact", () => {
  assert.equal(hasAdditionalAutomaticCreditCardDebtImpact(true, {
    type: "subscription",
    value: "subscription",
  }), true);
});

test("the automatic option and an explicit card debt remain single card impacts", () => {
  assert.equal(hasAdditionalAutomaticCreditCardDebtImpact(true, {
    type: "debt",
    value: "",
  }), false);
  assert.equal(hasAdditionalAutomaticCreditCardDebtImpact(true, {
    creditCardDebt: { accountId: "card", accountName: "Visa" },
    type: "debt",
    value: "card-debt",
  }), false);
});

test("unlinked and non-card transactions do not report an additional card impact", () => {
  assert.equal(hasAdditionalAutomaticCreditCardDebtImpact(true, {
    type: "none",
    value: "",
  }), false);
  assert.equal(hasAdditionalAutomaticCreditCardDebtImpact(false, {
    type: "debt",
    value: "personal-loan",
  }), false);
});

test("manual impact choices are limited to compatible transaction types", () => {
  const subscription = { label: "Subscription: Internet", type: "subscription", value: "internet" };
  const savingsGoal = { label: "Savings Goal: Emergency", type: "savings_goal", value: "emergency" };
  const borrowing = { debtRepaymentType: "Expense", label: "Borrowing: Car", type: "debt", value: "car" };
  const lending = { debtRepaymentType: "Income", label: "Lending: Friend", type: "debt", value: "friend" };

  assert.equal(relatedImpactSupportsTransactionType(subscription, "Expense"), true);
  assert.equal(relatedImpactSupportsTransactionType(subscription, "Income"), false);
  assert.equal(relatedImpactSupportsTransactionType(savingsGoal, "Transfer"), true);
  assert.equal(relatedImpactSupportsTransactionType(borrowing, "Transfer"), true);
  assert.equal(relatedImpactSupportsTransactionType(lending, "Transfer"), false);
  assert.equal(relatedImpactSupportsTransactionType(lending, "Income"), true);
});

test("manual impact record names omit their repeated page prefix", () => {
  assert.equal(relatedImpactRecordName({ label: "Savings Goal: Emergency Fund", type: "savings_goal", value: "goal" }), "Emergency Fund");
  assert.equal(relatedImpactRecordName({ label: "No linked record", type: "none", value: "" }), "No linked record");
});

test("transaction impact UI separates automatic effects from the optional record picker", async () => {
  const { readFile } = await import("node:fs/promises");
  const form = await readFile(new URL("../src/features/transactions/add-transaction-form.tsx", import.meta.url), "utf8");

  assert.match(form, /Automatic credit-card impact/);
  assert.match(form, /No additional link/);
  assert.match(form, /1\. Choose what to update/);
  assert.match(form, /2\. Choose/);
  assert.match(form, /impactSelectionMissing/);
  assert.match(form, /Choose a record or select No additional link/);
  assert.doesNotMatch(form, /Reflect To Page/);
  assert.doesNotMatch(form, /label=\{hasSecondaryCreditCardDebtImpact/);
});

test("subscription payments derive the realized exchange rate from the actual paid amount", async () => {
  const { readFile } = await import("node:fs/promises");
  const [form, actions] = await Promise.all([
    readFile(new URL("../src/features/transactions/add-transaction-form.tsx", import.meta.url), "utf8"),
    readFile(new URL("../src/app/transactions/actions.ts", import.meta.url), "utf8"),
  ]);

  assert.match(form, /subscriptionPaymentBaseAmountValue \/ subscriptionPaymentBilledAmountValue/);
  assert.match(form, /Enter the amount actually paid/);
  assert.doesNotMatch(form, /Payment Exchange Rate/);
  assert.match(actions, /paymentAmount \/ billedAmount/);
  assert.doesNotMatch(actions, /Subscription payment must be at least/);
});

test("asset forms delegate financial values to linked transactions", async () => {
  const { readFile } = await import("node:fs/promises");
  const [form, addPage] = await Promise.all([
    readFile(new URL("../src/features/assets/add-asset-form.tsx", import.meta.url), "utf8"),
    readFile(new URL("../src/app/transactions/add/page.tsx", import.meta.url), "utf8"),
  ]);

  assert.match(form, /Automatic financial values/);
  assert.doesNotMatch(form, /label="Purchase Amount"/);
  assert.doesNotMatch(form, /label="Current Value"/);
  assert.match(addPage, /requestedAssetId/);
  assert.match(addPage, /relatedEntityType: "asset"/);
});
