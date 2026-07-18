import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const featureFiles = {
  accounts: new URL("../src/app/accounts/page.tsx", import.meta.url),
  assets: new URL("../src/features/assets/assets-page-content.tsx", import.meta.url),
  budgets: new URL("../src/features/budgets/budgets-page-content.tsx", import.meta.url),
  debts: new URL("../src/features/debts/debts-page-content.tsx", import.meta.url),
  subscriptions: new URL("../src/features/subscriptions/subscriptions-page-content.tsx", import.meta.url),
};

test("wide finance registers provide card layouts before the desktop breakpoint", async () => {
  for (const [feature, file] of Object.entries(featureFiles)) {
    const source = await readFile(file, "utf8");
    assert.match(source, /xl:hidden/, `${feature} should expose its record cards below xl`);
    assert.match(source, /hidden[^"\n]*xl:block/, `${feature} should reserve the wide table for xl screens`);
    assert.match(source, /key=\{`(?:mobile|\w+-mobile)-/, `${feature} should render stable mobile record keys`);
  }
});

test("responsive register cards preserve interactive sorting below xl", async () => {
  const configurations = [
    { feature: "account", file: featureFiles.accounts, type: "AccountSortKey" },
    { feature: "asset", file: featureFiles.assets, type: "AssetSortKey" },
    { feature: "budget", file: featureFiles.budgets, type: "BudgetSortKey" },
    { feature: "debt", file: featureFiles.debts, type: "DebtSortKey" },
    { feature: "subscription", file: featureFiles.subscriptions, type: "SubscriptionSortKey" },
  ];

  for (const { feature, file, type } of configurations) {
    const source = await readFile(file, "utf8");
    const sortControlStart = source.indexOf(`aria-label="Sort ${feature} cards by"`);
    const cardLayoutStart = source.indexOf("xl:hidden", sortControlStart);
    const directionAction = 'aria-label={`Sort ' + feature + ' cards ${sortDirection === "asc" ? "descending" : "ascending"}`}';

    assert.ok(sortControlStart >= 0, `${feature} cards should expose a sort-key selector`);
    assert.ok(cardLayoutStart >= 0, `${feature} sort controls should be available below xl`);
    assert.match(source, new RegExp(`handleSort\\(event\\.target\\.value as ${type}\\)`), `${feature} sort selection should reuse handleSort`);
    assert.ok(source.includes(directionAction), `${feature} cards should expose the current direction action`);
    assert.match(source, /onClick=\{\(\) => handleSort\(sortKey\)\}/, `${feature} direction action should reuse handleSort`);
  }
});

test("narrow account identities stay inside their cards and remain readable", async () => {
  const source = await readFile(featureFiles.accounts, "utf8");
  const accountCard = source.slice(source.indexOf("function AccountCard"), source.indexOf("function CreditCardCard"));

  assert.match(accountCard, /flex w-full min-w-0 max-w-full gap-3/);
  assert.match(accountCard, /<div className="min-w-0 flex-1">/);
  assert.doesNotMatch(accountCard, /<(?:h2|p) className="[^"]*truncate/);
  assert.match(accountCard, /\{account\.type\} · \{account\.category/);
});

test("responsive account lookup preserves its calculated aggregate rows", async () => {
  const source = await readFile(featureFiles.accounts, "utf8");

  assert.match(source, /key=\{`cash-total-mobile-/);
  assert.match(source, />Cash Balance<\/dt>/);
  assert.match(source, />Credit Card Totals<\/h3>/);
  assert.match(source, /key=\{`card-total-mobile-/);
});

test("narrow transaction and planning cards do not constrain exact amounts to a side column", async () => {
  const [transactions, planning] = await Promise.all([
    readFile(new URL("../src/features/transactions/transactions-table.tsx", import.meta.url), "utf8"),
    readFile(new URL("../src/features/future-planning/future-planning-page-content.tsx", import.meta.url), "utf8"),
  ]);

  assert.doesNotMatch(transactions, /amount-value overflow-hidden/);
  assert.doesNotMatch(transactions, /max-w-\[45%\] shrink text-right/);
  assert.match(transactions, /w-full pl-7 text-left sm:w-auto/);
  assert.match(planning, /amount-value w-full text-left[^"\n]*sm:w-auto sm:text-right/);
});

test("subscription timeline values use the full card width", async () => {
  const source = await readFile(featureFiles.subscriptions, "utf8");

  assert.doesNotMatch(source, /ml-\[3\.25rem\]/);
  assert.match(source, /amount-value col-span-2 max-w-full/);
});

test("feature amount values never opt back into clipping or one-line truncation", async () => {
  const files = [
    ...Object.values(featureFiles),
    new URL("../src/features/accounts/add-account-form.tsx", import.meta.url),
    new URL("../src/features/future-planning/future-planning-page-content.tsx", import.meta.url),
    new URL("../src/features/savings-goals/savings-goals-grid.tsx", import.meta.url),
    new URL("../src/features/transactions/transactions-table.tsx", import.meta.url),
  ];

  for (const file of files) {
    const source = await readFile(file, "utf8");
    assert.doesNotMatch(source, /amount-value[^"\n]*(?:overflow-hidden|whitespace-nowrap|truncate)/);
    assert.doesNotMatch(source, /(?:overflow-hidden|whitespace-nowrap|truncate)[^"\n]*amount-value/);
  }
});

test("savings and asset metric grids become a single readable column on narrow phones", async () => {
  const [savings, assets] = await Promise.all([
    readFile(new URL("../src/features/savings-goals/savings-goals-grid.tsx", import.meta.url), "utf8"),
    readFile(featureFiles.assets, "utf8"),
  ]);

  assert.match(savings, /grid-cols-1[^"\n]*min-\[420px\]:grid-cols-2/);
  assert.match(assets, /grid-cols-1[^"\n]*min-\[420px\]:grid-cols-2/);
  assert.match(assets, />Purchase Date<\/dt>/);
});

test("subscription form preview protects the calculated MMK equivalent", async () => {
  const source = await readFile(new URL("../src/features/subscriptions/add-subscription-form.tsx", import.meta.url), "utf8");

  assert.match(source, /MMK Equivalent[\s\S]*?<ResponsiveAmount[^>]*maxSizeRem=\{0\.875\}/);
});
