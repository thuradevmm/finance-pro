import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  financialPurposeFieldLabel,
  financialPurposeOptionsFor,
  financialPurposeSupports,
} from "../src/lib/categories/financial-purpose.ts";

const values = (type) => financialPurposeOptionsFor(type).map((option) => option.value);

test("financial purposes are separated by Debit, Credit, and page category type", () => {
  assert.deepEqual(values("Expense"), ["essential", "debt_obligation", "discretionary", "other"]);
  assert.deepEqual(values("Income"), ["income", "other"]);
  assert.deepEqual(values("Savings Goal"), ["emergency_reserve", "savings", "other"]);
  assert.deepEqual(values("Debt"), ["debt_obligation", "other"]);
  assert.equal(financialPurposeFieldLabel("Expense"), "Debit dashboard classification");
  assert.equal(financialPurposeFieldLabel("Income"), "Credit dashboard classification");
  assert.equal(financialPurposeOptionsFor("Expense").find((option) => option.value === "essential")?.description.includes("Essential Expense Load"), true);
  assert.equal(financialPurposeOptionsFor("Savings Goal").find((option) => option.value === "emergency_reserve")?.description.includes("Emergency Readiness"), true);
});

test("purpose compatibility prevents directionally incorrect assignments", () => {
  assert.equal(financialPurposeSupports("Expense", "essential"), true);
  assert.equal(financialPurposeSupports("Expense", "income"), false);
  assert.equal(financialPurposeSupports("Income", "income"), true);
  assert.equal(financialPurposeSupports("Income", "essential"), false);
  assert.equal(financialPurposeSupports("Savings Goal", "emergency_reserve"), true);
  assert.equal(financialPurposeSupports("Savings Goal", "income"), false);
});

test("database and server validation enforce the same purpose direction", () => {
  const migration = readFileSync(new URL("../supabase/migrations/20260806121608_category_financial_purpose_by_direction.sql", import.meta.url), "utf8");
  const actions = readFileSync(new URL("../src/app/categories/actions.ts", import.meta.url), "utf8");
  assert.match(migration, /create or replace function public\.enforce_category_financial_purpose/);
  assert.match(migration, /when 'expense' then new\.financial_role in \('essential', 'debt_obligation', 'discretionary', 'other'\)/);
  assert.match(migration, /when 'income' then new\.financial_role in \('income', 'other'\)/);
  assert.match(migration, /'previous_role', category\.financial_role/);
  assert.doesNotMatch(migration, /delete\s+from\s+public\.categories/i);
  assert.match(actions, /financialPurposeSupports\(input\.type, input\.financialRole\)/);
});
