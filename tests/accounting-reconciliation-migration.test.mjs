import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migration = await readFile(
  new URL("../supabase/migrations/202607290001_accounting_class_and_net_worth_reconciliation.sql", import.meta.url),
  "utf8",
);

test("accounting migration preserves legacy inference and supports principal-interest splits", () => {
  assert.match(migration, /accounting_class in \('financing_payment', 'financing_receipt'\)/i);
  assert.match(migration, /related_entity_type = 'debt'/i);
  assert.match(migration, /debt_interest_amount/i);
  assert.match(migration, /amount - debt_interest_amount/i);
  assert.match(migration, /operating_expense_delta/i);
});

test("database reconciliation includes lending and borrowing with an explicit opening bridge", () => {
  assert.match(migration, /create or replace view public\.v_financial_performance_reconciliation/i);
  assert.match(migration, /lending_receivables/i);
  assert.match(migration, /borrowing_liabilities/i);
  assert.match(migration, /opening_position_and_adjustments/i);
  assert.match(migration, /reconciliation_difference/i);
  assert.doesNotMatch(migration, /delete\s+from\s+public\.(transactions|accounts|debts)/i);
});
