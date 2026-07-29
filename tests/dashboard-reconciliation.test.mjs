import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const accountsPagePath = new URL("../src/app/accounts/page.tsx", import.meta.url);
const dashboardPagePath = new URL("../src/app/dashboard/page.tsx", import.meta.url);
const dashboardSectionPath = new URL("../src/features/dashboard/financial-position-reconciliation.tsx", import.meta.url);
const dashboardFilterPath = new URL("../src/features/dashboard/financial-position-date-filter.tsx", import.meta.url);
const accountReaderPath = new URL("../src/lib/accounts/supabase.ts", import.meta.url);
const debtReaderPath = new URL("../src/lib/debts/supabase.ts", import.meta.url);

test("financial reconciliation lives on Dashboard with a one-year date range flow", async () => {
  const [accountsPage, dashboardPage, dashboardSection, dashboardFilter] = await Promise.all([
    readFile(accountsPagePath, "utf8"),
    readFile(dashboardPagePath, "utf8"),
    readFile(dashboardSectionPath, "utf8"),
    readFile(dashboardFilterPath, "utf8"),
  ]);

  assert.doesNotMatch(accountsPage, /Financial Position & Reconciliation/);
  assert.match(dashboardPage, /getDefaultTransactionDateRange/);
  assert.match(dashboardPage, /filterTransactionsByDateRange/);
  assert.match(dashboardPage, /asOfDate: dateRange\.dateTo/);
  assert.match(dashboardSection, /Financial Position & Reconciliation/);
  assert.match(dashboardSection, /Period Performance/);
  assert.match(dashboardSection, /Position Composition/);
  assert.match(dashboardFilter, /fromName="dateFrom"/);
  assert.match(dashboardFilter, /toName="dateTo"/);
});

test("dashboard readers calculate accounts and debts as of the selected ending date", async () => {
  const [accountReader, debtReader] = await Promise.all([
    readFile(accountReaderPath, "utf8"),
    readFile(debtReaderPath, "utf8"),
  ]);

  assert.match(accountReader, /options: \{ asOfDate\?: string; limit\?: number \}/);
  assert.match(accountReader, /lte\("transaction_date", options\.asOfDate\)/);
  assert.match(debtReader, /options: \{ asOfDate\?: string; limit\?: number \}/);
  assert.match(debtReader, /lte\("payment_date", options\.asOfDate\)/);
  assert.match(debtReader, /referenceDate/);
});
