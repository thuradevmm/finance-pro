import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const filesUsingSubmittedSearch = [
  "src/features/assets/assets-page-content.tsx",
  "src/features/budgets/budgets-page-content.tsx",
  "src/features/debts/debts-page-content.tsx",
  "src/features/savings-goals/savings-goals-grid.tsx",
  "src/features/subscriptions/subscriptions-page-content.tsx",
];

test("every submitted module search reads its current named native control", () => {
  for (const file of filesUsingSubmittedSearch) {
    const source = readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
    assert.match(source, /new FormData\(event\.currentTarget\)/, file);
    assert.match(source, /name="q"/, file);
    assert.match(source, /readSubmittedQuery\(/, file);
  }
});

test("multi-control module filters submit named controls and expose reset actions", () => {
  const accounts = readFileSync(new URL("../src/app/accounts/page.tsx", import.meta.url), "utf8");
  for (const name of ["q", "view", "accountCategory", "accountType", "accountStatus"]) {
    assert.match(accounts, new RegExp(`name="${name}"`));
  }
  assert.match(accounts, />\s*Reset\s*</);

  const categories = readFileSync(new URL("../src/features/categories/categories-page-content.tsx", import.meta.url), "utf8");
  for (const name of ["q", "dateFrom", "dateTo", "categoryStatus"]) {
    assert.match(categories, new RegExp(`name="${name}"`));
  }
  assert.match(categories, />\s*Reset\s*</);

  const assets = readFileSync(new URL("../src/features/assets/assets-page-content.tsx", import.meta.url), "utf8");
  for (const name of ["search", "category", "year", "amountRange"]) {
    assert.match(assets, new RegExp(`name="${name}"`));
  }
});
