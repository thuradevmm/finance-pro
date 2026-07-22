import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const projectRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

function source(path) {
  return readFileSync(join(projectRoot, path), "utf8");
}

test("category reads retry the legacy metadata-backed schema", () => {
  const categories = source("src/lib/categories/supabase.ts");
  assert.match(categories, /isMissingDatabaseObject\(enrichedResult\.error/);
  assert.match(categories, /select\("id,user_id,name,type,icon,color,is_default,is_active,metadata"\)/);
  assert.match(categories, /metadata\.merged_into_category_id/);
  assert.match(categories, /metadata\.reporting_role === "salary"/);

  const budgets = source("src/lib/budgets/supabase.ts");
  assert.match(budgets, /getBudgetCategoryRows/);
  assert.match(budgets, /select\("id,name,type,metadata"\)/);
});

test("category mutations mirror lifecycle data into metadata and retry legacy writes", () => {
  const actions = source("src/app/categories/actions.ts");
  assert.match(actions, /function legacyCategoryPayload/);
  assert.match(actions, /delete legacyPayload\.category_type/);
  assert.match(actions, /isMissingDatabaseObject\(error, \["category_type", "reporting_role", "archived_at"\]\)/);
  assert.match(actions, /schemaUpgradeRequiredMessage\("Category merge"\)/);
  assert.match(actions, /optionalFutureColumnsMissing/);
});

test("account amount types remain metadata-backed until the reusable catalog exists", () => {
  const catalog = source("src/lib/accounts/amount-type-catalog.ts");
  const actions = source("src/app/accounts/actions.ts");
  assert.match(catalog, /isMissingDatabaseObject\(catalogResult\.error, \["account_amount_types"\]\)/);
  assert.match(catalog, /catalogResult\.error \? \[\] : catalogResult\.data/);
  assert.match(actions, /isMissingDatabaseObject\(error, \["account_amount_types"\]\)/);
});

test("all category-link validators retry without the normalized category column", () => {
  for (const path of [
    "src/app/accounts/actions.ts",
    "src/app/assets/actions.ts",
    "src/app/budgets/actions.ts",
    "src/app/debts/actions.ts",
    "src/app/savings-goals/actions.ts",
    "src/app/subscriptions/actions.ts",
    "src/app/transactions/actions.ts",
  ]) {
    const actions = source(path);
    assert.match(actions, /isMissingDatabaseObject\([^\n]+\["category_type"\]\)/, path);
    assert.match(actions, /select\("[^"]*type[^"]*metadata"\)/, path);
  }
});
