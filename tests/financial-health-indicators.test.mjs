import assert from "node:assert/strict";
import test from "node:test";

import { buildFinancialHealthSignals } from "../src/lib/dashboard/health-indicators.ts";

const category = (id, level, financialRole = "", parentId = "") => ({ id, level, financialRole, parentId });
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
