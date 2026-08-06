import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { futurePlanningDirectionSupportsTransactionType } from "../src/lib/future-planning/transaction-link.ts";

test("future-planning directions map to compatible transaction types", () => {
  assert.equal(futurePlanningDirectionSupportsTransactionType("income", "Income"), true);
  assert.equal(futurePlanningDirectionSupportsTransactionType("income", "Expense"), false);
  assert.equal(futurePlanningDirectionSupportsTransactionType("expense", "Expense"), true);
  assert.equal(futurePlanningDirectionSupportsTransactionType("saving", "Expense"), false);
  assert.equal(futurePlanningDirectionSupportsTransactionType("saving", "Income"), true);
  assert.equal(futurePlanningDirectionSupportsTransactionType("saving", "Transfer"), true);
  assert.equal(futurePlanningDirectionSupportsTransactionType("neutral", "Expense"), true);
  assert.equal(futurePlanningDirectionSupportsTransactionType("expense", "Transfer"), false);
});

test("transaction links use explicit rows and offer only the contextual plan", async () => {
  const [actions, form, contextualOption] = await Promise.all([
    readFile(new URL("../src/app/transactions/actions.ts", import.meta.url), "utf8"),
    readFile(new URL("../src/features/transactions/add-transaction-form.tsx", import.meta.url), "utf8"),
    readFile(new URL("../src/lib/future-planning/transaction-option.ts", import.meta.url), "utf8"),
  ]);

  assert.match(actions, /input\.date\.slice\(0,\s*7\).*amount\.period_month.*slice\(0,\s*7\)/s);
  assert.match(actions, /input\.categoryId !== column\.category_id/);
  assert.match(contextualOption, /option\.periodMonth\.slice\(0,\s*7\) !== input\.date\.slice\(0,\s*7\)/);
  assert.match(contextualOption, /option\.categoryId === input\.categoryId/);
  assert.match(form, /findContextualPlanningOption/);
  assert.match(form, /Apply planned amount/);
  assert.doesNotMatch(form, /Future planning predefined amount/);
  assert.doesNotMatch(form, /<option key=\{option\.id\} value=\{option\.id\}>/);
});
