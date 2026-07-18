import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migrationPath = new URL("../supabase/migrations/202607180003_debt_transaction_progress_alignment.sql", import.meta.url);
const dashboardMigrationPath = new URL("../supabase/migrations/202607180004_dashboard_debt_status_alignment.sql", import.meta.url);

test("debt progress migration cancels reversals and permits exactly one transfer reversal pair", async () => {
  const sql = await readFile(migrationPath, "utf8");
  assert.match(sql, /reversed_groups[\s\S]+effective_transactions/i);
  assert.match(sql, /reversal_group_id[\s\S]+lower\(coalesce\(existing\.type, ''\)\) = 'transfer'/i);
  assert.match(sql, /select count\(\*\)[\s\S]+\) >= 2/i);
  assert.match(sql, /duplicate_transaction_reversal/i);
});

test("dashboard migration counts calculated debt status", async () => {
  const sql = await readFile(dashboardMigrationPath, "utf8");
  assert.match(sql, /create or replace view public\.v_dashboard_summary[\s\S]+from public\.v_debt_progress[\s\S]+where lower\(status\) <> 'paid'/i);
  assert.match(sql, /alter view public\.v_dashboard_summary set \(security_invoker = true\);[\s\S]+grant select on public\.v_dashboard_summary/i);
});
