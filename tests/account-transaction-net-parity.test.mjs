import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const accountPagePath = new URL("../src/app/accounts/page.tsx", import.meta.url);
const accountDataPath = new URL("../src/lib/accounts/supabase.ts", import.meta.url);
const dashboardPagePath = new URL("../src/app/dashboard/page.tsx", import.meta.url);
const transactionContentPath = new URL("../src/features/transactions/transactions-page-content.tsx", import.meta.url);

test("Account Lookup and Dashboard share one position helper while Transactions has no summary override", async () => {
  const [accountPage, accountData, dashboardPage, transactionContent] = await Promise.all([
    readFile(accountPagePath, "utf8"),
    readFile(accountDataPath, "utf8"),
    readFile(dashboardPagePath, "utf8"),
    readFile(transactionContentPath, "utf8"),
  ]);

  assert.match(accountData, /export function summarizeAccountPosition/);
  assert.match(accountPage, /const position = summarizeAccountPosition\(accounts\)/);
  assert.match(dashboardPage, /summarizeAccountPosition\(accounts\)/);
  assert.doesNotMatch(accountPage, /Financial Position & Reconciliation/);
  assert.doesNotMatch(transactionContent, /getTransactionSummaries|SummaryCards/);
  assert.doesNotMatch(transactionContent, /accountPositionNet|showsCompleteLedger/);
});
