import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migrationPath = new URL("../supabase/migrations/202607180002_derived_financial_views_alignment.sql", import.meta.url);
const historicalReconciliationPath = new URL("../supabase/migrations/202607130001_credit_card_payment_limit_reconciliation.sql", import.meta.url);

test("derived view migration preserves view shape and aligns posted/reversal semantics", async () => {
  const sql = await readFile(migrationPath, "utf8");
  assert.match(sql, /select\s+item\.id as budget_item_id,\s+plan\.id as budget_plan_id,\s+plan\.user_id,\s+plan\.name as budget_name,\s+plan\.period_type,\s+plan\.plan_type,\s+plan\.status as budget_plan_status/is);
  assert.match(sql, /not in \('scheduled', 'cancelled', 'canceled', 'void', 'failed'\)/i);
  assert.match(sql, /entry\.transaction_id is null[\s\S]+entry_transaction\.deleted_at is null/i);
  assert.match(sql, /goal\.saved_amount,\s+goal\.initial_saved_amount,\s+goal\.current_amount/is);
  assert.match(sql, /txn\.transfer_account_id = goal\.account_id[\s\S]+txn\.account_id = goal\.account_id/is);
  assert.equal((sql.match(/alter view public\.[a-z_]+ set \(security_invoker = true\);/gi) ?? []).length, 6);
});

test("historical reconciliation rebuilds incompatible baseline views in dependency order", async () => {
  const sql = await readFile(historicalReconciliationPath, "utf8");
  const dashboardDrop = sql.indexOf("drop view if exists public.v_dashboard_summary;");
  const yearlyDrop = sql.indexOf("drop view if exists public.v_yearly_income_expense;");
  const monthlyDrop = sql.indexOf("drop view if exists public.v_monthly_income_expense;");
  const monthlyCreate = sql.indexOf("create view public.v_monthly_income_expense as");
  const yearlyCreate = sql.indexOf("create view public.v_yearly_income_expense as");
  const dashboardCreate = sql.indexOf("create view public.v_dashboard_summary as");

  assert.ok(dashboardDrop >= 0 && dashboardDrop < yearlyDrop);
  assert.ok(yearlyDrop < monthlyDrop && monthlyDrop < monthlyCreate);
  assert.ok(monthlyCreate < yearlyCreate && yearlyCreate < dashboardCreate);
  assert.match(sql, /date_trunc\('month', transaction_date\)::date as month/i);
  assert.match(sql, /select\s+item\.id as budget_item_id,\s+plan\.id as budget_plan_id,\s+plan\.user_id,\s+plan\.name as budget_name,\s+plan\.period_type,\s+plan\.plan_type,\s+plan\.status as budget_plan_status/is);
  assert.match(sql, /grant select on public\.v_monthly_income_expense to anon, authenticated, service_role;/i);
  assert.match(sql, /grant select on public\.v_dashboard_summary to anon, authenticated, service_role;/i);
});
