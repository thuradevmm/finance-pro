import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { calculateDebtProgressPercent } from "../src/lib/debts/progress.ts";
import { resolveDebtStoredNumber } from "../src/lib/debts/stored-values.ts";

const backfillMigrationPath = new URL("../supabase/migrations/202607180005_legacy_debt_numeric_backfill.sql", import.meta.url);

test("legacy debt metadata fills zero-valued columns that were never backfilled", () => {
  assert.equal(resolveDebtStoredNumber(0, 400_000), 400_000);
  assert.equal(resolveDebtStoredNumber(0, 100_000), 100_000);
  assert.equal(resolveDebtStoredNumber(0, 12), 12);
});

test("current debt columns stay authoritative once storage locations agree", () => {
  assert.equal(resolveDebtStoredNumber(0, 0), 0);
  assert.equal(resolveDebtStoredNumber(250_000, 400_000), 250_000);
  assert.equal(resolveDebtStoredNumber(null, 75_000), 75_000);
  assert.equal(resolveDebtStoredNumber("invalid", 20_000), 20_000);
});

test("legacy opening plus linked payment yields the correct remaining debt and progress", () => {
  const total = resolveDebtStoredNumber(600_000, 600_000);
  const repaid = resolveDebtStoredNumber(0, 400_000) + 100_000;

  assert.equal(repaid, 500_000);
  assert.equal(total - repaid, 100_000);
  assert.equal(calculateDebtProgressPercent(repaid, total), 83);
});

test("cloud migration backfills every affected legacy debt numeric column", async () => {
  const sql = await readFile(backfillMigrationPath, "utf8");

  assert.match(sql, /update public\.debts as debt/i);
  for (const field of ["total_amount", "repaid_amount", "monthly_payment", "interest_rate"]) {
    assert.match(sql, new RegExp(`${field} = case when debt\\.${field} = 0 and legacy\\.${field} <> 0`, "i"));
  }
});
