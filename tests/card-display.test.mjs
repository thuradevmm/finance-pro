import assert from "node:assert/strict";
import test from "node:test";

import {
  calculateCreditCardPosition,
  creditUtilizationPercent,
  formatBillingDay,
  formatCreditUtilization,
  maskCardNumber,
  summarizeCreditCardLookup,
} from "../src/lib/accounts/card-display.ts";

import { accountStatusContributesToCurrentTotals } from "../src/lib/accounts/financial-status.ts";
import { accountTypeChangesLedgerMeaning, canonicalAccountType } from "../src/lib/accounts/type-integrity.ts";

test("card numbers expose only the last four characters", () => {
  assert.equal(maskCardNumber("4111 1111 1111 1234"), "•••• •••• •••• 1234");
  assert.equal(maskCardNumber("4111-1111-1111-1234"), "•••• •••• •••• 1234");
  assert.equal(maskCardNumber("1234"), "1234");
  assert.equal(maskCardNumber(""), "Not set");
});

test("credit utilization is based on outstanding debt, not available credit", () => {
  assert.equal(creditUtilizationPercent(2_500, 10_000), 25);
  assert.equal(formatCreditUtilization(3_333, 10_000), "33.3%");
  assert.equal(formatCreditUtilization(-500, 10_000), "0%");
  assert.equal(formatCreditUtilization(500, 0), "0%");
});

test("credit-card position safely handles partial payment, over-limit use, overpayment, and invalid limits", () => {
  assert.deepEqual(calculateCreditCardPosition(600, 1_000), {
    available: 400,
    cardCredit: 0,
    limit: 1_000,
    outstanding: 600,
  });
  assert.deepEqual(calculateCreditCardPosition(1_200, 1_000), {
    available: 0,
    cardCredit: 0,
    limit: 1_000,
    outstanding: 1_200,
  });
  assert.deepEqual(calculateCreditCardPosition(-250, 1_000), {
    available: 1_000,
    cardCredit: 250,
    limit: 1_000,
    outstanding: 0,
  });
  assert.deepEqual(calculateCreditCardPosition(-1.005, 1_000), {
    available: 1_000,
    cardCredit: 1.01,
    limit: 1_000,
    outstanding: 0,
  });
  assert.deepEqual(calculateCreditCardPosition(Number.NaN, -1_000), {
    available: 0,
    cardCredit: 0,
    limit: 0,
    outstanding: 0,
  });
});

test("Needs Review accounts remain in current totals while Archived accounts do not", () => {
  assert.equal(accountStatusContributesToCurrentTotals("Active"), true);
  assert.equal(accountStatusContributesToCurrentTotals("Needs Review"), true);
  assert.equal(accountStatusContributesToCurrentTotals("Archived"), false);
});

test("account type aliases do not look like changes but different ledger families do", () => {
  assert.equal(canonicalAccountType("Bank Account"), "bank_account");
  assert.equal(canonicalAccountType("bank"), "bank_account");
  assert.equal(canonicalAccountType("Cash Wallet"), "cash");
  assert.equal(accountTypeChangesLedgerMeaning("cash_wallet", "cash"), false);
  assert.equal(accountTypeChangesLedgerMeaning("Bank Account", "Digital Wallet"), false);
  assert.equal(accountTypeChangesLedgerMeaning("credit_card", "Bank Account"), true);
});

test("billing days are explicit when configured or missing", () => {
  assert.equal(formatBillingDay(15), "Day 15");
  assert.equal(formatBillingDay(null), "Not set");
});

test("lookup card totals keep limits, liabilities, credits, and activity separate", () => {
  assert.deepEqual(summarizeCreditCardLookup([
    {
      available: 8_000,
      cardCredit: 0,
      charges: 3_000,
      limit: 10_000,
      minimumPayment: 500,
      outstanding: 2_000,
      payments: 1_000,
      transactions: 4,
    },
    {
      available: 5_000,
      cardCredit: 500,
      charges: 250,
      limit: 5_000,
      minimumPayment: 250,
      outstanding: 0,
      payments: 750,
      transactions: 2,
    },
  ]), {
    available: 13_000,
    cardCredit: 500,
    charges: 3_250,
    limit: 15_000,
    minimumPayment: 750,
    netPosition: -1_500,
    outstanding: 2_000,
    payments: 1_750,
    transactions: 6,
  });
});
