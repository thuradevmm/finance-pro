import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const projectRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const source = (path) => readFileSync(join(projectRoot, path), "utf8");

test("retired feature pages and navigation entries stay removed", () => {
  for (const path of [
    "src/app/budgets/page.tsx",
    "src/app/documents/page.tsx",
    "src/app/people-payments/page.tsx",
    "src/app/reports/page.tsx",
    "src/app/scenario-budgeting/page.tsx",
    "src/lib/future-planning/projection.ts",
  ]) {
    assert.equal(existsSync(join(projectRoot, path)), false, path);
  }
  const navigation = source("src/lib/app-navigation.ts");
  assert.doesNotMatch(navigation, /Budgets|Documents|People Payments|Reports|Scenario Budgeting|Settings/);
  assert.match(source("src/app/settings/page.tsx"), /Settings are temporarily closed/);
});

test("legacy budget data migrates into category-backed planning without dropping audit tables", () => {
  const migration = source("supabase/migrations/202608020001_category_planning_budget_retirement.sql");
  assert.match(migration, /alter column category_id set not null/);
  assert.match(migration, /legacy_custom_name/);
  assert.match(migration, /legacy_budget_migration/);
  assert.match(migration, /insert into public\.future_planning_settings/);
  assert.match(migration, /status = 'retired'/);
  assert.doesNotMatch(migration, /drop table(?: if exists)? public\.budget_(?:items|plans)/i);
});

test("notification icons open reminder-backed notifications and mutations revalidate them", () => {
  assert.equal(existsSync(join(projectRoot, "src/components/app/app-top-bar.tsx")), false);
  assert.match(source("src/components/app/app-sidebar.tsx"), /aria-label="Notifications"[\s\S]*href="\/notifications"/);
  assert.doesNotMatch(source("src/components/app/mobile-header.tsx"), /aria-label="Notifications"/);
  const notifications = source("src/lib/notifications/supabase.ts");
  for (const sourceName of ["Subscriptions", "Borrowing & Lending", "Future Planning", "Savings Goals", "Assets"]) {
    assert.match(notifications, new RegExp(`source: "${sourceName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"`));
  }
  assert.match(notifications, /!subscription\.reminderEnabled/);
  for (const action of ["assets", "debts", "future-planning", "savings-goals", "subscriptions", "transactions"]) {
    assert.match(source(`src/app/${action}/actions.ts`), /"\/notifications"/, action);
  }
  assert.match(source("src/app/future-planning/settings-actions.ts"), /revalidatePath\("\/notifications"\)/);
});
