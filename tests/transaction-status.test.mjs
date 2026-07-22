import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  canonicalTransactionStatuses,
  normalizeTransactionStatus,
  transactionStatusCanBeReversed,
  transactionStatusFilterLabels,
  transactionStatusIsFinalized,
  transactionStatusIsForecast,
  transactionStatusReservesWorkingBalance,
} from "../src/lib/transactions/status.ts";

const migrationPath = new URL("../supabase/migrations/202607220002_transaction_status_semantics.sql", import.meta.url);

test("canonical transaction status separates working balance, actuals, and forecasts", () => {
  assert.equal(normalizeTransactionStatus("Posted"), "cleared");
  assert.equal(transactionStatusIsFinalized("cleared"), true);
  assert.equal(transactionStatusCanBeReversed("pending"), false);
  assert.equal(transactionStatusReservesWorkingBalance("pending"), true);
  assert.equal(transactionStatusReservesWorkingBalance("legacy-review"), true);
  assert.equal(transactionStatusIsFinalized("legacy-review"), false);
  assert.equal(transactionStatusIsForecast("scheduled"), true);
  for (const status of ["scheduled", "cancelled", "void", "failed"]) {
    assert.equal(transactionStatusReservesWorkingBalance(status), false);
    assert.equal(transactionStatusIsFinalized(status), false);
  }
});

test("transaction status filters expose every canonical status", () => {
  assert.equal(transactionStatusFilterLabels().length, canonicalTransactionStatuses.length);
  assert.deepEqual(transactionStatusFilterLabels(), [
    "Cleared",
    "Pending",
    "Scheduled",
    "Cancelled",
    "Void",
    "Failed",
    "Unknown",
  ]);
});

test("status migration keeps pending in accounts and cleared-only in actual views", async () => {
  const sql = await readFile(migrationPath, "utf8");
  assert.match(sql, /create or replace function public\.transaction_status_is_finalized/);
  assert.match(sql, /create or replace function public\.transaction_status_reserves_working_balance/);
  assert.match(sql, /v_account_balances[\s\S]*transaction_status_reserves_working_balance\(status\)/);
  assert.match(sql, /v_monthly_income_expense[\s\S]*transaction_status_is_finalized\(txn\.status\)/);
  assert.match(sql, /v_budget_vs_actual[\s\S]*transaction_status_is_finalized\(txn\.status\)/);
  assert.match(sql, /v_savings_goal_progress[\s\S]*transaction_status_is_finalized\(entry_transaction\.status\)/);
  assert.match(sql, /v_debt_progress[\s\S]*transaction_status_is_finalized\(txn\.status\)/);
  assert.match(sql, /create trigger prevent_duplicate_transaction_reversal\s+before insert or update of metadata, status, deleted_at/);
});
