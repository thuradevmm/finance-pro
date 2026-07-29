import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const actionPath = new URL("../src/app/debts/actions.ts", import.meta.url);
const formPath = new URL("../src/features/debts/add-debt-form.tsx", import.meta.url);
const migrationPath = new URL(
  "../supabase/migrations/202607290003_lending_opening_balance_cash_correction.sql",
  import.meta.url,
);

test("new lending setup requires explicit funding and creates a managed financing Debit", async () => {
  const action = await readFile(actionPath, "utf8");
  const form = await readFile(formPath, "utf8");

  assert.match(action, /debtOriginationTransactionType\(input\.nature\)/);
  assert.match(action, /isLending \? "financing_payment" : "financing_receipt"/);
  assert.match(action, /cash_flow_treatment: isLending \? "explicit_funding"/);
  assert.match(action, /lending_funding_confirmed: isLending/);
  assert.match(action, /Select the account that funds this lending record/);
  assert.match(form, /Funding \/ Return Account/);
  assert.match(form, /Saving creates a cleared Debit from this account on the lending date/);
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
