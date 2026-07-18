import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const projectRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const migration = readFileSync(
  join(projectRoot, "supabase/migrations/202607180001_account_integrity_reconciliation.sql"),
  "utf8",
);

test("account reconciliation adds only explicit manual card openings to card accounts", () => {
  assert.match(migration, /manual_credit_card_openings/);
  assert.match(migration, /manual_credit_card_terms/);
  assert.match(migration, /auto_credit_card_terms/);
  assert.match(migration, /regexp_replace\(lower\(coalesce\(account\.type, ''\)\).*?= 'creditcard'/s);
  assert.match(migration, /transaction_delta\.balance_delta, 0\) - coalesce\(card_opening\.opening_balance, 0\)/);
});

test("dashboard current balance excludes archived accounts but retains the complete account view", () => {
  assert.match(migration, /from public\.v_account_balances\s+where is_active = true/s);
  assert.match(migration, /where account\.deleted_at is null;/);
});

test("history guard only blocks crossing the credit-card ledger boundary", () => {
  assert.match(migration, /old_type_key = 'creditcard'.*?new_type_key = 'creditcard'/s);
  assert.match(migration, /before update of type on public\.accounts/);
});
