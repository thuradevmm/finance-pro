import assert from "node:assert/strict";
import test from "node:test";

import { hasAdditionalAutomaticCreditCardDebtImpact } from "../src/lib/transactions/impact.ts";

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
