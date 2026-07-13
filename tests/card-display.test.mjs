import assert from "node:assert/strict";
import test from "node:test";

import {
  creditUtilizationPercent,
  formatBillingDay,
  formatCreditUtilization,
  maskCardNumber,
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
