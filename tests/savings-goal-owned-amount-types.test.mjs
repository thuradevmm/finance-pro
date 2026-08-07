import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migrationPath = new URL("../supabase/migrations/202608070001_savings_goal_owned_amount_types.sql", import.meta.url);
const goalActionPath = new URL("../src/app/savings-goals/actions.ts", import.meta.url);
const goalFormPath = new URL("../src/features/savings-goals/add-savings-goal-form.tsx", import.meta.url);
const transactionActionPath = new URL("../src/app/transactions/actions.ts", import.meta.url);

test("savings goals own a same-named account amount type and legacy manual capital becomes a paired transfer", async () => {
  const [migration, goalAction, goalForm, transactionAction] = await Promise.all([
    readFile(migrationPath, "utf8"),
    readFile(goalActionPath, "utf8"),
    readFile(goalFormPath, "utf8"),
    readFile(transactionActionPath, "utf8"),
  ]);

  assert.match(migration, /sync_savings_goal_amount_type/);
  assert.match(migration, /'savings_goal_id', new\.id/);
  assert.match(migration, /'transfer_direction', 'debit'/);
  assert.match(migration, /'transfer_direction', 'credit'/);
  assert.match(migration, /opening_savings_migrated_to_ledger/);
  assert.match(goalAction, /account_amount_type: input\.name\.trim\(\)/);
  assert.match(goalAction, /Savings capital must be moved with a linked Transfer transaction/);
  assert.doesNotMatch(goalForm, /Already Saved \(Manual\)/);
  assert.match(goalForm, /Transfer transaction/);
  assert.match(transactionAction, /This amount type belongs to a savings goal/);
  assert.match(transactionAction, /managedSavingsGoalIdForAmountType/);
});
