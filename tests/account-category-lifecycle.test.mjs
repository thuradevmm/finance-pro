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
const financialFundsMigration = readFileSync(join(projectRoot, "supabase/migrations/202608060001_financial_funds_category_hierarchy_and_percentage_plans.sql"), "utf8");
const superCategoryAssignmentMigration = readFileSync(join(projectRoot, "supabase/migrations/20260806105318_super_category_child_assignment.sql"), "utf8");
const singleSuperParentMigration = readFileSync(join(projectRoot, "supabase/migrations/20260806120058_enforce_single_super_category_parent.sql"), "utf8");

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
    category_level: "subcategory",
    category_type: "savings_goal",
    metadata: { category_type: "Expense", scopes: ["Savings Goals"] },
    level: "Subcategory",
    scopes: ["Savings Goals"],
    status: "Active",
    type: "Savings Goal",
  };
  const hiddenCategory = { ...activeCategory, status: "Hidden" };

  assert.equal(categoryRowSupports(activeCategory, "Savings Goals", "Savings Goal"), true);
  assert.equal(categoryRowSupports({ ...activeCategory, category_level: "super" }, "Savings Goals", "Savings Goal"), false);
  assert.deepEqual(getCategoriesForScope([activeCategory, hiddenCategory], "Savings Goals"), [activeCategory]);
});

test("super category child assignment is atomic, owned, and same-type", () => {
  assert.match(superCategoryAssignmentMigration, /create or replace function public\.set_super_category_children/);
  assert.match(superCategoryAssignmentMigration, /security invoker/);
  assert.match(superCategoryAssignmentMigration, /category\.user_id = v_user_id/);
  assert.match(superCategoryAssignmentMigration, /child\.category_level = 'subcategory'/);
  assert.match(superCategoryAssignmentMigration, /child\.category_type = v_super_type/);
  assert.match(superCategoryAssignmentMigration, /set parent_id = null/);
  assert.match(superCategoryAssignmentMigration, /set parent_id = p_super_category_id/);
  assert.match(superCategoryAssignmentMigration, /jsonb_set\([\s\S]*'\{parent_id\}'/);
  assert.doesNotMatch(superCategoryAssignmentMigration, /delete\s+from\s+public\.categories/i);
  assert.match(categoryActions, /assignSuperCategoryChildren/);
  assert.match(categoryActions, /p_child_category_ids: childCategoryIds/);
});

test("category hierarchy enforces one valid super parent and repairs legacy metadata", () => {
  assert.match(singleSuperParentMigration, /create or replace function public\.enforce_category_hierarchy/);
  assert.match(singleSuperParentMigration, /create trigger enforce_category_hierarchy_before_write/);
  assert.match(singleSuperParentMigration, /v_parent\.user_id is distinct from new\.user_id/);
  assert.match(singleSuperParentMigration, /v_parent\.category_level <> 'super'/);
  assert.match(singleSuperParentMigration, /v_parent\.category_type <> new\.category_type/);
  assert.match(singleSuperParentMigration, /Reassign or unlink this super category''s subcategories first/);
  assert.match(singleSuperParentMigration, /'previous_parent_id', child\.parent_id/);
  assert.match(singleSuperParentMigration, /new\.metadata := \(new\.metadata - 'parent_id' - 'category_level' - 'financial_role'\)/);
  assert.doesNotMatch(singleSuperParentMigration, /delete\s+from\s+public\.categories/i);
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
  assert.match(accountPage, /onSubmit=\{\(event\) => \{\s*event\.preventDefault\(\);\s*const formData = new FormData\(event\.currentTarget\);/s);
  assert.match(accountPage, /name="accountCategory"/);
  assert.match(accountPage, /onSearch\(\{\s*accountCategory:/s);
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
    "src/app/savings-goals/actions.ts",
    "src/app/subscriptions/actions.ts",
    "src/app/transactions/actions.ts",
  ]) {
    const source = readFileSync(join(projectRoot, file), "utf8");
    assert.match(source, /allowedExistingCategoryId/);
    assert.match(source, /is_active === false && .*\.id !== allowedExistingCategoryId/);
  }
});

test("financial funds migration preserves the real bucket used by legacy savings goals", () => {
  assert.match(financialFundsMigration, /update public\.savings_goals as goal/);
  assert.match(financialFundsMigration, /lower\(btrim\(amount_type\.item ->> 'type'\)\) = 'saving'/);
  assert.match(financialFundsMigration, /when coalesce\(account\.metadata, '\{\}'::jsonb\) \? 'saving_amount' then 'Saving'/);
  assert.match(financialFundsMigration, /goal\.account_id = account\.id/);
});
