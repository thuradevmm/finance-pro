import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { summarizeCreditCardLookup } from "../src/lib/accounts/card-display.ts";
import { canonicalAccountType } from "../src/lib/accounts/type-integrity.ts";
import {
  buildAccountLedgerActivities,
  summarizeLedgerTransactions,
  summarizeTransactionCards,
} from "../src/lib/ledger.ts";
import {
  reconcileFinancialPosition,
  reconciliationSeverity,
} from "../src/lib/reconciliation.ts";
import {
  buildCreditCardChargeJournal,
  buildCreditCardChargeJournalReversal,
} from "../src/lib/transactions/credit-card-journal.ts";
import {
  categoryTypeLabel,
  transactionTypeFromLabel,
  transactionTypeLabel,
} from "../src/lib/transactions/terminology.ts";

const cardJournalInput = {
  accountId: "aya-card",
  amount: 250,
  categoryId: "food",
  date: "2026-07-29",
  debtId: "aya-card-debt",
  groupId: "journal-1",
  note: "Lunch",
  relatedEntityId: "",
  relatedEntityType: "none",
  status: "cleared",
  title: "Lunch",
  userId: "user-1",
};

test("Credit and Debit labels preserve legacy storage compatibility", () => {
  assert.equal(transactionTypeLabel("Income"), "Credit");
  assert.equal(transactionTypeLabel("Expense"), "Debit");
  assert.equal(transactionTypeFromLabel("Credit"), "Income");
  assert.equal(transactionTypeFromLabel("Debit"), "Expense");
  assert.equal(transactionTypeFromLabel("Income"), "Income");
  assert.equal(categoryTypeLabel("Income"), "Credit");
  assert.equal(categoryTypeLabel("Expense"), "Debit");
});

test("AYA Visa and common card-family aliases use credit-card ledger semantics", () => {
  assert.equal(canonicalAccountType("AYA Visa"), "credit_card");
  assert.equal(canonicalAccountType("Visa"), "credit_card");
  assert.equal(canonicalAccountType("Mastercard"), "credit_card");

  const activity = buildAccountLedgerActivities(
    [{ account_id: "aya-card", amount: 400, status: "cleared", type: "expense" }],
    [{ id: "aya-card", type: "AYA Visa" }],
  ).get("aya-card");
  assert.equal(activity?.creditUsed, 400);
  assert.equal(activity?.deltas.size, 0);
});

test("card charges create linked Credit and Debit records without double-counting liability", () => {
  const rows = buildCreditCardChargeJournal(cardJournalInput, { accounting_version: 1 });
  assert.equal(rows.length, 2);
  assert.deepEqual(rows.map((row) => row.type), ["income", "expense"]);
  assert.deepEqual(rows.map((row) => row.metadata.credit_card_journal_role), ["liability_credit", "purchase_debit"]);
  assert.equal(rows[0].metadata.credit_card_journal_group_id, rows[1].metadata.credit_card_journal_group_id);

  const activity = buildAccountLedgerActivities(rows, [{ id: "aya-card", type: "AYA Visa" }]).get("aya-card");
  assert.equal(activity?.creditUsed, 250);
  assert.equal(activity?.credited, 250);
  assert.equal(activity?.debited, 250);
  assert.equal(activity?.inflow, 250);
  assert.equal(activity?.outflow, 250);
  assert.deepEqual(summarizeLedgerTransactions(rows), { expenses: 250, income: 0, net: -250 });
  assert.deepEqual(summarizeTransactionCards(rows), {
    expenses: 250,
    financingPayments: 0,
    financingReceipts: 250,
    income: 0,
    net: -250,
  });
});

test("card repayment reduces liability once and remains separate from credited activity", () => {
  const chargeRows = buildCreditCardChargeJournal(cardJournalInput, {});
  const repayment = {
    account_id: "bank",
    amount: 250,
    metadata: {
      credit_card_account_id: "aya-card",
      credit_card_debt_id: "aya-card-debt",
      credit_card_debt_impact: "repayment",
      credit_card_payment: true,
      financial_event: "credit_card_payment",
    },
    status: "cleared",
    type: "expense",
  };
  const activity = buildAccountLedgerActivities(
    [...chargeRows, repayment],
    [{ id: "aya-card", type: "AYA Visa" }, { id: "bank", type: "bank_account" }],
  );
  assert.equal(activity.get("aya-card")?.creditUsed, 0);
  assert.equal(activity.get("aya-card")?.credited, 250);
  assert.equal(activity.get("aya-card")?.repayments, 250);
  assert.equal(activity.get("bank")?.deltas.get("General"), -250);
});

