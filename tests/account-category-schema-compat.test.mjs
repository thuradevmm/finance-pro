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
  assert.match(categories, /select\("id,user_id,name,type,parent_id,icon,color,is_default,is_active,metadata"\)/);
  assert.match(categories, /metadata\.merged_into_category_id/);
  assert.match(categories, /metadata\.reporting_role === "salary"/);

  const planning = source("src/lib/future-planning/supabase.ts");
  assert.match(planning, /category_id/);
  assert.match(planning, /categoryMonthlyAverages/);
});

test("category mutations mirror lifecycle data into metadata and retry legacy writes", () => {
  const actions = source("src/app/categories/actions.ts");
  assert.match(actions, /function legacyCategoryPayload/);
  assert.match(actions, /delete legacyPayload\.category_type/);
  assert.match(actions, /isMissingDatabaseObject\(error, \["category_type", "category_level", "financial_role", "reporting_role", "archived_at"\]\)/);
  assert.match(actions, /schemaUpgradeRequiredMessage\("Category merge"\)/);
  assert.match(actions, /optionalFutureColumnsMissing/);
  assert.match(actions, /eq\("category_id", categoryId\)\.eq\("is_active", true\)/);
  assert.match(actions, /\.delete\(\)[\s\S]*\.eq\("category_id", categoryId\)[\s\S]*\.eq\("is_active", false\)/);
  assert.match(actions, /usage\.reasons\.join/);
  assert.match(actions, /schemaUpgradeRequiredMessage\("Super category child assignment"\)/);
});

test("category UI supports bulk child linking and separate hierarchy views", () => {
  const form = source("src/features/categories/add-category-form.tsx");
  const page = source("src/features/categories/categories-page-content.tsx");
  assert.match(form, /childCategoryIds: level === "Super" \? selectedChildCategoryIds : \[\]/);
  assert.match(form, /Link subcategories/);
  assert.match(form, /type="checkbox"/);
  assert.match(page, /const hierarchyViews = \["Hierarchy", "Super categories", "Subcategories"\]/);
  assert.match(page, /Rolled-up/);
  assert.match(page, /Linked subcategories/);
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
