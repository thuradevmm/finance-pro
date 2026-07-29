import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const actionPath = new URL("../src/app/debts/actions.ts", import.meta.url);
const migrationPath = new URL(
  "../supabase/migrations/202607290003_lending_opening_balance_cash_correction.sql",
  import.meta.url,
);

test("debt setup does not infer a lending cash outflow from the return account", async () => {
  const action = await readFile(actionPath, "utf8");

  assert.match(action, /debtOriginationTransactionType\(input\.nature\)/);
  assert.match(action, /!originationTransactionType/);
  assert.match(action, /accounting_class: "financing_receipt"/);
  assert.doesNotMatch(action, /isLending \? "expense" : "income"/);
});

test("corrective migration retires only inferred system-managed lending originations", async () => {
  const migration = await readFile(migrationPath, "utf8");

  assert.match(migration, /update public\.transactions as txn/i);
  assert.match(migration, /set[\s\S]*deleted_at = coalesce\(txn\.deleted_at, now\(\)\)/i);
  assert.match(migration, /metadata->>'system_managed'.*= 'true'/i);
  assert.match(migration, /metadata->>'financial_event'.*= 'debt_origination'/i);
  assert.match(migration, /metadata->>'debt_nature'.*= 'lending'/i);
  assert.match(migration, /cash_flow_treatment', 'opening_receivable'/i);
  assert.doesNotMatch(migration, /delete\s+from\s+public\.transactions/i);
  assert.doesNotMatch(migration, /debt_nature'.*= 'borrowing'/i);
});
