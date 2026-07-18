import assert from "node:assert/strict";
import test from "node:test";

import { effectiveTransferVolume } from "../src/lib/transactions/summary.ts";

test("a reversal cancels transfer volume even when opposite pair halves are filtered", () => {
  const rows = [
    { id: "source-credit", amountValue: 500, ledgerMetadata: {}, status: "cleared", transferGroupId: "source", type: "Transfer" },
    { id: "reverse-debit", amountValue: 500, ledgerMetadata: { reversed_transaction_id: "source-debit" }, status: "cleared", transferGroupId: "reversal", type: "Transfer" },
  ];
  assert.equal(effectiveTransferVolume(rows), 0);
});

test("paired transfers count once and scheduled groups do not count", () => {
  assert.equal(effectiveTransferVolume([
    { id: "debit", amountValue: 100, status: "cleared", transferGroupId: "group", type: "Transfer" },
    { id: "credit", amountValue: 100, status: "cleared", transferGroupId: "group", type: "Transfer" },
    { id: "scheduled", amountValue: 200, status: "scheduled", transferGroupId: "future", type: "Transfer" },
  ]), 100);
});
