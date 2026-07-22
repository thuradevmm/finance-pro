import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { mergeAmountTypeCatalog } from "../src/lib/accounts/amount-type-catalog.ts";
import { categoryRowSupports, getCategoriesForScope } from "../src/lib/categories/category-scopes.ts";

const projectRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const migration = readFileSync(join(projectRoot, "supabase/migrations/202607220001_account_category_lifecycle.sql"), "utf8");
const accountActions = readFileSync(join(projectRoot, "src/app/accounts/actions.ts"), "utf8");
const accountPage = readFileSync(join(projectRoot, "src/app/accounts/page.tsx"), "utf8");
const accountRecordActions = readFileSync(join(projectRoot, "src/features/accounts/account-record-actions.tsx"), "utf8");
const categoryActions = readFileSync(join(projectRoot, "src/app/categories/actions.ts"), "utf8");

test("amount-type catalog reuses active names and keeps metadata-only legacy names", () => {
  assert.deepEqual(mergeAmountTypeCatalog(
    [
      { is_active: true, name: "Operation", sort_order: 0 },
      { is_active: false, name: "Hidden suggestion", sort_order: 1 },
    ],
    [
      { metadata: { amount_types: [{ type: "operation" }, { type: "Emergency" }] } },
    ],
  ), ["Operation", "Emergency"]);

  assert.deepEqual(mergeAmountTypeCatalog([], []), ["Operation"]);
});

test("normalized category columns take precedence while Hidden categories remain historical only", () => {
  const activeCategory = {
    category_type: "savings_goal",
    metadata: { category_type: "Expense", scopes: ["Savings Goals"] },
    scopes: ["Savings Goals"],
    status: "Active",
    type: "Savings Goal",
  };
  const hiddenCategory = { ...activeCategory, status: "Hidden" };

  assert.equal(categoryRowSupports(activeCategory, "Savings Goals", "Savings Goal"), true);
  assert.deepEqual(getCategoriesForScope([activeCategory, hiddenCategory], "Savings Goals"), [activeCategory]);
});

test("account retirement is distinct from deletion in actions and every record action", () => {
  assert.match(accountActions, /export async function archiveAccount/);
  assert.match(accountActions, /export async function restoreAccount/);
  assert.match(accountActions, /retirement_reason:\s*"no_longer_used"/);
  assert.match(accountRecordActions, /Retire this MPU credit-card account without deleting its transaction history/);
  assert.match(accountRecordActions, /showDelete=\{account\.transactionCount === 0\}/);
  assert.match(accountRecordActions, /await onArchive\(account\)/);
  assert.match(accountRecordActions, /await onRestore\(account\)/);
});

test("accounts default to Lookup and only apply draft filters on Search submit", () => {
  assert.match(accountPage, /viewParam === "Card" \|\| viewParam === "List" \? viewParam : "Lookup"/);
  assert.match(accountPage, /options=\{\["Lookup", "List", "Card"\]\}/);
  assert.match(accountPage, /onSubmit=\{\(event\) => \{\s*event\.preventDefault\(\);\s*onSearch\(draft\);/s);
  assert.match(accountPage, />\s*Search\s*<\/button>/s);
});

test("category merge reassigns every related module atomically and retains an audit source", () => {
  for (const table of [
    "transactions",
    "budget_items",
    "assets",
    "debts",
    "savings_goals",
    "subscriptions",
    "scenario_items",
    "accounts",
    "user_settings",
  ]) {
    assert.match(migration, new RegExp(`update public\\.${table}`));
  }
  assert.match(migration, /security invoker/);
  assert.match(migration, /merged_into_category_id = v_target\.id/);
  assert.match(migration, /is_active = false/);
  assert.doesNotMatch(migration, /delete\s+from\s+public\.(?:categories|transactions)/i);
  assert.match(categoryActions, /export async function setCategoryStatus/);
  assert.match(categoryActions, /export async function mergeCategory/);
});

test("catalog uniqueness supports upsert and category schema keeps metadata mirrors", () => {
  assert.match(migration, /on public\.account_amount_types \(user_id, normalized_name\);/);
  assert.match(migration, /on conflict \(user_id, normalized_name\)/);
  assert.match(migration, /distinct on \(candidate\.user_id, candidate\.normalized_name\)/);
  assert.match(migration, /lower\(btrim\(amount_type\.item ->> 'type'\)\) as normalized_name/);
  assert.match(migration, /candidate\.source_priority,\s*candidate\.name collate "C"/s);
  assert.match(migration, /add column if not exists category_type text/);
  assert.match(migration, /add column if not exists reporting_role text/);
  assert.match(migration, /'category_type'.*?'reporting_role'/s);
});

test("existing records may retain a Hidden category while changed links require Active", () => {
  for (const file of [
    "src/app/assets/actions.ts",
    "src/app/budgets/actions.ts",
    "src/app/savings-goals/actions.ts",
    "src/app/subscriptions/actions.ts",
    "src/app/transactions/actions.ts",
  ]) {
    const source = readFileSync(join(projectRoot, file), "utf8");
    assert.match(source, /allowedExistingCategoryId/);
    assert.match(source, /is_active === false && .*\.id !== allowedExistingCategoryId/);
  }
});
