import assert from "node:assert/strict";
import test from "node:test";

import {
  comparablePreviousPeriodEnd,
  dateInTimeZone,
  mergeSalaryPaydayOverrides,
  previousSalaryPeriod,
  resolvedSalaryPayday,
  salaryPaydaySequenceError,
  salaryPeriodForDate,
  salaryPeriodHistory,
} from "../src/lib/salary-periods/calendar.ts";
import { salaryChangeSentiment, salaryPeriodChange, summarizeSalaryPeriod } from "../src/lib/salary-periods/calculations.ts";

function paydayRule(overrides = {}) {
  return {
    daysBeforeMonthEnd: 0,
    ruleMode: "fixed_day",
    startDay: 1,
    weekendPolicy: "none",
    ...overrides,
  };
}

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

test("weekend policies move fixed paydays without creating period gaps", () => {
  const previousFriday = paydayRule({ weekendPolicy: "previous_business_day" });
  assert.deepEqual(
    { start: salaryPeriodForDate("2026-07-30", previousFriday).startDate, end: salaryPeriodForDate("2026-07-30", previousFriday).endDate },
    { start: "2026-07-01", end: "2026-07-30" },
  );
  assert.deepEqual(
    { start: salaryPeriodForDate("2026-07-31", previousFriday).startDate, end: salaryPeriodForDate("2026-07-31", previousFriday).endDate },
    { start: "2026-07-31", end: "2026-08-31" },
  );

  const nextMonday = paydayRule({ weekendPolicy: "next_business_day" });
  assert.deepEqual(
    { start: salaryPeriodForDate("2026-08-02", nextMonday).startDate, end: salaryPeriodForDate("2026-08-02", nextMonday).endDate },
    { start: "2026-07-01", end: "2026-08-02" },
  );
  assert.equal(salaryPeriodForDate("2026-08-03", nextMonday).startDate, "2026-08-03");
});

test("fixed days clamp before weekend adjustment and weekdays remain unchanged", () => {
  assert.equal(resolvedSalaryPayday("2026-02", paydayRule({ startDay: 31, weekendPolicy: "previous_business_day" })), "2026-02-27");
  assert.equal(resolvedSalaryPayday("2026-02", paydayRule({ startDay: 31, weekendPolicy: "next_business_day" })), "2026-03-02");
  assert.equal(resolvedSalaryPayday("2027-12", paydayRule({ startDay: 31, weekendPolicy: "previous_business_day" })), "2027-12-31");
});

test("month-end offsets support leap years and reject ambiguous large offsets", () => {
  const offsetRule = (daysBeforeMonthEnd) => paydayRule({ daysBeforeMonthEnd, ruleMode: "days_before_month_end" });
  assert.equal(resolvedSalaryPayday("2028-02", offsetRule(0)), "2028-02-29");
  assert.equal(resolvedSalaryPayday("2028-02", offsetRule(1)), "2028-02-28");
  assert.equal(resolvedSalaryPayday("2028-02", offsetRule(2)), "2028-02-27");
  assert.equal(resolvedSalaryPayday("2027-02", offsetRule(0)), "2027-02-28");
  assert.equal(resolvedSalaryPayday("2027-02", offsetRule(27)), "2027-02-01");
  assert.equal(resolvedSalaryPayday("2028-02", offsetRule(27)), "2028-02-02");
  assert.throws(() => resolvedSalaryPayday("2028-02", offsetRule(28)), /0 through 27/);
  assert.throws(() => resolvedSalaryPayday("2028-02", offsetRule(1.5)), /0 through 27/);
});

test("adjusted paydays form continuous periods across calendar years", () => {
  const previousFriday = paydayRule({ weekendPolicy: "previous_business_day" });
  assert.deepEqual(
    { start: salaryPeriodForDate("2028-01-15", previousFriday).startDate, end: salaryPeriodForDate("2028-01-15", previousFriday).endDate },
    { start: "2027-12-31", end: "2028-01-31" },
  );
  const nextMonday = paydayRule({ startDay: 31, weekendPolicy: "next_business_day" });
  assert.deepEqual(
    { start: salaryPeriodForDate("2029-01-01", nextMonday).startDate, end: salaryPeriodForDate("2029-01-01", nextMonday).endDate },
    { start: "2029-01-01", end: "2029-01-30" },
  );
});

