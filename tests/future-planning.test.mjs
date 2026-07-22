import assert from "node:assert/strict";
import test from "node:test";

import { buildFutureProjection } from "../src/lib/future-planning/projection.ts";
import {
  futureLinkAmountSnapshot,
  futurePredictedAmount,
  getFutureOccurrenceDates,
  materializeFuturePredictions,
  suggestedFutureAmount,
} from "../src/lib/future-planning/records.ts";

const baseOptions = {
  startDate: "2028-01-01",
  months: 12,
  openingBalance: 0,
  openingSavings: 0,
  includeTrend: false,
};

test("planned transaction materialization keeps its original monthly anchor", () => {
  assert.deepEqual(getFutureOccurrenceDates({
    endDate: "2028-04-30",
    recurrence: "Monthly",
    startDate: "2028-01-31",
  }), ["2028-01-31", "2028-02-29", "2028-03-31", "2028-04-30"]);
});

test("planned transaction materialization respects inclusive ends and safety limits", () => {
  assert.deepEqual(getFutureOccurrenceDates({
    endDate: "2026-08-14",
    recurrence: "Weekly",
    startDate: "2026-07-17",
  }, 3), ["2026-07-17", "2026-07-24", "2026-07-31"]);
  assert.deepEqual(getFutureOccurrenceDates({
    endDate: "2026-07-31",
    recurrence: "Weekly",
    startDate: "2026-07-17",
  }), ["2026-07-17", "2026-07-24", "2026-07-31"]);
});

test("a transaction's exact predicted amount wins over linked snapshots and metadata", () => {
  assert.equal(futurePredictedAmount(275.75, {
    future_link_amount_snapshot: 500,
    future_predicted_amount: 300,
  }), 275.75);
  assert.equal(futurePredictedAmount(0, { future_predicted_amount: 300.25 }), 300.25);
  assert.equal(futureLinkAmountSnapshot({ future_link_amount_snapshot: 500 }, 275.75), 500);
  assert.equal(futureLinkAmountSnapshot({ future_link_amount_snapshot: 0 }, 275.75), 0);
});

test("linked suggestions never replace an amount after the user edits it", () => {
  assert.equal(suggestedFutureAmount("275", 500, true), "275");
  assert.equal(suggestedFutureAmount("", 500, false), "500");
});

test("recurring predictions materialize explicit per-date values without averaging", () => {
  const dates = ["2026-12-27", "2027-01-27", "2027-02-27"];
  assert.deepEqual(materializeFuturePredictions(dates, 1_000, [
    { amount: 1_250.5, date: "2027-01-27" },
    { amount: 900.25, date: "2027-02-27" },
  ]), [
    { amount: 1_000, date: "2026-12-27" },
    { amount: 1_250.5, date: "2027-01-27" },
    { amount: 900.25, date: "2027-02-27" },
  ]);
});

test("monthly and yearly recurrences preserve their anchor across leap month ends", () => {
  const result = buildFutureProjection([
    {
      id: "month-end",
      label: "Month-end subscription",
      kind: "expense",
      source: "Subscription",
      recurrence: "Monthly",
      amount: 100,
      category: "Subscription",
      startDate: "2028-01-31",
      endDate: "2028-03-31",
    },
    {
      id: "leap-year",
      label: "Leap-day annual bill",
      kind: "expense",
      source: "Scheduled",
      recurrence: "Yearly",
      amount: 25,
      category: "General",
      startDate: "2024-02-29",
      endDate: "2028-02-29",
    },
  ], [], baseOptions);

  assert.deepEqual(
    result.rows.flatMap((row) => row.events)
      .filter((event) => event.itemId === "month-end")
      .map((event) => event.date),
    ["2028-01-31", "2028-02-29", "2028-03-31"],
  );
  assert.deepEqual(
    result.rows.flatMap((row) => row.events)
      .filter((event) => event.itemId === "leap-year")
      .map((event) => event.date),
    ["2028-02-29"],
  );
});

test("weekly recurrence includes an occurrence exactly on its end date", () => {
  const result = buildFutureProjection([{
    id: "weekly",
    label: "Weekly transport",
    kind: "expense",
    source: "Scheduled",
    recurrence: "Weekly",
    amount: 10,
    category: "Transportation",
    startDate: "2028-01-29",
    endDate: "2028-02-12",
  }], [], baseOptions);

  assert.deepEqual(
    result.rows.flatMap((row) => row.events).map((event) => event.date),
    ["2028-01-29", "2028-02-05", "2028-02-12"],
  );
  assert.equal(result.rows[1].expenseCategories.Transportation, 20);
});

