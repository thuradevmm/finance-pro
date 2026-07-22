import {
  transactionStatusIsFinalized,
  transactionStatusReservesWorkingBalance,
} from "./transactions/status.ts";

export type LedgerAccountInput = {
  id: string;
  type?: string | null;
};

export type CreditCardDebtInput = {
  id: string;
  metadata?: unknown;
  payment_account_id?: string | null;
  type?: string | null;
};

export type LedgerTransactionInput = {
  account_id?: string | null;
  amount?: number | string | null;
  id?: string | null;
  metadata?: unknown;
  related_entity_id?: string | null;
  related_entity_type?: string | null;
  status?: string | null;
  transfer_account_id?: string | null;
  type?: string | null;
};

export type LedgerAccountActivity = {
  creditUsed: number;
  deltas: Map<string, number>;
  inflow: number;
  outflow: number;
  transactionCount: number;
};

export type LedgerSummary = {
  expenses: number;
  income: number;
  net: number;
};

export type EconomicTransactionDelta = {
  expenseDelta: number;
  incomeDelta: number;
};

export type FinancialPositionSummary = {
  cardCredit: number;
  cardLiability: number;
  cashBalance: number;
  net: number;
};

export type CreditCardDebtImpact = "charge" | "repayment" | "";

type LedgerEffect = {
  accountId: string;
  amount: number;
  amountType: string;
  cashDelta: number;
  creditUsedDelta: number;
  flow: "inflow" | "outflow";
  isCreditCard: boolean;
  transactionType: string;
};

export function metadataRecord(metadata: unknown) {
  return metadata && typeof metadata === "object" && !Array.isArray(metadata)
    ? metadata as Record<string, unknown>
    : {};
}

const ledgerRelevantMetadataKeys = [
  "account_amount_type",
  "credit_card_account_id",
  "credit_card_debt_id",
  "credit_card_debt_impact",
  "credit_card_payment",
  "financial_event",
  "future_link_label",
  "reversed_credit_card_payment",
  "reversed_transaction_id",
  "reversed_transaction_type",
  "same_account_transfer_role",
  "transfer_account_amount_type",
  "transfer_direction",
] as const;

/**
 * Keeps metadata required after database rows are mapped into client-side
 * transaction records. This includes accounting classifications and stable
 * display snapshots such as a future plan's linked-record label.
 */
export function ledgerRelevantMetadata(metadata: unknown) {
  const source = metadataRecord(metadata);
  return Object.fromEntries(
    ledgerRelevantMetadataKeys
      .filter((key) => source[key] !== undefined)
      .map((key) => [key, source[key]]),
  );
}

