import assert from "node:assert/strict";
import test from "node:test";

import { calculateDebtStatus } from "../src/lib/debts/status.ts";

const today = new Date("2026-07-18T12:00:00");

test("debt status is calculated from balance and due date", () => {
  assert.equal(calculateDebtStatus({ dueDate: "2026-07-01", remainingAmount: 100, today }), "Overdue");
  assert.equal(calculateDebtStatus({ dueDate: "2026-08-01", remainingAmount: 100, storedStatus: "Paid", today }), "Active");
  assert.equal(calculateDebtStatus({ dueDate: "2026-08-01", remainingAmount: 100, storedStatus: "Overdue", today }), "Active");
  assert.equal(calculateDebtStatus({ dueDate: "2026-07-01", remainingAmount: 0, today }), "Paid");
});