test("credit-card forecast events keep purchase dates for budgets and settle cash on due dates", () => {
  const result = buildFutureProjection([{
    id: "card-subscription",
    label: "Card subscription",
    kind: "expense",
    source: "Subscription",
    recurrence: "Monthly",
    amount: 100,
    category: "Subscriptions",
    startDate: "2028-01-31",
    endDate: "2028-03-31",
    cashTiming: { accountId: "card", kind: "credit_card_settlement", paymentDueDay: 25, statementDay: 5 },
  }], [], baseOptions);

  const events = result.rows.flatMap((row) => row.events);
  assert.deepEqual(events.map((event) => event.budgetDate), ["2028-01-31", "2028-02-29", "2028-03-31"]);
  assert.deepEqual(events.map((event) => event.date), ["2028-02-25", "2028-03-25", "2028-04-25"]);
});

test("opening card credits offset future settlements FIFO per card without reducing budget amounts", () => {
  const result = buildFutureProjection([
    {
      id: "card-a-first",
      label: "First card A purchase",
      kind: "expense",
      source: "Scheduled",
      recurrence: "Once",
      amount: 600,
      category: "Shopping",
      startDate: "2028-01-31",
      cashTiming: { accountId: "card-a", kind: "credit_card_settlement", paymentDueDay: 25, statementDay: 5 },
    },
    {
      id: "card-a-second",
      label: "Second card A purchase",
      kind: "expense",
      source: "Scheduled",
      recurrence: "Once",
      amount: 500,
      category: "Shopping",
      startDate: "2028-02-29",
      cashTiming: { accountId: "card-a", kind: "credit_card_settlement", paymentDueDay: 25, statementDay: 5 },
    },
    {
      id: "card-b-purchase",
      label: "Card B purchase",
      kind: "expense",
      source: "Scheduled",
      recurrence: "Once",
      amount: 250,
      category: "Shopping",
      startDate: "2028-01-15",
      cashTiming: { accountId: "card-b", kind: "credit_card_settlement", paymentDueDay: 20, statementDay: 5 },
    },
  ], [], {
    ...baseOptions,
    openingCardCredits: { "card-a": 700, "card-b": 100 },
  });

  const events = result.rows.flatMap((row) => row.events);
  assert.deepEqual(
    Object.fromEntries(events.map((event) => [event.itemId, { budgetAmount: event.budgetAmount, cashAmount: event.amount }])),
    {
      "card-a-first": { budgetAmount: 600, cashAmount: 0 },
      "card-a-second": { budgetAmount: 500, cashAmount: 400 },
      "card-b-purchase": { budgetAmount: 250, cashAmount: 150 },
    },
  );
  assert.equal(result.summary.totalExpense, 550);
});

test("historical reversals aggregate before trend averages are clamped", () => {
  const result = buildFutureProjection([], [
    { id: "expense", date: "2027-10-10", kind: "expense", amount: 300, category: "Food" },
    { id: "reversal", date: "2027-10-11", kind: "expense", amount: -300, category: "Food" },
  ], { ...baseOptions, includeTrend: true });
  assert.equal(result.rows[0].events.filter((event) => event.source === "Trend" && event.category === "Food").length, 0);
});

test("monthly rows pivot expense categories and carry balances and savings forward", () => {
  const result = buildFutureProjection([
    {
      id: "pay",
      label: "Pay",
      kind: "income",
      source: "Scheduled",
      recurrence: "Once",
      amount: 1_000,
      category: "Salary",
      startDate: "2026-01-05",
    },
    {
      id: "college",
      label: "College",
      kind: "expense",
      source: "Scheduled",
      recurrence: "Monthly",
      amount: 400,
      category: "College",
      startDate: "2026-01-10",
      endDate: "2026-03-10",
    },
    {
      id: "reserve",
      label: "Emergency fund",
      kind: "saving",
      source: "Savings Goal",
      recurrence: "Once",
      amount: 100,
      category: "Emergency Fund",
      startDate: "2026-01-20",
    },
    {
      id: "large-bill",
      label: "Large bill",
      kind: "expense",
      source: "Debt",
      recurrence: "Once",
      amount: 1_300,
      category: "Debt",
      startDate: "2026-03-15",
    },
  ], [], {
    ...baseOptions,
    startDate: "2026-01-01",
    openingBalance: 500,
    openingSavings: 50,
  });

  assert.deepEqual(result.categories, ["College", "Debt"]);
  assert.deepEqual(result.rows[0].expenseCategories, { College: 400, Debt: 0 });
  assert.deepEqual(result.rows[1].expenseCategories, { College: 400, Debt: 0 });
  assert.equal(result.rows[0].openingBalance, 500);
  assert.equal(result.rows[0].netCashFlow, 500);
  assert.equal(result.rows[0].closingBalance, 1_000);
  assert.equal(result.rows[0].cumulativeSavings, 150);
  assert.equal(result.rows[1].openingBalance, 1_000);
  assert.equal(result.rows[1].closingBalance, 600);
  assert.equal(result.rows[2].openingBalance, 600);
  assert.equal(result.rows[2].closingBalance, -1_100);
  assert.equal(result.firstShortfallMonth, "2026-03");
  assert.deepEqual(result.summary, {
    projectedMonths: 12,
    openingBalance: 500,
    openingSavings: 50,
    totalIncome: 1_000,
    totalExpense: 2_500,
    totalSavings: 100,
    net: -1_600,
    netCashFlow: -1_600,
    closingBalance: -1_100,
    cumulativeSavings: 150,
  });
});