test("credit-card cash advances increase liability and destination cash without operating spend", () => {
  const rows = [
    {
      account_id: "aya-card",
      amount: 100,
      metadata: {
        account_amount_type: "Credit Card",
        credit_card_account_id: "aya-card",
        credit_card_debt_impact: "charge",
        financial_event: "credit_card_cash_advance",
        transfer_account_amount_type: "General",
        transfer_direction: "debit",
        transfer_group_id: "advance-1",
      },
      status: "cleared",
      transfer_account_id: "bank",
      type: "transfer",
    },
    {
      account_id: "bank",
      amount: 100,
      metadata: {
        account_amount_type: "General",
        counter_account_id: "aya-card",
        credit_card_account_id: "aya-card",
        credit_card_debt_impact: "charge",
        financial_event: "credit_card_cash_advance",
        transfer_account_amount_type: "Credit Card",
        transfer_direction: "credit",
        transfer_group_id: "advance-1",
      },
      status: "cleared",
      transfer_account_id: "aya-card",
      type: "transfer",
    },
  ];
  const activities = buildAccountLedgerActivities(rows, [
    { id: "aya-card", type: "credit_card" },
    { id: "bank", type: "bank_account" },
  ]);
  assert.equal(activities.get("aya-card")?.creditUsed, 100);
  assert.equal(activities.get("aya-card")?.cashAdvances, 100);
  assert.equal(activities.get("bank")?.deltas.get("General"), 100);
  assert.equal(summarizeLedgerTransactions(rows).expenses, 0);
});

test("card repayments, refunds, fees, and interest use separate reversal-aware totals", () => {
  const cardAccount = [{ id: "aya-card", type: "AYA Visa" }];
  const rows = [
    { account_id: "aya-card", amount: 100, metadata: { credit_card_payment: true, financial_event: "credit_card_payment" }, status: "cleared", type: "income" },
    { account_id: "aya-card", amount: 100, metadata: { financial_event: "credit_card_payment_reversal", reversed_credit_card_payment: true, reversed_transaction_id: "payment", reversed_transaction_type: "income" }, status: "cleared", type: "expense" },
    { account_id: "aya-card", amount: 25, metadata: { financial_event: "credit_card_refund" }, status: "cleared", type: "income" },
    { account_id: "aya-card", amount: 25, metadata: { reversed_financial_event: "credit_card_refund", reversed_transaction_id: "refund", reversed_transaction_type: "income" }, status: "cleared", type: "expense" },
    { account_id: "aya-card", amount: 10, metadata: { financial_event: "credit_card_fee" }, status: "cleared", type: "expense" },
    { account_id: "aya-card", amount: 10, metadata: { reversed_financial_event: "credit_card_fee", reversed_transaction_id: "fee", reversed_transaction_type: "expense" }, status: "cleared", type: "income" },
    { account_id: "aya-card", amount: 5, metadata: { financial_event: "credit_card_interest" }, status: "cleared", type: "expense" },
  ];
  const activity = buildAccountLedgerActivities(rows, cardAccount).get("aya-card");
  assert.equal(activity?.repayments, 0);
  assert.equal(activity?.refunds, 0);
  assert.equal(activity?.fees, 0);
  assert.equal(activity?.interest, 5);
  assert.equal(activity?.credited, 0);
  assert.equal(activity?.debited, 0);
});

test("pending card journal reserves availability but is excluded from posted totals", () => {
  const rows = buildCreditCardChargeJournal({ ...cardJournalInput, status: "pending" }, {});
  const activity = buildAccountLedgerActivities(rows, [{ id: "aya-card", type: "AYA Visa" }]).get("aya-card");
  assert.equal(activity?.creditUsed, 250);
  assert.equal(activity?.inflow, 0);
  assert.equal(activity?.outflow, 0);
  assert.equal(activity?.pendingInflow, 250);
  assert.equal(activity?.pendingOutflow, 250);
  assert.deepEqual(summarizeLedgerTransactions(rows), { expenses: 0, income: 0, net: 0 });
});

