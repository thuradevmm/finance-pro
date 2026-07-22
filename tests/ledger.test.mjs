import assert from "node:assert/strict";
import test from "node:test";

import {
  buildAccountLedgerActivities,
  deriveCreditCardDebtMetadata,
  economicTransactionDelta,
  ledgerRelevantMetadata,
  linkedExpenseContributionDelta,
  roundCurrencyValue,
  summarizeFinancialPosition,
  summarizeLedgerTransactions,
} from "../src/lib/ledger.ts";

test("currency rounding is sign-symmetric and economic reversals cancel exactly", () => {
  assert.equal(roundCurrencyValue(1.005), 1.01);
  assert.equal(roundCurrencyValue(-1.005), -1.01);
  assert.deepEqual(economicTransactionDelta({ amount: 1.005, status: "cleared", type: "expense" }), { expenseDelta: 1.01, incomeDelta: 0 });
  assert.deepEqual(economicTransactionDelta({ amount: 1.005, metadata: { reversed_transaction_id: "source", reversed_transaction_type: "expense" }, status: "cleared", type: "income" }), { expenseDelta: -1.01, incomeDelta: 0 });
});

test("linked contributions count one posted debit and ignore its pair and cancelled rows", () => {
  assert.equal(linkedExpenseContributionDelta({ amount: 200, metadata: { transfer_direction: "debit" }, status: "cleared", type: "transfer" }), 200);
  assert.equal(linkedExpenseContributionDelta({ amount: 200, metadata: { transfer_direction: "credit" }, status: "cleared", type: "transfer" }), 0);
  assert.equal(linkedExpenseContributionDelta({ amount: 200, metadata: { transfer_direction: "debit" }, status: "scheduled", type: "transfer" }), 0);
  assert.equal(linkedExpenseContributionDelta({ amount: 200, metadata: { reversed_transaction_id: "source", reversed_transaction_type: "transfer", transfer_direction: "debit" }, status: "cleared", type: "transfer" }), -200);
});

test("pending rows reserve working balance without becoming finalized actuals", () => {
  const pending = { account_id: "bank", amount: 250, status: "pending", type: "expense" };
  const activity = buildAccountLedgerActivities([pending], [{ id: "bank", type: "bank_account" }]);

  assert.equal(activity.get("bank")?.deltas.get("General"), -250);
  assert.deepEqual(economicTransactionDelta(pending), { expenseDelta: 0, incomeDelta: 0 });
  assert.equal(linkedExpenseContributionDelta(pending), 0);
});

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

test("client summary metadata preserves payments, reversals, and future link labels", () => {
  assert.deepEqual(ledgerRelevantMetadata({
    credit_card_account_id: "card",
    credit_card_debt_impact: "repayment",
    credit_card_payment: true,
    future_link_amount_snapshot: 275,
    future_link_label: "Subscription · Cloud storage",
    future_predicted_amount: 325,
    future_prediction_mode: "explicit",
    internal_display_only: "discarded",
    reversed_credit_card_payment: true,
    reversed_transaction_id: "payment",
    reversed_transaction_type: "expense",
    transfer_direction: "credit",
  }), {
    credit_card_account_id: "card",
    credit_card_debt_impact: "repayment",
    credit_card_payment: true,
    future_link_amount_snapshot: 275,
    future_link_label: "Subscription · Cloud storage",
    future_predicted_amount: 325,
    future_prediction_mode: "explicit",
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
