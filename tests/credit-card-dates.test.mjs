import assert from "node:assert/strict";
import test from "node:test";

import { buildCreditCardDueBuckets, consolidateCreditCardDueBuckets, formatCreditCardDate, nextCreditCardBillingDay, nextCreditCardPaymentDate } from "../src/lib/accounts/credit-card-dates.ts";

test("credit card due date follows the next statement cutoff", () => {
  assert.equal(nextCreditCardPaymentDate({ paymentDueDay: 25, referenceDate: "2026-07-10", statementDay: 5 }), "2026-08-25");
  assert.equal(nextCreditCardPaymentDate({ paymentDueDay: 5, referenceDate: "2026-07-25", statementDay: 20 }), "2026-09-05");
});

test("charges are grouped by statement cycle and repayments settle oldest dues first", () => {
  const buckets = buildCreditCardDueBuckets({
    chargeActivity: [
      { amountValue: 1_000, dateValue: "2026-07-10" },
      { amountValue: 600, dateValue: "2026-07-25" },
    ],
    paymentDueDay: 5,
    repaymentAmount: 1_000,
    statementDay: 20,
  });
  assert.deepEqual(buckets, [{ amountValue: 600, dueDateValue: "2026-09-05" }]);
});

test("billing days are strict, clamp month end, and require a configured due day", () => {
  assert.equal(formatCreditCardDate(nextCreditCardBillingDay("2027-02-28", 31)), "2027-03-31");
  assert.equal(nextCreditCardPaymentDate({ paymentDueDay: 25, referenceDate: "2026-07-25" }), "2026-08-25");
  assert.equal(nextCreditCardPaymentDate({ paymentDueDay: null, referenceDate: "2026-07-10", statementDay: 5 }), "");
});

test("credit card balances use one upcoming month and roll unpaid remainders forward", () => {
  const statementBuckets = [
    { amountValue: 1_000, dueDateValue: "2026-08-05" },
    { amountValue: 600, dueDateValue: "2026-09-05" },
  ];

  assert.deepEqual(
    consolidateCreditCardDueBuckets(statementBuckets, "2026-07-25"),
    [{ amountValue: 1_600, dueDateValue: "2026-08-05" }],
  );
  assert.deepEqual(
    consolidateCreditCardDueBuckets(statementBuckets, "2026-08-06"),
    [{ amountValue: 1_600, dueDateValue: "2026-09-05" }],
  );
  assert.deepEqual(
    consolidateCreditCardDueBuckets([
      { amountValue: 250, dueDateValue: "2026-08-05" },
      { amountValue: 600, dueDateValue: "2026-09-05" },
    ], "2026-09-06"),
    [{ amountValue: 850, dueDateValue: "2026-10-05" }],
  );
  assert.deepEqual(
    consolidateCreditCardDueBuckets(
      [{ amountValue: 500, dueDateValue: "2027-02-28" }],
      "2027-03-01",
      31,
    ),
    [{ amountValue: 500, dueDateValue: "2027-03-31" }],
  );
});
