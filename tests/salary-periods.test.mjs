import assert from "node:assert/strict";
import test from "node:test";

import {
  comparablePreviousPeriodEnd,
  dateInTimeZone,
  previousSalaryPeriod,
  salaryPeriodForDate,
  salaryPeriodHistory,
} from "../src/lib/salary-periods/calendar.ts";
import { salaryChangeSentiment, salaryPeriodChange, summarizeSalaryPeriod } from "../src/lib/salary-periods/calculations.ts";

test("salary periods anchor to the latest configured payday", () => {
  assert.deepEqual(salaryPeriodForDate("2026-07-22", 27), {
    endDate: "2026-07-26",
    key: "2026-06-27",
    label: "Jun 27, 2026 – Jul 26, 2026",
    startDate: "2026-06-27",
  });
  assert.equal(salaryPeriodForDate("2026-07-27", 27).startDate, "2026-07-27");
});

test("month-end anchors clamp without gaps across leap and short months", () => {
  const january = salaryPeriodForDate("2028-02-20", 31);
  assert.deepEqual({ start: january.startDate, end: january.endDate }, { start: "2028-01-31", end: "2028-02-28" });
  const february = salaryPeriodForDate("2028-02-29", 31);
  assert.deepEqual({ start: february.startDate, end: february.endDate }, { start: "2028-02-29", end: "2028-03-30" });
  assert.equal(previousSalaryPeriod(february, 31).endDate, "2028-02-28");
});

test("history and same-elapsed-day comparison use exact calendar days", () => {
  const periods = salaryPeriodHistory("2026-07-05", 27, 3);
  assert.deepEqual(periods.map((period) => period.startDate), ["2026-06-27", "2026-05-27", "2026-04-27"]);
  assert.equal(comparablePreviousPeriodEnd("2026-07-05", periods[0], periods[1]), "2026-06-04");
});

test("today is derived in the configured timezone", () => {
  assert.equal(dateInTimeZone(new Date("2026-07-22T17:45:00.000Z"), "Asia/Yangon"), "2026-07-23");
});

test("salary summaries separate salary, other income, spending and use finalized ledger semantics", () => {
  const period = salaryPeriodForDate("2026-07-22", 27);
  const summary = summarizeSalaryPeriod([
    { amount: 3_000, categoryName: "Salary", categoryReportingRole: "salary", status: "cleared", transactionDate: "2026-06-27", type: "income" },
    { amount: 500, categoryName: "Freelance", status: "cleared", transactionDate: "2026-07-02", type: "income" },
    { amount: 1_200, categoryName: "Food", status: "cleared", transactionDate: "2026-07-03", type: "expense" },
    { amount: 999, categoryName: "Food", status: "scheduled", transactionDate: "2026-07-04", type: "expense" },
    { amount: 200, categoryName: "Food", metadata: { reversed_transaction_id: "expense", reversed_transaction_type: "expense" }, status: "cleared", transactionDate: "2026-07-05", type: "income" },
    { amount: 250, categoryName: "Transfer", status: "cleared", transactionDate: "2026-07-06", type: "transfer" },
    { amount: 400, categoryName: "Card payment", metadata: { credit_card_payment: true }, status: "cleared", transactionDate: "2026-07-07", type: "expense" },
  ], period, "2026-07-22");

  assert.equal(summary.salaryIncome, 3_000);
  assert.equal(summary.otherIncome, 500);
  assert.equal(summary.spending, 1_000);
  assert.equal(summary.salaryUsed, 1_000);
  assert.equal(summary.salaryRemaining, 2_000);
  assert.equal(summary.safeToSpend, 2_500);
  assert.equal(summary.salaryUsagePercent, 33.33);
  assert.deepEqual(summary.expenseByCategory, { Food: 1_000 });
});

test("period comparisons retain amount and percentage deltas", () => {
  const period = salaryPeriodForDate("2026-07-22", 27);
  const current = summarizeSalaryPeriod([{ amount: 200, status: "cleared", transactionDate: "2026-07-01", type: "expense" }], period);
  const previous = { ...current, spending: 100 };
  assert.deepEqual(salaryPeriodChange(current, previous).spending, { amount: 100, percent: 100 });
});

test("salary comparison sentiment treats higher spending as adverse", () => {
  assert.equal(salaryChangeSentiment("salaryIncome", 100), "favorable");
  assert.equal(salaryChangeSentiment("otherIncome", -100), "adverse");
  assert.equal(salaryChangeSentiment("spending", 100), "adverse");
  assert.equal(salaryChangeSentiment("spending", -100), "favorable");
  assert.equal(salaryChangeSentiment("spending", 0), "neutral");
});
