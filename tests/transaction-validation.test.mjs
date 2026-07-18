import assert from "node:assert/strict";
import test from "node:test";

import { validateTransactionInput } from "../src/lib/transactions/validation.ts";

const valid = { accountAmountType: "Operation", accountId: "account", amount: 100, categoryId: "category", date: "2026-07-18", relatedEntityId: "", relatedEntityType: "none", status: "cleared", transferAccountAmountType: "", transferAccountId: "", type: "Expense" };

test("transaction validation rejects corrupt numeric, date, and transfer inputs", () => {
  assert.match(validateTransactionInput({ ...valid, amount: Number.NaN }), /finite number/i);
  assert.match(validateTransactionInput({ ...valid, date: "2026-02-30" }), /valid transaction date/i);
  assert.match(validateTransactionInput({ ...valid, type: "Transfer", categoryId: "", transferAccountId: "" }), /destination account/i);
  assert.equal(validateTransactionInput({ ...valid, status: "scheduled" }), "");
});
