import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migration = await readFile(
  new URL("../supabase/migrations/202607290002_debt_origination_financing_transactions.sql", import.meta.url),
  "utf8",
);

test("legacy debt originations become duplication-safe financing transactions", () => {
  assert.match(migration, /metadata->>'financial_event' = 'debt_origination'/i);
  assert.match(migration, /accounting_class.*financing_payment.*financing_receipt/is);
  assert.match(migration, /txn\.account_id = debt\.payment_account_id/i);
  assert.match(migration, /txn\.transaction_date = debt\.origination_date/i);
  assert.match(migration, /abs\(txn\.amount\) = abs\(debt\.origination_amount\)/i);
  assert.match(migration, /system_managed', true/i);
  assert.doesNotMatch(migration, /delete\s+from\s+public\.(transactions|debts)/i);
});
