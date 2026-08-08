import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function source(path) {
  return readFile(new URL(`../${path}`, import.meta.url), "utf8");
}

test("record actions support a consistent view-details control", async () => {
  const actions = await source("src/components/ui/record-actions.tsx");

  assert.match(actions, /onView\?: \(\) => void/);
  assert.match(actions, /View details for/);
  assert.match(actions, /name="eye"/);
});

test("account details include complete visible card and account information", async () => {
  const accounts = await source("src/app/accounts/page.tsx");

  assert.match(accounts, /Card identification/);
  assert.match(accounts, /Linked card information/);
  assert.match(accounts, /Card type/);
  assert.match(accounts, /Bank book \/ account number/);
  assert.match(accounts, /Mobile banking number/);
  assert.match(accounts, /Rate to/);
  assert.match(accounts, /Refunds/);
  assert.match(accounts, /Card number" value=\{<span className="font-mono">\{formatAccountIdentifier\(viewedAccount\.cardNumber\)\}/);
  assert.doesNotMatch(accounts, /Card number" value=\{<span className="font-mono">\{maskCardNumber\(viewedAccount\.cardNumber\)\}/);
  assert.match(accounts, /Security code" value=\{<span className="font-mono">\{viewedAccount\.cardSecurityCode \|\| "Not set"\}/);
  assert.doesNotMatch(accounts, /Saved · hidden for security/);
});

test("primary finance modules expose complete read-only detail modals", async () => {
  const files = await Promise.all([
    source("src/features/assets/assets-page-content.tsx"),
    source("src/features/categories/categories-page-content.tsx"),
    source("src/features/debts/debts-page-content.tsx"),
    source("src/features/savings-goals/savings-goals-grid.tsx"),
    source("src/features/subscriptions/subscriptions-page-content.tsx"),
  ]);

  for (const file of files) {
    assert.match(file, /<DetailModal/);
    assert.match(file, /onView=/);
  }

  assert.match(files[0], /Transaction-backed value/);
  assert.match(files[1], /Category information/);
  assert.match(files[2], /Repayment terms/);
  assert.match(files[3], /Linked transaction contributions/);
  assert.match(files[4], /Realized exchange rate/);
});
