import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const debtFormPath = new URL("../src/features/debts/add-debt-form.tsx", import.meta.url);

test("optional standard-debt account selector displays the saved empty state", async () => {
  const source = await readFile(debtFormPath, "utf8");

  assert.match(source, /semanticIsCreditCard[\s\S]*:\s*\["No account", \.\.\.getAccountOptionLabels\(paymentAccounts\)\]/);
  assert.match(source, /semanticIsCreditCard \? "No accounts" : "No account"/);
  assert.match(source, /options=\{paymentAccountOptions\} value=\{paymentAccountValue\}/);
});