test("manual payday overrides are exact anchors and drive historical periods", () => {
  const rule = paydayRule({ startDay: 27 });
  const overrides = [
    { payday: "2027-12-29", salaryMonth: "2027-12" },
    { payday: "2028-01-31", salaryMonth: "2028-01" },
    { payday: "2028-02-29", salaryMonth: "2028-02" },
  ];
  const periods = salaryPeriodHistory("2028-03-01", rule, 4, overrides);
  assert.deepEqual(periods.map(({ startDate, endDate }) => [startDate, endDate]), [
    ["2028-02-29", "2028-03-26"],
    ["2028-01-31", "2028-02-28"],
    ["2027-12-29", "2028-01-30"],
    ["2027-11-27", "2027-12-28"],
  ]);

  const weekendOverride = [{ payday: "2026-08-01", salaryMonth: "2026-08" }];
  assert.equal(
    resolvedSalaryPayday("2026-08", paydayRule({ weekendPolicy: "next_business_day" }), weekendOverride),
    "2026-08-01",
  );
});

test("manual paydays may cross a year boundary when their sequence remains ordered", () => {
  const overrides = [{ payday: "2027-12-29", salaryMonth: "2028-01" }];
  const rule = paydayRule({ weekendPolicy: "next_business_day" });
  const period = salaryPeriodForDate("2028-01-10", rule, overrides);
  assert.deepEqual({ start: period.startDate, end: period.endDate }, { start: "2027-12-29", end: "2028-01-31" });
});

test("manual payday validation rejects duplicates, invalid dates, and unordered boundaries", () => {
  const rule = paydayRule();
  assert.match(salaryPaydaySequenceError(rule, [
    { payday: "2028-01-01", salaryMonth: "2028-01" },
    { payday: "2028-01-02", salaryMonth: "2028-01" },
  ]), /Only one payday override/);
  assert.match(salaryPaydaySequenceError(rule, [
    { payday: "2027-02-29", salaryMonth: "2027-02" },
  ]), /valid calendar date/);
  assert.match(salaryPaydaySequenceError(rule, [
    { payday: "2027-12-01", salaryMonth: "2028-01" },
  ]), /must be after/);
  assert.match(salaryPaydaySequenceError(rule, [
    { payday: "2027-11-30", salaryMonth: "2028-01" },
  ]), /must be after/);
});

test("manual payday validation stays bounded for widely separated overrides", () => {
  let overrideMapCalls = 0;
  const sparseOverrides = new Proxy([
    { payday: "1900-02-02", salaryMonth: "1900-02" },
    { payday: "9999-11-02", salaryMonth: "9999-11" },
  ], {
    get(target, property, receiver) {
      if (property === "map") {
        return (...args) => {
          overrideMapCalls += 1;
          return target.map(...args);
        };
      }
      return Reflect.get(target, property, receiver);
    },
  });

  assert.equal(salaryPaydaySequenceError(paydayRule(), sparseOverrides), "");
  assert.ok(overrideMapCalls <= 1, `override maps should be built once, received ${overrideMapCalls}`);
});

test("database override rows deterministically win over JSON fallback rows", () => {
  const merged = mergeSalaryPaydayOverrides(
    [{ id: "database", payday: "2028-01-30", salaryMonth: "2028-01" }],
    [
      { id: "settings", payday: "2028-01-29", salaryMonth: "2028-01" },
      { id: "fallback-february", payday: "2028-02-28", salaryMonth: "2028-02" },
    ],
  );
  assert.deepEqual(merged, [
    { id: "fallback-february", payday: "2028-02-28", salaryMonth: "2028-02" },
    { id: "database", payday: "2028-01-30", salaryMonth: "2028-01" },
  ]);
});

test("same-point comparisons clamp when adjusted salary periods have different lengths", () => {
  const periods = salaryPeriodHistory("2026-08-02", paydayRule({ weekendPolicy: "next_business_day" }), 2);
  assert.deepEqual(periods.map(({ startDate, endDate }) => [startDate, endDate]), [
    ["2026-07-01", "2026-08-02"],
    ["2026-06-01", "2026-06-30"],
  ]);
  assert.equal(comparablePreviousPeriodEnd("2026-08-02", periods[0], periods[1]), "2026-06-30");
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
