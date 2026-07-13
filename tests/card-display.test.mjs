import assert from "node:assert/strict";
import test from "node:test";

import {
  creditUtilizationPercent,
  formatBillingDay,
  formatCreditUtilization,
  maskCardNumber,
  summarizeCreditCardLookup,
} from "../src/lib/accounts/card-display.ts";

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