export function numericValue(value: unknown, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

export function roundCurrencyValue(value: number) {
  if (!Number.isFinite(value) || value === 0) return 0;
  const roundedMagnitude = Math.round((Math.abs(value) + Number.EPSILON) * 100) / 100;
  return value < 0 ? -roundedMagnitude : roundedMagnitude;
}

/**
 * Net financial position is signed cash plus any card overpayment credit,
 * minus outstanding card liability. A credit-card limit is not an asset and
 * therefore never contributes to this total.
 */
export function summarizeFinancialPosition(input: {
  cashBalances: number[];
  creditCardBalances: number[];
}): FinancialPositionSummary {
  const cashBalance = roundCurrencyValue(input.cashBalances.reduce((sum, value) => sum + numericValue(value), 0));
  const cardLiability = roundCurrencyValue(
    input.creditCardBalances.reduce((sum, value) => sum + Math.max(numericValue(value), 0), 0),
  );
  const cardCredit = roundCurrencyValue(
    input.creditCardBalances.reduce((sum, value) => sum + Math.max(-numericValue(value), 0), 0),
  );

  return {
    cardCredit,
    cardLiability,
    cashBalance,
    net: roundCurrencyValue(cashBalance + cardCredit - cardLiability),
  };
}

export function normalizeAmountType(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : "General";
}

export function normalizeAccountType(value: unknown) {
  const key = String(value ?? "").trim().toLowerCase().replace(/[\s-]+/g, "_");
  if (key === "bankaccount") return "bank_account";
  if (key === "cashwallet") return "cash_wallet";
  if (key === "creditcard") return "credit_card";
  if (key === "digitalwallet") return "digital_wallet";
  return key;
}

export function isCreditCardType(value: unknown) {
  return normalizeAccountType(value) === "credit_card";
}

export function transactionStatusAffectsBalance(value: unknown) {
  return transactionStatusReservesWorkingBalance(value);
}

export function transferDirection(metadata: Record<string, unknown>) {
  const direction = typeof metadata.transfer_direction === "string" ? metadata.transfer_direction.toLowerCase() : "";
  if (direction === "debit" || direction === "credit") return direction;

  const legacyRole = typeof metadata.same_account_transfer_role === "string" ? metadata.same_account_transfer_role.toLowerCase() : "";
  if (legacyRole === "out") return "debit";
  if (legacyRole === "in") return "credit";
  return "";
}

export function creditCardDebtImpact(metadata: Record<string, unknown>): CreditCardDebtImpact {
  const impact = typeof metadata.credit_card_debt_impact === "string"
    ? metadata.credit_card_debt_impact.trim().toLowerCase()
    : "";
  return impact === "charge" || impact === "repayment" ? impact : "";
}

export function creditCardAccountId(metadata: Record<string, unknown>) {
  return typeof metadata.credit_card_account_id === "string" ? metadata.credit_card_account_id : "";
}

export function isCreditCardPayment(metadata: Record<string, unknown>) {
  return metadata.credit_card_payment === true || metadata.financial_event === "credit_card_payment";
}

export function reversedTransactionType(transaction: Pick<LedgerTransactionInput, "metadata" | "type">) {
  const metadata = metadataRecord(transaction.metadata);
  if (typeof metadata.reversed_transaction_id !== "string" || !metadata.reversed_transaction_id) return "";

  const explicitType = typeof metadata.reversed_transaction_type === "string"
    ? metadata.reversed_transaction_type.trim().toLowerCase()
    : "";
  if (explicitType === "income" || explicitType === "expense" || explicitType === "transfer") return explicitType;

  // Older reversals did not persist the source type. The reversal action uses
  // the opposite income/expense type, so this inference preserves their
  // economic meaning without rewriting historical rows.
  const transactionType = String(transaction.type ?? "").trim().toLowerCase();
  if (transactionType === "income") return "expense";
  if (transactionType === "expense") return "income";
  if (transactionType === "transfer") return "transfer";
  return "";
}

/**
 * Returns signed economic income and expense deltas for reports, categories,
 * budgets, and forecasts. Reversal rows reduce the original economic bucket;
 * credit-card settlements are liability movements and therefore contribute to
 * neither income nor spending.
 */
export function economicTransactionDelta(transaction: LedgerTransactionInput): EconomicTransactionDelta {
  const empty = { expenseDelta: 0, incomeDelta: 0 };
  if (!transactionStatusIsFinalized(transaction.status)) return empty;

  const amount = roundCurrencyValue(Math.abs(numericValue(transaction.amount)));
  if (amount <= 0) return empty;

  const metadata = metadataRecord(transaction.metadata);
  const reversalType = reversedTransactionType(transaction);
  if (isCreditCardPayment(metadata) || (reversalType && metadata.reversed_credit_card_payment === true)) return empty;

  if (reversalType === "expense") return { expenseDelta: -amount, incomeDelta: 0 };
  if (reversalType === "income") return { expenseDelta: 0, incomeDelta: -amount };
  if (reversalType) return empty;

  const transactionType = String(transaction.type ?? "").trim().toLowerCase();
  if (transactionType === "expense") return { expenseDelta: amount, incomeDelta: 0 };
  if (transactionType === "income") return { expenseDelta: 0, incomeDelta: amount };
  return empty;
}

/**
 * Linked savings goals and asset purchases treat a posted Expense (or the
 * debit half of a Transfer) as one contribution. A posted reversal subtracts
 * it. Arbitrary Income and the credit half of paired transfers are ignored.
 */
export function linkedExpenseContributionDelta(transaction: LedgerTransactionInput) {
  if (!transactionStatusIsFinalized(transaction.status)) return 0;
  const amount = roundCurrencyValue(Math.abs(numericValue(transaction.amount)));
  if (amount <= 0) return 0;

  const metadata = metadataRecord(transaction.metadata);
  const reversalType = reversedTransactionType(transaction);
  const transactionType = String(transaction.type ?? "").trim().toLowerCase();

  if (transactionType === "transfer") {
    const direction = transferDirection(metadata);
    if (direction === "credit") return 0;
    return reversalType === "transfer" ? -amount : reversalType ? 0 : amount;
  }

  if (reversalType === "expense" && transactionType === "income") return -amount;
  if (reversalType) return 0;
  return transactionType === "expense" ? amount : 0;
}

function debtCreditCardAccountId(debt: CreditCardDebtInput, creditCardAccountIds: Set<string>) {
  const metadata = metadataRecord(debt.metadata);
  if (typeof metadata.credit_card_account_id === "string") return metadata.credit_card_account_id;
  if (typeof metadata.auto_credit_card_account_id === "string") return metadata.auto_credit_card_account_id;
  const normalizedDebtType = String(debt.type ?? metadata.type ?? "").trim().toLowerCase().replace(/[\s_-]+/g, "");
  if (normalizedDebtType === "creditcard" && debt.payment_account_id && creditCardAccountIds.has(debt.payment_account_id)) {
    return debt.payment_account_id;
  }
  return "";
}

/**
 * Derives metadata for legacy linked debt payments without rewriting the row.
 * A migration persists the same classification, while this read-time fallback
 * makes pre-migration production data correct as soon as the application code
 * is deployed.
 */
export function deriveCreditCardDebtMetadata(
  transaction: LedgerTransactionInput,
  debts: CreditCardDebtInput[],
  accounts: LedgerAccountInput[],
) {
  const metadata = metadataRecord(transaction.metadata);
  if (creditCardDebtImpact(metadata) && creditCardAccountId(metadata)) return metadata;

  const debtId = typeof metadata.credit_card_debt_id === "string" && metadata.credit_card_debt_id
    ? metadata.credit_card_debt_id
    : transaction.related_entity_type === "debt" && transaction.related_entity_id
      ? transaction.related_entity_id
      : "";
  if (!debtId) return metadata;

  const creditCardAccountIds = new Set(accounts.filter((account) => isCreditCardType(account.type)).map((account) => account.id));
  const debt = debts.find((item) => item.id === debtId);
  if (!debt) return metadata;
  const linkedAccountId = debtCreditCardAccountId(debt, creditCardAccountIds);
  if (!linkedAccountId) return metadata;

  const transactionType = String(transaction.type ?? "").toLowerCase();
  const direction = transferDirection(metadata);
  const usesCreditCardAccount = transaction.account_id === linkedAccountId;
  const paysCreditCardAccount = transaction.transfer_account_id === linkedAccountId;
  const physicallyTouchesCard = usesCreditCardAccount || paysCreditCardAccount;
  const isReversal = typeof metadata.reversed_transaction_id === "string" && metadata.reversed_transaction_id;

  if (physicallyTouchesCard) {
    let impact: CreditCardDebtImpact = "";
    if (transactionType === "transfer" && direction) {
      // The metadata is duplicated across paired rows; the card-primary half
      // alone represents the liability movement.
      if (!usesCreditCardAccount) return metadata;
      impact = direction === "debit" ? "charge" : "repayment";
    } else if (usesCreditCardAccount && transactionType === "expense") {
      impact = "charge";
    } else if (usesCreditCardAccount && transactionType === "income") {
      impact = "repayment";
    } else if (transactionType === "transfer" && paysCreditCardAccount) {
      impact = "repayment";
    }
    if (!impact) return metadata;

    const isPayment = impact === "repayment" && transactionType === "income" && !isReversal;
    const isPaymentReversal = Boolean(isReversal && metadata.reversed_credit_card_payment === true);
    return {
      ...metadata,
      credit_card_account_id: linkedAccountId,
      credit_card_debt_id: debtId,
      credit_card_debt_impact: impact,
      credit_card_payment: isPayment,
      financial_event: isPaymentReversal
        ? "credit_card_payment_reversal"
        : isReversal ? "credit_card_activity_reversal" : impact === "charge" ? "credit_card_charge" : isPayment ? "credit_card_payment" : "credit_card_credit",
      ...(isPaymentReversal ? { reversed_credit_card_payment: true } : {}),
    };
  }

  const isRepayment = transactionType === "expense" || (transactionType === "transfer" && direction !== "credit");
  const isPaymentReversal = transactionType === "income" && Boolean(isReversal);
  if (!isRepayment && !isPaymentReversal) return metadata;

  return {
    ...metadata,
    credit_card_account_id: linkedAccountId,
    credit_card_debt_id: debtId,
    credit_card_debt_impact: isPaymentReversal ? "charge" : "repayment",
    credit_card_payment: isRepayment,
    financial_event: isPaymentReversal ? "credit_card_payment_reversal" : "credit_card_payment",
    ...(isPaymentReversal ? { reversed_credit_card_payment: true } : {}),
  };
}

function emptyActivity(): LedgerAccountActivity {
  return { creditUsed: 0, deltas: new Map(), inflow: 0, outflow: 0, transactionCount: 0 };
}

function signedCashDelta(amount: number, isCreditCard: boolean, direction: "credit" | "debit") {
  if (isCreditCard) return 0;
  return direction === "credit" ? amount : -amount;
}

function signedCreditUsedDelta(amount: number, isCreditCard: boolean, direction: "credit" | "debit") {
  if (!isCreditCard) return 0;
  return direction === "credit" ? -amount : amount;
}

function accountTypeById(accounts: LedgerAccountInput[]) {
  return new Map(accounts.map((account) => [account.id, account.type ?? null]));
}

function ledgerEffects(transaction: LedgerTransactionInput, accountTypes: Map<string, string | null>): LedgerEffect[] {
  if (!transactionStatusAffectsBalance(transaction.status)) return [];

  const amount = Math.abs(numericValue(transaction.amount));
  if (amount <= 0) return [];

  const metadata = metadataRecord(transaction.metadata);
  const transactionType = String(transaction.type ?? "").toLowerCase();
  const direction = transferDirection(metadata);
  const amountType = normalizeAmountType(metadata.account_amount_type);
  const transferAmountType = normalizeAmountType(metadata.transfer_account_amount_type ?? metadata.account_amount_type);
  const effects: LedgerEffect[] = [];

  function pushEffect(accountId: string | null | undefined, effectAmountType: string, effectDirection: "credit" | "debit") {
    if (!accountId) return;
    const isCreditCard = isCreditCardType(accountTypes.get(accountId));
    effects.push({
      accountId,
      amount,
      amountType: effectAmountType,
      cashDelta: signedCashDelta(amount, isCreditCard, effectDirection),
      creditUsedDelta: signedCreditUsedDelta(amount, isCreditCard, effectDirection),
      flow: effectDirection === "credit" ? "inflow" : "outflow",
      isCreditCard,
      transactionType,
    });
  }

  if (transactionType === "income") {
    pushEffect(transaction.account_id, amountType, "credit");
  } else if (transactionType === "expense") {
    pushEffect(transaction.account_id, amountType, "debit");
  } else if (transactionType === "transfer") {
    if (direction === "credit") {
      pushEffect(transaction.account_id, amountType, "credit");
    } else {
      pushEffect(transaction.account_id, amountType, "debit");
    }

    if (!direction) {
      pushEffect(transaction.transfer_account_id, transferAmountType, "credit");
    }
  }

  // A payment recorded from a bank/wallet as an Expense has two accounting
  // effects: cash leaves the payment account and the card liability falls.
  // The second effect is virtual because the transaction row is not stored on
  // the credit-card account itself. Explicit metadata keeps that effect
  // deterministic for edits, reversals, imports, and historical backfills.
  const linkedCreditCardAccountId = creditCardAccountId(metadata);
  const linkedCreditCardImpact = creditCardDebtImpact(metadata);
  const physicallyTouchesLinkedCard = linkedCreditCardAccountId
    && (transaction.account_id === linkedCreditCardAccountId || transaction.transfer_account_id === linkedCreditCardAccountId);
  if (linkedCreditCardAccountId && linkedCreditCardImpact && !physicallyTouchesLinkedCard) {
    pushEffect(
      linkedCreditCardAccountId,
      "Credit Card",
      linkedCreditCardImpact === "repayment" ? "credit" : "debit",
    );
  }

  return effects;
}

export function buildAccountLedgerActivities(
  transactions: LedgerTransactionInput[],
  accounts: LedgerAccountInput[],
) {
  const activities = new Map<string, LedgerAccountActivity>();
  const accountTypes = accountTypeById(accounts);

  function getActivity(accountId: string) {
    const existing = activities.get(accountId);
    if (existing) return existing;
    const activity = emptyActivity();
    activities.set(accountId, activity);
    return activity;
  }

  for (const transaction of transactions) {
    for (const effect of ledgerEffects(transaction, accountTypes)) {
      const activity = getActivity(effect.accountId);
      activity.transactionCount += 1;
      if (effect.flow === "inflow") {
        activity.inflow = roundCurrencyValue(activity.inflow + effect.amount);
      } else {
        activity.outflow = roundCurrencyValue(activity.outflow + effect.amount);
      }
      if (effect.isCreditCard) {
        activity.creditUsed = roundCurrencyValue(activity.creditUsed + effect.creditUsedDelta);
      } else {
        activity.deltas.set(effect.amountType, roundCurrencyValue((activity.deltas.get(effect.amountType) ?? 0) + effect.cashDelta));
      }
    }
  }

  return activities;
}

export function summarizeLedgerTransactions(
  transactions: LedgerTransactionInput[],
): LedgerSummary {
  const summary: LedgerSummary = { expenses: 0, income: 0, net: 0 };

  for (const transaction of transactions) {
    const delta = economicTransactionDelta(transaction);
    summary.expenses = roundCurrencyValue(summary.expenses + delta.expenseDelta);
    summary.income = roundCurrencyValue(summary.income + delta.incomeDelta);
    summary.net = roundCurrencyValue(summary.income - summary.expenses);
  }

  return summary;
}
