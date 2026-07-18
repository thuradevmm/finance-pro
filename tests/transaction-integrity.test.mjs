import assert from "node:assert/strict";
import test from "node:test";

import { postedReversalSourceIds, transactionMutationIntegrityError, transactionReversalIntegrityError } from "../src/lib/transactions/integrity.ts";

test("posted reversals are unique and immutable", () => {
  const reversed = postedReversalSourceIds([
    { metadata: { reversed_transaction_id: "source" }, status: "cleared" },
    { metadata: { reversed_transaction_id: "scheduled-source" }, status: "scheduled" },
  ]);
  assert.deepEqual([...reversed], ["source"]);
  assert.match(transactionMutationIntegrityError({ metadata: { reversed_transaction_id: "source" } }, false), /cannot be edited/i);
  assert.match(transactionMutationIntegrityError({}, true), /already been reversed/i);
  assert.match(transactionReversalIntegrityError({ status: "scheduled" }, false), /Only posted/i);
});
