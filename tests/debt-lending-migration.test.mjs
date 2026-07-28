import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migrationPath = new URL("../supabase/migrations/202607280001_debt_lending_one_time_and_dashboard_cashflow.sql", import.meta.url);
const lendingCorrectionPath = new URL("../supabase/migrations/202607280002_legacy_lending_name_inference_correction.sql", import.meta.url);

test("debt migration upgrades lending, card names, paid status, and dashboard cash expense", async () => {
  const sql = await readFile(migrationPath, "utf8");
  assert.match(sql, /jsonb_build_object\('debt_nature', 'lending'\)/i);
  assert.match(sql, /Credit\\s\+Card\)\{2,\}/i);
  assert.match(sql, /from public\.v_debt_progress as progress/i);
  assert.match(sql, /progress\.remaining_amount <= 0\.005/i);
  assert.match(sql, /dashboard_expense_totals/i);
  assert.match(sql, /lower\(txn\.type\) = 'expense'/i);
});

test("legacy lending inference uses PostgreSQL-compatible boundaries", async () => {
  const sql = await readFile(lendingCorrectionPath, "utf8");
  assert.match(sql, /\^\\s\*lend\(ing\|t\)\?\(\\s\|\$\)/i);
});
