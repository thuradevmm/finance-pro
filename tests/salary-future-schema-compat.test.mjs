import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  jsonSettingsRecord,
  jsonSettingsSection,
  mergeJsonSettingsSection,
} from "../src/lib/supabase/schema-compat.ts";

test("rolling feature settings preserve unrelated legacy JSON", () => {
  const original = {
    existing_preference: "keep me",
    salary_period: { enabled: false, unrelated: 42 },
  };
  const merged = mergeJsonSettingsSection(original, "salary_period", {
    default_view: true,
    enabled: true,
    start_day: 27,
    storage: "fallback",
  });

  assert.equal(merged.existing_preference, "keep me");
  assert.deepEqual(jsonSettingsSection(merged, "salary_period"), {
    default_view: true,
    enabled: true,
    start_day: 27,
    storage: "fallback",
    unrelated: 42,
  });
});

test("malformed JSON settings fall back to empty objects safely", () => {
  assert.deepEqual(jsonSettingsRecord(null), {});
  assert.deepEqual(jsonSettingsRecord(["not", "an", "object"]), {});
  assert.deepEqual(jsonSettingsSection({ salary_period: "invalid" }, "salary_period"), {});
});

test("salary and future planning loaders include pre-migration fallbacks", async () => {
  const [salaryLoader, salaryAction, futureLoader, futureAction] = await Promise.all([
    readFile(new URL("../src/lib/salary-periods/supabase.ts", import.meta.url), "utf8"),
    readFile(new URL("../src/app/salary-periods/actions.ts", import.meta.url), "utf8"),
    readFile(new URL("../src/lib/future-planning/supabase.ts", import.meta.url), "utf8"),
    readFile(new URL("../src/app/future-planning/settings-actions.ts", import.meta.url), "utf8"),
  ]);

  assert.match(salaryLoader, /\.select\("settings"\)/);
  assert.match(salaryLoader, /fallbackSection\.payday_overrides/);
  assert.match(salaryLoader, /mergeSalaryPaydayOverrides\(directRows, fallbackRows\)/);
  assert.match(salaryLoader, /isMissingDatabaseObject\(categoryResult\.error, \["reporting_role"\]\)/);
  assert.match(salaryAction, /storage: "fallback"/);
  assert.match(salaryAction, /payday_overrides: serializedPaydayOverrides\(overrides\)/);
  assert.match(salaryAction, /isMissingDatabaseObject\(error, \["salary_payday_overrides"\]\)/);
  assert.match(futureLoader, /columnsTableMissing \? \[\]/);
  assert.match(futureLoader, /jsonSettingsSection\(userSettingsResult\.data\?\.settings, "future_planning"\)/);
  assert.match(futureAction, /schemaUpgradeRequiredMessage\("Custom future-planning columns"\)/);
});
