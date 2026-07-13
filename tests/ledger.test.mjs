import assert from "node:assert/strict";
import test from "node:test";

import {
  buildAccountLedgerActivities,
  deriveCreditCardDebtMetadata,
  ledgerRelevantMetadata,
  summarizeFinancialPosition,
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

test("client summary metadata preserves payments and reversals", () => {
  assert.deepEqual(ledgerRelevantMetadata({
    credit_card_account_id: "card",
    credit_card_debt_impact: "repayment",
    credit_card_payment: true,
    internal_display_only: "discarded",
    reversed_credit_card_payment: true,
    reversed_transaction_id: "payment",
    reversed_transaction_type: "expense",
    transfer_direction: "credit",
  }), {
    credit_card_account_id: "card",
    credit_card_debt_impact: "repayment",
    credit_card_payment: true,
    reversed_credit_card_payment: true,
    reversed_transaction_id: "payment",
    reversed_transaction_type: "expense",
    transfer_direction: "credit",
  });
});

test("account financial position equals economic net across card settlement", () => {
  const charge = { account_id: "card", amount: 1_000, status: "cleared", type: "expense" };
  const payment = {
    account_id: "bank",
    amount: 1_000,
    metadata: {
      credit_card_account_id: "card",
      credit_card_debt_impact: "repayment",
      credit_card_payment: true,
    },
    status: "cleared",
    type: "expense",
  };
  const income = { account_id: "bank", amount: 10_000, status: "cleared", type: "income" };
  const transactions = [income, charge, payment];
  const activity = buildAccountLedgerActivities(transactions, accounts);
  const position = summarizeFinancialPosition({
    cashBalances: [...(activity.get("bank")?.deltas.values() ?? [])],
    creditCardBalances: [activity.get("card")?.creditUsed ?? 0],
  });

  assert.deepEqual(position, {
    cardCredit: 0,
    cardLiability: 0,
    cashBalance: 9_000,
    net: 9_000,
  });
  const clientSummary = summarizeLedgerTransactions(
    transactions.map((transaction) => ({
      ...transaction,
      metadata: ledgerRelevantMetadata(transaction.metadata),
    })),
  );
  assert.equal(position.net, clientSummary.net);
  assert.equal(clientSummary.net, summarizeLedgerTransactions(transactions).net);
});

test("card overpayment remains a card credit asset without increasing the limit", () => {
  const position = summarizeFinancialPosition({
    cashBalances: [8_500],
    creditCardBalances: [-500],
  });

  assert.deepEqual(position, {
    cardCredit: 500,
    cardLiability: 0,
    cashBalance: 8_500,
    net: 9_000,
  });
});
