import assert from "node:assert/strict";
import test from "node:test";

import { calculateDebtProgressPercent } from "../src/lib/debts/progress.ts";

test("credit-card partial repayments increase progress against all charges", () => {
  assert.equal(calculateDebtProgressPercent(200, 1_000), 20);
  assert.equal(calculateDebtProgressPercent(400, 1_500), 27);
});

test("debt progress handles completion, overpayment, and empty balances", () => {
  assert.equal(calculateDebtProgressPercent(1_000, 1_000), 100);
  assert.equal(calculateDebtProgressPercent(1_500, 1_000), 100);
  assert.equal(calculateDebtProgressPercent(0, 0), 0);
});

test("debt progress does not expose invalid or negative values", () => {
  assert.equal(calculateDebtProgressPercent(Number.NaN, 1_000), 0);
  assert.equal(calculateDebtProgressPercent(-100, 1_000), 0);
  assert.equal(calculateDebtProgressPercent(100, Number.POSITIVE_INFINITY), 0);
});
