import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { futurePlanningDirectionSupportsTransactionType } from "../src/lib/future-planning/transaction-link.ts";

test("future-planning directions map to compatible transaction types", () => {
  assert.equal(futurePlanningDirectionSupportsTransactionType("income", "Income"), true);
  assert.equal(futurePlanningDirectionSupportsTransactionType("income", "Expense"), false);
  assert.equal(futurePlanningDirectionSupportsTransactionType("expense", "Expense"), true);
  assert.equal(futurePlanningDirectionSupportsTransactionType("saving", "Expense"), true);
  assert.equal(futurePlanningDirectionSupportsTransactionType("neutral", "Expense"), true);
  assert.equal(futurePlanningDirectionSupportsTransactionType("expense", "Transfer"), false);
});

test("transaction links are explicit planning-row links rather than transaction-month inference", async () => {
  const [actions, form] = await Promise.all([
    readFile(new URL("../src/app/transactions/actions.ts", import.meta.url), "utf8"),
    readFile(new URL("../src/features/transactions/add-transaction-form.tsx", import.meta.url), "utf8"),
  ]);

  assert.doesNotMatch(actions, /input\.date\.slice\(0,\s*7\).*amount\.period_month\.slice\(0,\s*7\)/s);
  assert.doesNotMatch(form, /option\.periodMonth\.slice\(0,\s*7\).*transactionDate\.slice\(0,\s*7\)/s);
  assert.match(form, /<option key=\{option\.id\} value=\{option\.id\}>/);
});
