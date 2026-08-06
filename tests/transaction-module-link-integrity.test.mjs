import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const projectRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

function source(path) {
  return readFileSync(join(projectRoot, path), "utf8");
}

test("linked module records with transaction history cannot be deleted", () => {
  const assets = source("src/app/assets/actions.ts");
  const savings = source("src/app/savings-goals/actions.ts");
  const subscriptions = source("src/app/subscriptions/actions.ts");

  assert.match(assets, /from\("transactions"\)[\s\S]*related_entity_type", "asset"/);
  assert.match(assets, /Change its status to Archived so its transactions remain reconcilable/);
  assert.match(savings, /from\("transactions"\)[\s\S]*related_entity_type", "savings_goal"/);
  assert.match(savings, /linked financial history and cannot be deleted/);
  assert.match(subscriptions, /from\("subscription_payments"\)/);
  assert.match(subscriptions, /Change its status to Paused so its transactions remain reconcilable/);
});

test("account amount-type replacement migrates all linked transaction fields and module records", () => {
  const actions = source("src/app/accounts/actions.ts");

  assert.match(actions, /migrateField\("account_amount_type"\)/);
  assert.match(actions, /migrateField\("transfer_account_amount_type"\)/);
  assert.match(actions, /migrateField\("counter_account_amount_type"\)/);
  assert.match(actions, /from\("savings_goals"\)[\s\S]*account_amount_type: next/);
  assert.match(actions, /from\("debts"\)[\s\S]*origination_account_amount_type: next/);
  assert.match(actions, /metadata->>account_id/);
  assert.match(actions, /metadata->>payment_account_id/);
});

test("future planning enforces the same linked-record direction and category rules as transactions", () => {
  const actions = source("src/app/future-planning/actions.ts");
  const links = source("src/lib/future-planning/link-options.ts");
  const actuals = source("src/lib/future-planning/supabase.ts");

  assert.match(actions, /categoryRowSupports\(categoryResult\.data, "Transactions", input\.type\)/);
  assert.match(actions, /Savings contributions must be planned as Credits/);
  assert.match(actions, /Returned lending money must be planned as a Credit/);
  assert.match(actions, /Borrowing repayments must be planned as Debits/);
  assert.match(links, /transactionType: "Income"/);
  assert.match(links, /debt\.nature === "Lending" \? "Income" : "Expense"/);
  assert.match(links, /goal\.contributionType === "Percentage"[\s\S]*\? 0/);
  assert.match(actuals, /transaction\.amountBaseValue/);
});

test("percentage savings notifications and copy use planned surplus as their basis", () => {
  const notifications = source("src/lib/notifications/supabase.ts");
  const form = source("src/features/savings-goals/add-savings-goal-form.tsx");
  const migration = source("supabase/migrations/20260806174500_savings_percentage_surplus_basis.sql");

  assert.match(notifications, /contributionType === "Percentage"/);
  assert.match(notifications, /planned surplus/);
  assert.match(form, /Planned surplus is planned Credit minus planned Debit before savings/);
  assert.match(migration, /contribution_basis', 'surplus'/);
});

test("savings transaction capacity uses base-currency values and the inbound transfer amount", () => {
  const actions = source("src/app/transactions/actions.ts");

  assert.match(actions, /transaction_date,metadata/);
  assert.match(actions, /contributionNativeAmount = input\.type === "Transfer" && savingsAction === "deposit"/);
  assert.match(actions, /input\.transferAmount \?\? input\.amount/);
  assert.match(actions, /contributionAmount,\s*linkedSavedAmount/);
  assert.match(actions, /Add an exchange rate for the savings account currency/);
});
