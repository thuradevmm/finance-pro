import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  getAccountCategoryForId,
  getAccountCategoryOptions,
  getAccountsForCategory,
  sortAccountsByCategory,
} from "../src/lib/accounts/selection.ts";
import { localDateInputValue } from "../src/lib/date-format.ts";

const projectRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const source = (path) => readFileSync(join(projectRoot, path), "utf8");

const accounts = [
  { id: "wallet-z", category: "Wallet", institution: "", name: "Z Wallet" },
  { id: "bank-b", category: "Bank", institution: "B Bank", name: "Checking" },
  { id: "bank-a", category: "Bank", institution: "A Bank", name: "Savings" },
  { id: "cash", category: "", institution: "", name: "Cash" },
];

test("accounts are grouped and ordered by account category before account name", () => {
  assert.deepEqual(sortAccountsByCategory(accounts).map((account) => account.id), ["bank-b", "bank-a", "cash", "wallet-z"]);
  assert.deepEqual(getAccountCategoryOptions(accounts), ["Bank", "Uncategorized", "Wallet"]);
  assert.deepEqual(getAccountsForCategory(accounts, "Bank").map((account) => account.id), ["bank-b", "bank-a"]);
  assert.equal(getAccountCategoryForId(accounts, "wallet-z"), "Wallet");
});

test("local date input defaults use the user's calendar date", () => {
  assert.equal(localDateInputValue(new Date(2026, 7, 8, 23, 59)), "2026-08-08");
});

test("account selectors require the category step across financial entry flows", () => {
  for (const path of [
    "src/features/debts/add-debt-form.tsx",
    "src/features/future-planning/future-transaction-form.tsx",
    "src/features/savings-goals/add-savings-goal-form.tsx",
    "src/features/subscriptions/add-subscription-form.tsx",
    "src/features/transactions/add-transaction-form.tsx",
    "src/features/transactions/transactions-filters.tsx",
  ]) {
    assert.match(source(path), /Account Category|account category filter/i, path);
  }
});

test("save and add another preserves the category type", () => {
  const form = source("src/features/categories/add-category-form.tsx");
  const addAnotherBranch = form.match(/if \(addAnother && !category\) \{([\s\S]*?)showSuccess/)?.[1] ?? "";
  assert.ok(addAnotherBranch);
  assert.doesNotMatch(addAnotherBranch, /setSelectedType/);
});

test("borrowing and lending forms default new dates to today and preserve existing dates", () => {
  const form = source("src/features/debts/add-debt-form.tsx");
  assert.match(form, /debt\?\.startDate \|\| formatDateInput\(new Date\(\)\)/);
  assert.match(form, /setStartDate\(formatDateInput\(new Date\(\)\)\)/);
});
