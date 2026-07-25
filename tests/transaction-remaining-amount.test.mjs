import assert from "node:assert/strict";
import test from "node:test";

import { calculateTransactionRemainingAmount } from "../src/lib/transactions/remaining-amount.ts";

test("transaction remaining amount projects inflows and outflows", () => {
  assert.equal(calculateTransactionRemainingAmount({
    amount: 250,
    availableAmount: 1_000,
    direction: "outflow",
    reservesBalance: true,
  }), 750);
  assert.equal(calculateTransactionRemainingAmount({
    amount: 250,
    availableAmount: 1_000,
    direction: "inflow",
    reservesBalance: true,
  }), 1_250);
});

test("transaction remaining amount ignores forecast entries and caps credit availability", () => {
  assert.equal(calculateTransactionRemainingAmount({
    amount: 250,
    availableAmount: 1_000,
    direction: "outflow",
    reservesBalance: false,
  }), 1_000);
  assert.equal(calculateTransactionRemainingAmount({
    amount: 250,
    availableAmount: 900,
    direction: "inflow",
    maximumAmount: 1_000,
    reservesBalance: true,
  }), 1_000);
});
