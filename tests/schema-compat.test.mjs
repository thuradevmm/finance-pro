import assert from "node:assert/strict";
import test from "node:test";

import {
  isMissingDatabaseObject,
  schemaUpgradeRequiredMessage,
} from "../src/lib/supabase/schema-compat.ts";

test("schema compatibility recognizes PostgreSQL and PostgREST cache misses", () => {
  assert.equal(isMissingDatabaseObject({
    code: "42703",
    message: "column user_settings.salary_period_enabled does not exist",
  }, ["salary_period_enabled"]), true);
  assert.equal(isMissingDatabaseObject({
    code: "PGRST205",
    message: "Could not find the table 'public.future_planning_columns' in the schema cache",
  }, ["future_planning_columns"]), true);
  assert.equal(isMissingDatabaseObject({
    code: "PGRST202",
    message: "Could not find the function public.merge_categories",
  }, ["merge_categories"]), true);
});

test("schema compatibility does not hide unrelated database failures", () => {
  assert.equal(isMissingDatabaseObject({ code: "42501", message: "permission denied" }), false);
  assert.equal(isMissingDatabaseObject({ code: "42703", message: "column categories.category_type does not exist" }, ["salary_period_enabled"]), false);
  assert.match(schemaUpgradeRequiredMessage("Category merge"), /latest database migrations/i);
});