test("a scheduled linked event replaces only the same auto entity occurrence", () => {
  const result = buildFutureProjection([
    {
      id: "subscription-rule",
      label: "Streaming (auto)",
      kind: "expense",
      source: "Subscription",
      recurrence: "Monthly",
      amount: 100,
      category: "Subscription",
      startDate: "2026-07-15",
      endDate: "2026-08-15",
      entityType: "subscription",
      entityId: "streaming",
    },
    {
      id: "scheduled-payment",
      label: "Streaming (scheduled)",
      kind: "expense",
      source: "Scheduled",
      recurrence: "Once",
      amount: 120,
      category: "Subscription",
      startDate: "2026-07-15",
      entityType: "subscription",
      entityId: "streaming",
    },
  ], [], {
    ...baseOptions,
    startDate: "2026-07-01",
  });

  assert.deepEqual(
    result.rows[0].events.map(({ source, amount }) => ({ source, amount })),
    [{ source: "Scheduled", amount: 120 }],
  );
  assert.deepEqual(
    result.rows[1].events.map(({ source, amount }) => ({ source, amount })),
    [{ source: "Subscription", amount: 100 }],
  );
});

test("a scheduled card settlement replaces the linked auto event on its budget date", () => {
  const result = buildFutureProjection([
    {
      id: "debt-rule",
      label: "Loan installment (auto)",
      kind: "expense",
      source: "Debt",
      recurrence: "Once",
      amount: 500,
      category: "Debt Payment",
      startDate: "2028-01-31",
      entityType: "debt",
      entityId: "loan",
    },
    {
      id: "scheduled-card-payment",
      label: "Loan installment (scheduled)",
      kind: "expense",
      source: "Scheduled",
      recurrence: "Once",
      amount: 500,
      category: "Debt Payment",
      startDate: "2028-01-31",
      cashTiming: { accountId: "card", kind: "credit_card_settlement", paymentDueDay: 25, statementDay: 5 },
      entityType: "debt",
      entityId: "loan",
    },
  ], [], baseOptions);

  const events = result.rows.flatMap((row) => row.events);
  assert.deepEqual(events.map(({ budgetDate, date, source }) => ({ budgetDate, date, source })), [{
    budgetDate: "2028-01-31",
    date: "2028-02-25",
    source: "Scheduled",
  }]);
});

test("the three-complete-month trend fills the gap above known plans and prorates the first", () => {
  const historicalActuals = [
    ...["2026-04-10", "2026-05-10", "2026-06-10"].map((date, index) => ({
      id: `food-${index}`,
      date,
      kind: "expense",
      amount: 300,
      category: "Food",
    })),
    ...["2026-04-12", "2026-05-12", "2026-06-12"].map((date, index) => ({
      id: `transport-${index}`,
      date,
      kind: "expense",
      amount: 31,
      category: "Transportation",
    })),
    // Only one month has income, so missing complete months count as zero.
    { id: "income", date: "2026-06-01", kind: "income", amount: 3_000, category: "Salary" },
  ];
  const result = buildFutureProjection([{
    id: "food-plan",
    label: "Known food plan",
    kind: "expense",
    source: "Scheduled",
    recurrence: "Once",
    amount: 50,
    category: "Food",
    startDate: "2026-07-20",
  }], historicalActuals, {
    ...baseOptions,
    startDate: "2026-07-16",
    includeTrend: true,
  });

  assert.equal(result.rows[0].expenseCategories.Food, 154.84);
  assert.equal(result.rows[0].expenseCategories.Transportation, 16);
  assert.equal(result.rows[0].totalIncome, 516.13);
  assert.equal(result.rows[1].expenseCategories.Food, 300);
  assert.equal(result.rows[1].expenseCategories.Transportation, 31);
  assert.equal(result.rows[1].totalIncome, 1_000);
  assert.equal(
    result.rows[0].events.filter((event) => event.source === "Trend" && event.category === "Food").length,
    1,
  );

  assert.doesNotThrow(() => JSON.stringify(result));
});
