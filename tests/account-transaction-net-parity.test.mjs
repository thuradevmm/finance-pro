import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const accountPagePath = new URL("../src/app/accounts/page.tsx", import.meta.url);
const accountDataPath = new URL("../src/lib/accounts/supabase.ts", import.meta.url);
const transactionContentPath = new URL("../src/features/transactions/transactions-page-content.tsx", import.meta.url);

test("Account Lookup has one position helper and transaction filters cannot override their arithmetic Net", async () => {
  const [accountPage, accountData, transactionContent] = await Promise.all([
    readFile(accountPagePath, "utf8"),
    readFile(accountDataPath, "utf8"),
    readFile(transactionContentPath, "utf8"),
  ]);

  assert.match(accountData, /export function summarizeAccountPosition/);
  assert.match(accountPage, /const position = summarizeAccountPosition\(accounts\)/);
  assert.match(accountPage, /It is not the Transactions-page Net/);
  assert.match(transactionContent, /getTransactionSummaries\(filteredTransactions\)/);
  assert.doesNotMatch(transactionContent, /accountPositionNet|showsCompleteLedger/);
});
