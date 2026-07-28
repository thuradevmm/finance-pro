import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migrationPath = new URL("../supabase/migrations/202607280003_standard_financial_event_reconciliation.sql", import.meta.url);
const migration = await readFile(migrationPath, "utf8");

test("database reports share one canonical operating and financing classifier", () => {
  assert.match(migration, /create or replace view public\.v_transaction_financial_effects/i);
  assert.match(migration, /create or replace view public\.v_monthly_income_expense[\s\S]*from public\.v_transaction_financial_effects/i);
  assert.match(migration, /create or replace view public\.v_monthly_financing_activity[\s\S]*from public\.v_transaction_financial_effects/i);
  assert.match(migration, /create or replace view public\.v_budget_vs_actual[\s\S]*effect\.operating_expense_delta/i);
  assert.match(migration, /operating_income_delta - operating_expense_delta/i);
  assert.match(migration, /financing_receipt_delta - financing_payment_delta/i);
});

test("legacy debt links and paired transfer halves are classified safely", () => {
  assert.match(migration, /related_entity_type = 'debt'/i);
  assert.match(migration, /is_card_payment_flow/i);
  assert.match(migration, /credit_card_activity_reversal/i);
  assert.match(migration, /not is_transfer_credit/i);
});

test("dashboard totals reuse the canonical operating monthly view", () => {
  const dashboardStart = migration.indexOf("create or replace view public.v_dashboard_summary");
  const dashboardSql = migration.slice(dashboardStart);
  assert.match(dashboardSql, /from public\.v_monthly_income_expense/i);
  assert.doesNotMatch(dashboardSql, /dashboard_expense_totals/i);
});
