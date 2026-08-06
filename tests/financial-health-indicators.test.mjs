import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { buildFinancialHealthSignals } from "../src/lib/dashboard/health-indicators.ts";

const category = (id, level, financialRole = "", parentId = "") => ({ id, level, financialRole, parentId });
const indicatorSource = readFileSync(new URL("../src/features/dashboard/financial-health-indicators.tsx", import.meta.url), "utf8");
const transaction = (overrides) => ({
  accountId: "bank",
  amountBaseValue: 0,
  categoryId: "",
  id: crypto.randomUUID(),
  ledgerMetadata: {},
  relatedEntityId: "",
  relatedEntityType: "none",
  status: "cleared",
  transferAccountId: "",
  type: "Expense",
  ...overrides,
});

test("health indicators turn ledger activity and category purposes into qualitative signals", () => {
  const categories = [
    category("essential", "Super", "essential"),
    category("food", "Subcategory", "", "essential"),
    category("emergency", "Super", "emergency_reserve"),
    category("reserve", "Subcategory", "", "emergency"),
  ];
  const transactions = [
    transaction({ amountBaseValue: 10_000, categoryId: "salary", type: "Income" }),
    transaction({ amountBaseValue: 4_000, categoryId: "food" }),
    transaction({ amountBaseValue: 2_000, categoryId: "reserve", ledgerMetadata: { savings_action: "deposit" }, relatedEntityId: "goal", relatedEntityType: "savings_goal", type: "Income" }),
  ];
  const savingsGoals = [{ accountId: "bank", categoryId: "reserve", id: "goal", savedAmountValue: 24_000 }];

  const signals = buildFinancialHealthSignals({ categories, dateFrom: "2026-01-01", dateTo: "2026-12-31", savingsGoals, transactions });
  assert.deepEqual(signals.map((signal) => signal.signal), ["Winning", "Healthy", "Building", "Winning"]);
});

test("missing purpose mappings request setup instead of presenting misleading ratios", () => {
  const signals = buildFinancialHealthSignals({
    categories: [],
    dateFrom: "2026-01-01",
    dateTo: "2026-01-31",
    savingsGoals: [],
    transactions: [transaction({ amountBaseValue: 100, categoryId: "unknown" })],
  });
  assert.equal(signals.find((signal) => signal.label === "Essential expense load")?.signal, "Setup needed");
  assert.equal(signals.find((signal) => signal.label === "Emergency readiness")?.signal, "Setup needed");
});

test("a configured emergency reserve is not mislabeled as needing setup", () => {
  const categories = [
    category("essential", "Super", "essential"),
    category("food", "Subcategory", "", "essential"),
    category("emergency", "Super", "emergency_reserve"),
    category("reserve", "Subcategory", "", "emergency"),
  ];
  const fundedSignals = buildFinancialHealthSignals({
    categories,
    dateFrom: "2026-08-01",
    dateTo: "2026-08-31",
    savingsGoals: [{ accountId: "bank", categoryId: "reserve", id: "goal", savedAmountValue: 10_000 }],
    transactions: [],
  });
  const unfundedSignals = buildFinancialHealthSignals({
    categories,
    dateFrom: "2026-08-01",
    dateTo: "2026-08-31",
    savingsGoals: [{ accountId: "bank", categoryId: "reserve", id: "goal", savedAmountValue: 0 }],
    transactions: [],
  });

  assert.equal(fundedSignals.find((signal) => signal.label === "Emergency readiness")?.signal, "Building");
  assert.match(fundedSignals.find((signal) => signal.label === "Emergency readiness")?.detail ?? "", /configured and funded/);
  assert.equal(unfundedSignals.find((signal) => signal.label === "Emergency readiness")?.signal, "Warning");
});

test("health indicators use an accessible segmented semicircle and directional needle", () => {
  assert.match(indicatorSource, /role="img"/);
  assert.match(indicatorSource, /M25 100 A75 75/);
  assert.match(indicatorSource, /#16df35/);
  assert.match(indicatorSource, /#facc15/);
  assert.match(indicatorSource, /#fb923c/);
  assert.match(indicatorSource, /#ff2d2d/);
  assert.match(indicatorSource, /needleAngle/);
  assert.match(indicatorSource, /<line/);
  assert.match(indicatorSource, /<circle/);
  assert.match(indicatorSource, /aria-label=\{`\$\{signal\} indicator`\}/);
});
