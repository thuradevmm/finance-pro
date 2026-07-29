import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const debtFormPath = new URL("../src/features/debts/add-debt-form.tsx", import.meta.url);

test("borrowing and lending require an account amount type and preview the linked transaction", async () => {
  const source = await readFile(debtFormPath, "utf8");

  assert.match(source, /const paymentAccountHasError = showErrors && !selectedPaymentAccount/);
  assert.match(source, /!selectedPaymentAccount \|\| !accountAmountTypeOptions\.includes\(accountAmountType\)/);
  assert.match(source, /accountAmountType,/);
  assert.match(source, /Receiving \/ Payment Account/);
  assert.match(source, /Funding Amount Type/);
  assert.match(source, /Current Linked Transaction/);
  assert.match(source, /Projected After Save/);
});