test("card journal reversal cancels both liability and purchase activity", () => {
  const rows = buildCreditCardChargeJournal(cardJournalInput, {});
  const reversalRows = buildCreditCardChargeJournalReversal({
    ...cardJournalInput,
    groupId: "journal-reversal-1",
    liabilitySourceId: "liability-source",
    purchaseSourceId: "purchase-source",
    title: "Reversal of Lunch",
  }, {});
  const allRows = [...rows, ...reversalRows];
  const activity = buildAccountLedgerActivities(allRows, [{ id: "aya-card", type: "AYA Visa" }]).get("aya-card");
  assert.equal(activity?.creditUsed, 0);
  assert.equal(activity?.credited, 0);
  assert.equal(activity?.debited, 0);
  assert.deepEqual(summarizeTransactionCards(allRows), {
    expenses: 0,
    financingPayments: 0,
    financingReceipts: 0,
    income: 0,
    net: 0,
  });
});

test("combined card totals keep position and activity categories separate", () => {
  assert.deepEqual(summarizeCreditCardLookup([{
    available: 600,
    cardCredit: 0,
    cashAdvances: 0,
    charges: 450,
    credited: 500,
    debited: 450,
    fees: 10,
    interest: 5,
    limit: 1_000,
    minimumPayment: 50,
    outstanding: 400,
    pendingCredits: 20,
    pendingDebits: 30,
    payments: 100,
    refunds: 25,
    transactions: 4,
  }]), {
    available: 600,
    cardCredit: 0,
    cashAdvances: 0,
    charges: 450,
    credited: 500,
    debited: 450,
    fees: 10,
    interest: 5,
    minimumPayment: 50,
    netPosition: -400,
    outstanding: 400,
    payments: 100,
    pendingCredits: 20,
    pendingDebits: 30,
    refunds: 25,
    transactions: 4,
    limit: 1_000,
  });
});

test("reconciliation distinguishes a balanced bridge from a real difference", () => {
  const position = { cardCredit: 0, cardLiability: 0, cashBalance: 1_300, net: 1_300 };
  const balanced = reconcileFinancialPosition(position, [], { expenses: 200, income: 500 }, 1_000);
  const mismatch = reconcileFinancialPosition({ ...position, cashBalance: 1_400, net: 1_400 }, [], { expenses: 200, income: 500 }, 1_000);
  assert.equal(balanced.difference, 0);
  assert.equal(balanced.hasIndependentOpeningPosition, true);
  assert.equal(reconciliationSeverity(balanced.difference), "balanced");
  assert.equal(mismatch.difference, 100);
  assert.equal(reconciliationSeverity(mismatch.difference), "review");
});

test("loading skeletons cover distinct page structures and the migration guards journals", async () => {
  const [loadingSource, routeSource, migrationSource] = await Promise.all([
    readFile(new URL("../src/components/ui/loading-state.tsx", import.meta.url), "utf8"),
    readFile(new URL("../src/components/app/route-loading-fallback.tsx", import.meta.url), "utf8"),
    readFile(new URL("../supabase/migrations/202607290004_credit_debit_card_journals.sql", import.meta.url), "utf8"),
  ]);
  for (const skeleton of ["AccountsSkeleton", "TransactionsSkeleton", "PlanningSkeleton", "AuthSkeleton", "ComingSoonSkeleton", "StatusSkeleton", "DashboardSkeleton"]) {
    assert.match(loadingSource, new RegExp(`function ${skeleton}`));
  }
  assert.match(routeSource, /pathname === "\/accounts"\) return "accounts"/);
  assert.match(routeSource, /pathname === "\/transactions"\) return "transactions"/);
  assert.match(migrationSource, /uq_active_credit_card_journal_role/);
  assert.match(migrationSource, /ayavisa/);
  assert.match(migrationSource, /liability_credit/);
  assert.match(migrationSource, /purchase_debit/);
});
