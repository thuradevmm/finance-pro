import assert from "node:assert/strict";
import test from "node:test";

import { isCreditCardDebtType, validateDebtInput } from "../src/lib/debts/validation.ts";

const valid = { durationMonths: 12, interestRate: 5, lender: "Bank", monthlyPayment: 100, name: "Loan", nextPaymentDate: "2026-08-01", payoffDate: "2027-07-01", repaidAmount: 0, startDate: "2026-07-01", status: "Active", totalAmount: 1_000, type: "Personal Loan" };

test("debt validation rejects impossible amounts and dates", () => {
  assert.match(validateDebtInput({ ...valid, totalAmount: -1 }), /greater than zero/i);
  assert.match(validateDebtInput({ ...valid, repaidAmount: -1 }), /cannot be negative/i);
  assert.match(validateDebtInput({ ...valid, startDate: "2026-02-30" }), /valid debt start date/i);
  assert.equal(validateDebtInput(valid), "");
  assert.equal(isCreditCardDebtType("credit_card"), true);
  assert.equal(isCreditCardDebtType("Credit Card Debt"), true);
});
