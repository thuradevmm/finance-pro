import assert from "node:assert/strict";
import test from "node:test";

import {
  buildAccountLedgerActivities,
  deriveCreditCardDebtMetadata,
  summarizeLedgerTransactions,
} from "../src/lib/ledger.ts";

const accounts = [
  { id: "bank", type: "bank_account" },
  { id: "card", type: "credit_card" },
];

const debts = [{
  id: "card-debt",
  metadata: { credit_card_account_id: "card" },
  payment_account_id: "card",
  type: "Credit Card",
}];

test("a linked bank expense restores the respective card utilization", () => {
  const charge = {
    account_id: "card",
    amount: 1_000,
    metadata: { account_amount_type: "Credit Card" },
    related_entity_id: "card-debt",
    related_entity_type: "debt",
    status: "cleared",
    type: "expense",
  };
  const legacyPayment = {
    account_id: "bank",
    amount: 1_000,
    metadata: { account_amount_type: "Operation" },
    related_entity_id: "card-debt",
    related_entity_type: "debt",
    status: "cleared",
    transfer_account_id: null,
    type: "expense",
  };
  const payment = {
    ...legacyPayment,
    metadata: deriveCreditCardDebtMetadata(legacyPayment, debts, accounts),
  };

  assert.deepEqual(payment.metadata, {
    account_amount_type: "Operation",
    credit_card_account_id: "card",
    credit_card_debt_id: "card-debt",
    credit_card_debt_impact: "repayment",
    credit_card_payment: true,
    financial_event: "credit_card_payment",
  });

  const activity = buildAccountLedgerActivities([charge, payment], accounts);
  assert.equal(activity.get("card")?.creditUsed, 0);
  assert.equal(activity.get("bank")?.deltas.get("Operation"), -1_000);
});

test("partial, scheduled, deleted-by-omission, and overpayments reconcile safely", () => {
  const charge = { account_id: "card", amount: 1_000, status: "cleared", type: "expense" };
  const partialPayment = {
    account_id: "bank",
    amount: 400,
    metadata: {
      credit_card_account_id: "card",
      credit_card_debt_impact: "repayment",
      credit_card_payment: true,
    },
    status: "cleared",
    type: "expense",
  };
  const scheduledPayment = { ...partialPayment, amount: 600, status: "scheduled" };

  assert.equal(buildAccountLedgerActivities([charge, partialPayment, scheduledPayment], accounts).get("card")?.creditUsed, 600);
  assert.equal(buildAccountLedgerActivities([charge], accounts).get("card")?.creditUsed, 1_000);
  assert.equal(buildAccountLedgerActivities([charge, { ...partialPayment, amount: 1_500 }], accounts).get("card")?.creditUsed, -500);
});

test("card purchases count as spending while card payments do not double-count it", () => {
  const transactions = [
    { account_id: "card", amount: 1_000, status: "cleared", type: "expense" },
    {
      account_id: "bank",
      amount: 1_000,
      metadata: {
        credit_card_account_id: "card",
        credit_card_debt_impact: "repayment",
        credit_card_payment: true,
      },
      status: "cleared",
      type: "expense",
    },
  ];

  assert.deepEqual(summarizeLedgerTransactions(transactions), {
    expenses: 1_000,
    income: 0,
    net: -1_000,
  });
});

test("reversing a purchase subtracts spending and reversing a payment is not income", () => {
  assert.deepEqual(summarizeLedgerTransactions([
    { account_id: "card", amount: 1_000, status: "cleared", type: "expense" },
    {
      account_id: "card",
      amount: 1_000,
      metadata: { reversed_transaction_id: "charge", reversed_transaction_type: "expense" },
      status: "cleared",
      type: "income",
    },
    {
      account_id: "bank",
      amount: 500,
      metadata: {
        reversed_credit_card_payment: true,
        reversed_transaction_id: "payment",
        reversed_transaction_type: "expense",
      },
      status: "cleared",
      type: "income",
    },
  ]), { expenses: 0, income: 0, net: 0 });
});
