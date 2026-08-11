import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { recordWasInactiveByDate, storedRecordIsInactive } from "../src/lib/records/lifecycle.ts";

const projectRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

function source(path) {
  return readFileSync(join(projectRoot, path), "utf8");
}

function exportedActionBlock(contents, actionName) {
  const start = contents.indexOf(`export async function ${actionName}`);
  assert.notEqual(start, -1, `${actionName} must be exported`);
  const next = contents.indexOf("export async function ", start + 1);
  return contents.slice(start, next === -1 ? contents.length : next);
}

test("normalized and legacy lifecycle storage resolve to one inactive state", () => {
  assert.equal(storedRecordIsInactive({ is_active: false, metadata: {} }), true);
  assert.equal(storedRecordIsInactive({ archived_at: "2026-08-11T00:00:00Z", metadata: {} }), true);
  assert.equal(storedRecordIsInactive({ metadata: { is_active: false } }), true);
  assert.equal(storedRecordIsInactive({ metadata: { lifecycle_status: "deactivated" } }), true);
  assert.equal(storedRecordIsInactive({ is_active: true, metadata: { lifecycle_status: "active" } }), false);
});

test("account retirement is effective-dated for historical reconciliation", () => {
  const archived = {
    is_active: false,
    metadata: { archived_at: "2026-08-11T10:00:00Z" },
  };
  assert.equal(recordWasInactiveByDate(archived, "2026-08-10"), false);
  assert.equal(recordWasInactiveByDate(archived, "2026-08-11"), true);

  const restored = {
    is_active: true,
    metadata: {
      lifecycle_events: [
        { at: "2026-08-11T10:00:00Z", state: "archived" },
        { at: "2026-08-20T10:00:00Z", state: "active" },
      ],
    },
  };
  assert.equal(recordWasInactiveByDate(restored, "2026-08-15"), true);
  assert.equal(recordWasInactiveByDate(restored, "2026-08-21"), false);
});

test("module retirement changes lifecycle state without mutating transactions", () => {
  const actions = [
    ["src/app/assets/actions.ts", "archiveAsset", "restoreAsset"],
    ["src/app/debts/actions.ts", "archiveDebt", "restoreDebt"],
    ["src/app/savings-goals/actions.ts", "archiveSavingsGoal", "restoreSavingsGoal"],
    ["src/app/subscriptions/actions.ts", "deactivateSubscription", "restoreSubscription"],
  ];

  for (const [path, deactivateName, restoreName] of actions) {
    const contents = source(path);
    const deactivate = exportedActionBlock(contents, deactivateName);
    const restore = exportedActionBlock(contents, restoreName);
    assert.match(deactivate, /is_active:\s*false/, path);
    assert.match(deactivate, /(archived_at|deactivated_at)/, path);
    assert.match(deactivate, /(retirement_reason|deactivation_reason)/, path);
    assert.match(restore, /is_active:\s*true/, path);
    assert.match(restore, /restored_at/, path);
    assert.doesNotMatch(deactivate, /from\("transactions"\)/, path);
    assert.doesNotMatch(restore, /from\("transactions"\)/, path);
    assert.doesNotMatch(deactivate, /deleted_at\s*:/, path);
    assert.doesNotMatch(restore, /deleted_at\s*:/, path);
  }
});

test("module deletion remains owner-scoped and unused-only", () => {
  const actions = [
    ["src/app/assets/actions.ts", "deleteAsset"],
    ["src/app/debts/actions.ts", "deleteDebt"],
    ["src/app/savings-goals/actions.ts", "deleteSavingsGoal"],
    ["src/app/subscriptions/actions.ts", "deleteSubscription"],
  ];

  for (const [path, actionName] of actions) {
    const block = exportedActionBlock(source(path), actionName);
    assert.match(block, /from\("transactions"\)/, path);
    assert.match(block, /eq\("user_id", user\.id\)/, path);
    assert.match(block, /(hasHistory|hasLinkedHistory|hasStoredCapital|hasStoredPaymentHistory|financial history|payment history|purchase history)/i, path);
    assert.match(block, /deleted_at|deleteDebtPayload/, path);
  }
});

