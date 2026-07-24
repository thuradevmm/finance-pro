import assert from "node:assert/strict";
import test from "node:test";

import { cleanAmountInputValue, formatAmountInputValue, formatMmk, formatMmkPreview } from "../src/lib/currency.ts";

test("MMK formatting keeps the currency before negative and positive signs", () => {
  assert.equal(formatMmk(-581_313.89), "MMK -581,313.89");
  assert.equal(formatMmkPreview(581_313.89, "positive"), "MMK +581,313.89");
  assert.equal(formatMmkPreview(581_313.89, "negative"), "MMK -581,313.89");
});

test("amount input helpers add grouping while preserving numeric state", () => {
  assert.equal(cleanAmountInputValue("2,300,000.50"), "2300000.50");
  assert.equal(formatAmountInputValue("2300000.50"), "2,300,000.50");
  assert.equal(formatAmountInputValue("2300000."), "2,300,000.");
});
