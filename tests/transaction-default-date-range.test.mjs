import assert from "node:assert/strict";
import test from "node:test";

import { getDefaultTransactionDateRange } from "../src/lib/transactions/date-range.ts";

test("transaction filters default to the inclusive calendar year ending today", () => {
  assert.deepEqual(getDefaultTransactionDateRange(new Date(2026, 6, 18, 23, 30)), {
    dateFrom: "2025-07-18",
    dateTo: "2026-07-18",
  });
});

test("transaction default range clamps leap day to the prior year month end", () => {
  assert.deepEqual(getDefaultTransactionDateRange(new Date(2024, 1, 29, 12)), {
    dateFrom: "2023-02-28",
    dateTo: "2024-02-29",
  });
});
