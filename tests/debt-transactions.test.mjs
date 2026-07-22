import assert from "node:assert/strict";
import test from "node:test";

import {
  buildDebtTransactionLedgers,
  creditCardOpeningBalancesByAccount,
  debtTransactionLedgerFor,
  standaloneDebtPaymentTransactions,
} from "../src/lib/debts/transactions.ts";

test("standard debt progress counts posted repayments and cancels reversals", () => {
  const debt = { id: "loan", type: "Personal Loan" };
  const transactions = [
    { id: "payment", amount: 300, related_entity_id: "loan", related_entity_type: "debt", status: "cleared", transaction_date: "2026-07-01", type: "expense" },
    { id: "pending", amount: 100, related_entity_id: "loan", related_entity_type: "debt", status: "pending", transaction_date: "2026-07-02", type: "expense" },
    { id: "scheduled", amount: 200, related_entity_id: "loan", related_entity_type: "debt", status: "scheduled", transaction_date: "2026-07-02", type: "expense" },
    { id: "reversal", amount: 300, metadata: { reversed_transaction_id: "payment" }, related_entity_id: "loan", related_entity_type: "debt", status: "cleared", transaction_date: "2026-07-03", type: "income" },
  ];

  assert.deepEqual(debtTransactionLedgerFor(transactions, debt), {
    chargeActivity: [],
    charges: 0,
    repaymentActivity: [],
    repayments: 0,
  });
});

test("standalone debt payment rows count once and transaction-backed rows dedupe", () => {
  const synthetic = standaloneDebtPaymentTransactions([
    { amount: 200, debt_id: "loan", id: "manual", payment_date: "2026-07-01", transaction_id: null },
    { amount: 300, debt_id: "loan", id: "backed", payment_date: "2026-07-02", transaction_id: "transaction" },
  ]);
  assert.equal(debtTransactionLedgerFor(synthetic, { id: "loan", type: "Personal Loan" }).repayments, 200);
  assert.equal(debtTransactionLedgerFor(synthetic, { id: "loan", metadata: { credit_card_account_id: "card" }, type: "Credit Card" }).repayments, 0);
});

test("card charges, partial payments, transfer pairs, and dual debt links reconcile once", () => {
  const cardDebt = { id: "card-debt", metadata: { credit_card_account_id: "card" }, payment_account_id: "card", type: "Credit Card" };
  const loan = { id: "loan", type: "Personal Loan" };
  const transactions = [
    { id: "charge", account_id: "card", amount: 1_000, related_entity_id: "card-debt", related_entity_type: "debt", status: "cleared", transaction_date: "2026-07-01", type: "expense" },
    { id: "pay-debit", account_id: "bank", transfer_account_id: "card", amount: 400, metadata: { credit_card_debt_id: "card-debt", credit_card_debt_impact: "repayment", transfer_direction: "debit", transfer_group_id: "pay" }, related_entity_id: "card-debt", related_entity_type: "debt", status: "cleared", transaction_date: "2026-07-02", type: "transfer" },
    { id: "pay-credit", account_id: "card", transfer_account_id: "bank", amount: 400, metadata: { credit_card_debt_id: "card-debt", credit_card_debt_impact: "repayment", transfer_direction: "credit", transfer_group_id: "pay" }, related_entity_id: "card-debt", related_entity_type: "debt", status: "cleared", transaction_date: "2026-07-02", type: "transfer" },
    { id: "loan-from-card", account_id: "card", amount: 250, metadata: { credit_card_debt_id: "card-debt", credit_card_debt_impact: "charge" }, related_entity_id: "loan", related_entity_type: "debt", status: "cleared", transaction_date: "2026-07-03", type: "expense" },
  ];
  const ledgers = buildDebtTransactionLedgers(transactions, [cardDebt, loan]);

  assert.equal(ledgers.get("card-debt")?.charges, 1_250);
  assert.equal(ledgers.get("card-debt")?.repayments, 400);
  assert.equal(ledgers.get("loan")?.repayments, 250);
});

test("unpaired transfers unrelated to the linked card do not change its debt", () => {
  const debt = { id: "card-debt", metadata: { credit_card_account_id: "card" }, type: "Credit Card" };
  const transaction = { id: "unrelated", account_id: "bank-a", transfer_account_id: "bank-b", amount: 100, related_entity_id: "card-debt", related_entity_type: "debt", status: "cleared", type: "transfer" };
  assert.equal(debtTransactionLedgerFor([transaction], debt).repayments, 0);
});

test("manual card overpayment remains credit for a later charge", () => {
  const debt = { id: "manual", metadata: { credit_card_account_id: "card", manual_credit_card_terms: true }, payment_account_id: "card", repaid_amount: 1_500, total_amount: 1_000, type: "Credit Card" };
  const opening = creditCardOpeningBalancesByAccount([debt]).get("card");
  const ledger = debtTransactionLedgerFor([
    { id: "later-charge", account_id: "card", amount: 200, related_entity_id: "manual", related_entity_type: "debt", status: "cleared", type: "expense" },
  ], debt);

  assert.equal(opening, -500);
  assert.equal(opening + ledger.charges, -300);
  assert.equal(Math.max(1_000 + ledger.charges - 1_500, 0), 0);
});
