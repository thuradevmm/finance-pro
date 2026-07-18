import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migrationPath = new URL("../supabase/migrations/202607180003_debt_transaction_progress_alignment.sql", import.meta.url);

test("debt progress migration cancels reversals and permits exactly one transfer reversal pair", async () => {
  const sql = await readFile(migrationPath, "utf8");
  assert.match(sql, /reversed_groups[\s\S]+effective_transactions/i);
  assert.match(sql, /reversal_group_id[\s\S]+lower\(coalesce\(existing\.type, ''\)\) = 'transfer'/i);
  assert.match(sql, /select count\(\*\)[\s\S]+\) >= 2/i);
  assert.match(sql, /duplicate_transaction_reversal/i);
});

