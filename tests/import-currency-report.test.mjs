import assert from "node:assert/strict";
import test from "node:test";

import { convertToBaseCurrency, exchangeRateFor, missingCurrencyRates } from "../src/lib/currency-conversion.ts";
import { exportTableToCsv, exportTableToPdf, exportTableToXlsx } from "../src/lib/exports/financial-export.ts";
import { buildFinancialReport } from "../src/lib/reports/financial-report.ts";
import { parseTransactionImportCsv, transactionImportTemplate } from "../src/lib/transactions/import.ts";

test("CSV import accepts Credit/Debit terminology and validates transfer counterparts", () => {
  const parsed = parseTransactionImportCsv([
    "external_source,external_id,date,type,amount,account_id,account_amount_type,transfer_account_id,transfer_account_amount_type,transfer_amount,category_id,status,title,note",
    'bank,abc-1,2026-07-29,Credit,"1,250",cash,General,,,,salary,Cleared,Salary,"July, payroll"',
    "bank,abc-2,2026-07-29,Transfer,100,cash,General,usd,General,0.05,,Cleared,Exchange,",
  ].join("\n"));
  assert.deepEqual(parsed.errors, []);
  assert.equal(parsed.rows[0].type, "Income");
  assert.equal(parsed.rows[0].amount, 1250);
  assert.equal(parsed.rows[0].note, "July, payroll");
  assert.equal(parsed.rows[1].transferAmount, 0.05);
  assert.equal(parseTransactionImportCsv(transactionImportTemplate()).errors.length, 0);
});

test("dated exchange rates convert historically and report missing currencies", () => {
  const settings = {
    baseCurrency: "MMK",
    rates: [
      { currencyCode: "USD", effectiveDate: "2026-01-01", rateToBase: 4000 },
      { currencyCode: "USD", effectiveDate: "2026-07-01", rateToBase: 4500 },
    ],
  };
  assert.equal(exchangeRateFor(settings, "USD", "2026-06-30"), 4000);
  assert.equal(convertToBaseCurrency(2, "USD", settings, "2026-07-29"), 9000);
  assert.deepEqual(missingCurrencyRates(["USD", "EUR", "MMK"], settings, "2026-07-29"), ["EUR"]);
});

test("financial reports exclude transfers, reversals, pending rows, and missing FX rates", () => {
  const base = {
    account: "Cash",
    amountBaseValue: 0,
    category: "Other",
    dateValue: "2026-07-10",
    hasExchangeRate: true,
    isReversal: false,
    isReversed: false,
    status: "cleared",
  };
  const report = buildFinancialReport([
    { ...base, amountBaseValue: 100, category: "Salary", type: "Income" },
    { ...base, amountBaseValue: 40, category: "Food", type: "Expense" },
    { ...base, amountBaseValue: 10, type: "Transfer" },
    { ...base, amountBaseValue: 20, status: "pending", type: "Expense" },
    { ...base, amountBaseValue: 50, hasExchangeRate: false, type: "Expense" },
  ], { dateFrom: "2026-07-01", dateTo: "2026-07-31", group: "category" });
  assert.equal(report.credit, 100);
  assert.equal(report.debit, 40);
  assert.equal(report.net, 60);
  assert.equal(report.excludedMissingRates, 1);
  assert.equal(report.transactionCount, 2);
});

test("CSV, XLSX, and PDF exports produce valid downloadable formats", async () => {
  const table = { columns: ["Name", "Amount"], rows: [['Food, "weekly"', 1250]], title: "Report" };
  const csv = exportTableToCsv(table);
  assert.match(csv, /"Food, ""weekly"""/);
  const xlsx = exportTableToXlsx(table);
  assert.equal(String.fromCharCode(...xlsx.slice(0, 2)), "PK");
  const pdf = await exportTableToPdf(table);
  assert.equal(String.fromCharCode(...pdf.slice(0, 4)), "%PDF");
});
