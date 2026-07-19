import assert from "node:assert/strict";
import test from "node:test";

import {
  accountAvailableAmountForType,
  reconcileAccountAmountTypeDeltas,
} from "../src/lib/accounts/amount-types.ts";

test("legacy transaction amount types reconcile into the active fallback balance", () => {
  const metadata = { amount_types: [{ type: "Operation" }] };
  const deltas = new Map([
    ["Operation", 247_481],
    ["04 Park Royal + ASL", 63_445],
  ]);

  assert.equal(accountAvailableAmountForType(metadata, deltas, "Operation"), 310_926);
});

test("active amount types remain separate while inactive labels use the fallback", () => {
  const amountTypes = [{ type: "Operation" }, { type: "Saving" }];
  const balances = reconcileAccountAmountTypeDeltas(amountTypes, new Map([
    ["Operation", 100],
    ["Saving", 200],
    ["Legacy", 50],
  ]));

  assert.deepEqual(Object.fromEntries(balances), { Operation: 150, Saving: 200 });
});
