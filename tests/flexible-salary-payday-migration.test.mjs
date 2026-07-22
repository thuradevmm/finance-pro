import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migrationUrl = new URL("../supabase/migrations/202607220004_flexible_salary_paydays.sql", import.meta.url);
const actionUrl = new URL("../src/app/salary-periods/actions.ts", import.meta.url);

test("flexible salary payday migration is additive and owner-scoped", async () => {
  const sql = await readFile(migrationUrl, "utf8");

  assert.match(sql, /create table if not exists public\.salary_payday_overrides/i);
  assert.match(sql, /unique \(user_id, salary_month\)/i);
  assert.match(sql, /check \(extract\(day from salary_month\) = 1\)/i);
  assert.match(sql, /metadata jsonb not null default '\{\}'::jsonb/i);
  assert.match(sql, /alter table public\.salary_payday_overrides force row level security/i);
  assert.match(sql, /using \(\(select auth\.uid\(\)\) = user_id\)/i);
  assert.match(sql, /grant select, insert, update, delete on public\.salary_payday_overrides to authenticated/i);
});

test("flexible salary payday migration does not rewrite existing financial data", async () => {
  const sql = await readFile(migrationUrl, "utf8");

  assert.doesNotMatch(
    sql,
    /\b(?:update|delete\s+from|insert\s+into)\s+public\.(?:accounts|categories|transactions|user_settings)\b/i,
  );
  assert.doesNotMatch(sql, /alter table public\.user_settings/i);
});

test("manual payday writes retain provenance metadata", async () => {
  const action = await readFile(actionUrl, "utf8");
  assert.match(action, /metadata: \{ source: "manual" \}/);
});
