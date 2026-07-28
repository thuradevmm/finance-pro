import assert from "node:assert/strict";
import test from "node:test";

import { creditCardDebtName, normalizeCreditCardDebtDisplayName } from "../src/lib/debts/naming.ts";
import {
  debtRepaymentTransactionType,
  normalizeDebtNature,
  normalizeDebtRepaymentFrequency,
} from "../src/lib/debts/nature.ts";

test("credit card debt names do not duplicate the account type", () => {
  assert.equal(creditCardDebtName("Visa Credit Card"), "Visa Credit Card Debt");
  assert.equal(creditCardDebtName("Visa"), "Visa Credit Card Debt");
  assert.equal(normalizeCreditCardDebtDisplayName("Visa Credit Card Credit Card Debt"), "Visa Credit Card Debt");
});

test("legacy lending names become income-linked receivables", () => {
  assert.equal(normalizeDebtNature(undefined, "Lending Dad"), "Lending");
  assert.equal(normalizeDebtNature(undefined, "Lending Mom"), "Lending");
  assert.equal(normalizeDebtNature("borrowing", "Lending Dad"), "Borrowing");
  assert.equal(debtRepaymentTransactionType("Lending"), "Income");
  assert.equal(normalizeDebtRepaymentFrequency("one_time"), "One-time");
});