test("inactive records leave new selectors but remain available to historical edits", () => {
  const addPage = source("src/app/transactions/add/page.tsx");
  const editPage = source("src/app/transactions/[transactionId]/edit/page.tsx");
  const transactionActions = source("src/app/transactions/actions.ts");
  const futureLinks = source("src/lib/future-planning/link-options.ts");
  const futureActions = source("src/app/future-planning/actions.ts");

  assert.match(addPage, /filter\(\(goal\) => !goal\.isArchived\)/);
  assert.match(addPage, /filter\(\(debt\) => !debt\.isArchived/);
  assert.match(editPage, /!goal\.isArchived \|\| preserves\("savings_goal", goal\.id\)/);
  assert.match(editPage, /!debt\.isArchived[\s\S]*\|\| preserves\("debt", debt\.id\)/);
  assert.match(transactionActions, /!preservesExistingRelated && recordIsDeactivated\(relatedRecord\)/);
  assert.match(futureLinks, /!goal\.isArchived/);
  assert.match(futureLinks, /!debt\.isArchived/);
  assert.match(futureActions, /!preservesLinkedRecord && storedRecordIsInactive\(linkedResult\.data\)/);
});

test("database guards serialize retirement and preserve every transaction row", () => {
  const migration = source("supabase/migrations/20260811200546_safe_module_lifecycles.sql");
  for (const table of ["assets", "debts", "savings_goals", "subscriptions"]) {
    assert.match(migration, new RegExp(`alter table public\\.${table}[\\s\\S]*?add column if not exists is_active`));
  }
  assert.match(migration, /including soft-deleted/);
  assert.match(migration, /from public\.transactions as txn/);
  assert.match(migration, /from public\.file_links as link/);
  assert.match(migration, /for share/);
  assert.match(migration, /enforce_active_transaction_references/);
  assert.match(migration, /prevent_unsafe_account_archive/);
  assert.match(migration, /not v_origination_pending and v_secondary_amount > 0\.005/);
  assert.doesNotMatch(migration, /update\s+public\.transactions\s+set/i);
  assert.doesNotMatch(migration, /delete\s+from\s+public\.transactions/i);
});

test("database guards account deletion and clears only the non-financial default pointer", () => {
  const migration = source("supabase/migrations/20260811200546_safe_module_lifecycles.sql");
  const accountActions = source("src/app/accounts/actions.ts");

  assert.match(migration, /create or replace function public\.prevent_used_account_soft_delete\(\)/);
  assert.match(migration, /before update of deleted_at on public\.accounts/);
  assert.match(migration, /before delete on public\.accounts/);
  for (const table of ["transactions", "assets", "debts", "savings_goals", "subscriptions", "scenario_items", "file_links"]) {
    assert.match(migration, new RegExp(`from public\\.${table}`));
  }
  assert.match(migration, /set default_account_id = null/);
  assert.doesNotMatch(
    exportedActionBlock(accountActions, "deleteAccount"),
    /from\("user_settings"\)/,
  );
});

test("inactive parents permit descriptions but reject financial finalization and child writes", () => {
  const migration = source("supabase/migrations/20260811200546_safe_module_lifecycles.sql");

  assert.match(migration, /create or replace function public\.financial_payload_changed/);
  assert.match(migration, /array\['title', 'description', 'note', 'updated_at'\]::text\[\]/);
  assert.match(migration, /Restore the deactivated linked record before changing its financial activity/);
  assert.match(migration, /Restore the archived account before changing linked financial activity/);
  assert.match(migration, /create or replace function public\.enforce_active_financial_child_parent/);
  assert.match(migration, /array\['note', 'updated_at'\]::text\[\]/);
  for (const table of ["debt_payments", "savings_goal_entries", "subscription_payments"]) {
    assert.match(migration, new RegExp(`before insert or update on public\\.${table}`));
    assert.match(migration, new RegExp(`before delete on public\\.${table}`));
  }
});

test("migration revives used legacy tombstones without reviving unused rows or zeroing savings evidence", () => {
  const migration = source("supabase/migrations/20260811200546_safe_module_lifecycles.sql");

  for (const table of ["accounts", "assets", "debts", "subscriptions"]) {
    assert.match(migration, new RegExp(`update public\\.${table} as [a-z_]+[\\s\\S]*?set deleted_at = null`));
  }
  assert.match(migration, /recovery_reason', 'used_legacy_tombstone'/);
  assert.match(migration, /where account\.deleted_at is not null\s+and \(/);
  assert.match(migration, /where asset\.deleted_at is not null\s+and \(/);
  assert.match(migration, /where debt\.deleted_at is not null\s+and \(/);
  assert.match(migration, /where subscription\.deleted_at is not null\s+and \(/);
  assert.match(migration, /for v_goal in[\s\S]*where goal\.deleted_at is not null\s+and \(/);
  assert.match(migration, /initial_saved_amount = v_goal\.initial_saved_amount/);
  assert.match(migration, /current_amount = v_goal\.current_amount/);
  assert.match(migration, /saved_amount = v_goal\.saved_amount/);
});

test("new transaction and module category references require an owned active unmerged subcategory", () => {
  const migration = source("supabase/migrations/20260811200546_safe_module_lifecycles.sql");

  assert.match(migration, /create or replace function public\.category_accepts_new_activity/);
  assert.match(migration, /category\.user_id = p_user_id/);
  assert.match(migration, /category\.merged_into_category_id is null/);
  assert.match(migration, /category\.is_active/);
  assert.match(migration, /category\.category_level[\s\S]*<> 'super'/);
  assert.match(migration, /new\.category_id is distinct from old\.category_id/);
  assert.match(migration, /v_new_category_id is distinct from v_old_category_id/);
  assert.match(migration, /target\.is_active = true/);
  assert.match(migration, /target\.merged_into_category_id is null/);
});

test("Future Planning removal preserves column identity and monthly amounts", () => {
  const actions = source("src/app/future-planning/settings-actions.ts");
  const create = exportedActionBlock(actions, "createFuturePlanningColumn");
  const archive = exportedActionBlock(actions, "archiveFuturePlanningColumn");

  assert.match(create, /existingColumn/);
  assert.match(create, /update\(payload\)\.eq\("id", existingColumn\.id\)/);
  assert.match(archive, /update\(\{ is_active: false \}\)/);
  assert.doesNotMatch(archive, /\.delete\(/);
  assert.doesNotMatch(archive, /future_planning_amounts/);
});

test("retired debts keep financial position while only workflow totals stop", () => {
  const debts = source("src/lib/debts/supabase.ts");
  assert.match(debts, /const borrowedDebts = debts\.filter\(\(debt\) => debt\.nature === "Borrowing"\)/);
  assert.doesNotMatch(debts, /const borrowedDebts = debts\.filter\([^\n]+isArchived/);
  assert.match(debts, /Active Records[\s\S]*!debt\.isArchived/);
  assert.match(debts, /if \(debt\.isArchived \|\| debt\.status === "Paid"/);
});
