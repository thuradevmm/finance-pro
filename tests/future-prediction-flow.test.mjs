import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const files = {
  actions: new URL("../src/app/future-planning/actions.ts", import.meta.url),
  form: new URL("../src/features/future-planning/future-transaction-form.tsx", import.meta.url),
  genericActions: new URL("../src/app/transactions/actions.ts", import.meta.url),
  mapper: new URL("../src/lib/future-planning/supabase.ts", import.meta.url),
};

test("future plans persist explicit row amounts and separate linked snapshots", async () => {
  const [actions, mapper] = await Promise.all([readFile(files.actions, "utf8"), readFile(files.mapper, "utf8")]);

  assert.match(actions, /amount: prediction\.amount/);
  assert.match(actions, /future_predicted_amount: prediction\.amount/);
  assert.match(actions, /future_link_amount_snapshot:/);
  assert.match(actions, /future_materialization_mode: "individual_occurrences"/);
  assert.match(mapper, /futurePredictedAmount\(transaction\.amountValue, transaction\.ledgerMetadata\)/);
  assert.doesNotMatch(mapper, /selectedLink|linkOptions/);
});

test("linked values are suggestions and recurrence amounts are customized explicitly", async () => {
  const form = await readFile(files.form, "utf8");

  assert.match(form, /suggestedFutureAmount\(currentAmount, option\.amount, amountWasEdited\)/);
  assert.doesNotMatch(form, /setAmount\(String\(option\.amount\)\)/);
  assert.match(form, /Customize predicted amounts by date/);
  assert.match(form, /predictions: isRepeating \? customizedPredictions : \[\]/);
});

test("ordinary transaction edits keep the materialized series and refresh its explicit amount mirror", async () => {
  const actions = await readFile(files.genericActions, "utf8");

  assert.match(actions, /future_link_amount_snapshot: source\.future_link_amount_snapshot/);
  assert.match(actions, /future_link_label: source\.future_link_label/);
  assert.match(actions, /future_series_id: source\.future_series_id/);
  assert.match(actions, /future_predicted_amount: amount/);
  assert.match(actions, /preservedFuturePlanMetadata\(existingTransaction\.metadata, resolvedInput\.amount\)/);
});
