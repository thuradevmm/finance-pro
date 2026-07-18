import assert from "node:assert/strict";
import test from "node:test";

import { buildEmiSchedule, calculateDebtPayoffSummary } from "../src/lib/debts/emi.ts";

test("EMI installments begin one month after the start and preserve month end", () => {
  const schedule = buildEmiSchedule({ interestRate: 0, interestRatePeriod: "Yearly", numberOfMonths: 3, principal: 300, startDate: "2027-01-31" });
  assert.deepEqual(schedule.payments.map((payment) => payment.dueDateValue), ["2027-02-28", "2027-03-31", "2027-04-30"]);
  assert.equal(schedule.monthlyPayment, 100);
  assert.equal(schedule.totalInterest, 0);
});

test("yearly and monthly interest schedules, partial payment, and early payoff stay finite", () => {
  const yearly = buildEmiSchedule({ interestRate: 12, interestRatePeriod: "Yearly", numberOfMonths: 12, principal: 12_000, repaidAmount: 1_200, startDate: "2026-01-01" });
  const monthly = buildEmiSchedule({ interestRate: 1, interestRatePeriod: "Monthly", numberOfMonths: 12, principal: 12_000, startDate: "2026-01-01" });
  assert.ok(yearly.totalInterest > 0);
  assert.ok(monthly.totalInterest > 0);
  assert.ok(yearly.remainingPrincipal < 12_000);

  const payoff = calculateDebtPayoffSummary({ interestRate: 12, interestRatePeriod: "Yearly", numberOfMonths: 12, principal: 12_000, referenceDate: "2026-03-01", repayments: [{ amountValue: 12_500, dateValue: "2026-03-01" }], startDate: "2026-01-01" });
  assert.equal(payoff.isPaidOff, true);
  assert.equal(payoff.isEarlyPayoff, true);
  assert.equal(payoff.remainingPrincipal, 0);
});
