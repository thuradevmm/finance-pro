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

export function numericValue(value: unknown, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

export function roundCurrencyValue(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
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
  const status = String(value ?? "cleared").trim().toLowerCase();
  return !["scheduled", "cancelled", "canceled", "void", "failed"].includes(status);
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

function debtCreditCardAccountId(debt: CreditCardDebtInput, creditCardAccountIds: Set<string>) {
  const metadata = metadataRecord(debt.metadata);
  if (typeof metadata.credit_card_account_id === "string") return metadata.credit_card_account_id;
  if (typeof metadata.auto_credit_card_account_id === "string") return metadata.auto_credit_card_account_id;
  if (debt.payment_account_id && creditCardAccountIds.has(debt.payment_account_id)) return debt.payment_account_id;
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

  const debtId = transaction.related_entity_type === "debt" && transaction.related_entity_id
    ? transaction.related_entity_id
    : typeof metadata.credit_card_debt_id === "string" ? metadata.credit_card_debt_id : "";
  if (!debtId) return metadata;

  const creditCardAccountIds = new Set(accounts.filter((account) => isCreditCardType(account.type)).map((account) => account.id));
  const debt = debts.find((item) => item.id === debtId);
  if (!debt) return metadata;
  const linkedAccountId = debtCreditCardAccountId(debt, creditCardAccountIds);
  if (!linkedAccountId) return metadata;

  const physicallyTouchesCard = transaction.account_id === linkedAccountId || transaction.transfer_account_id === linkedAccountId;
  if (physicallyTouchesCard) return metadata;

  const transactionType = String(transaction.type ?? "").toLowerCase();
  const direction = transferDirection(metadata);
  const isRepayment = transactionType === "expense" || (transactionType === "transfer" && direction !== "credit");
  const isPaymentReversal = transactionType === "income" && typeof metadata.reversed_transaction_id === "string";
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
    if (!transactionStatusAffectsBalance(transaction.status)) continue;
    const amount = Math.abs(numericValue(transaction.amount));
    if (amount <= 0) continue;

    const metadata = metadataRecord(transaction.metadata);
    const transactionType = String(transaction.type ?? "").toLowerCase();
    const isReversal = typeof metadata.reversed_transaction_id === "string" && metadata.reversed_transaction_id !== "";
    const reversedType = typeof metadata.reversed_transaction_type === "string"
      ? metadata.reversed_transaction_type.toLowerCase()
      : "";

    // Paying a credit-card balance settles a liability; it is not a second
    // expense after the original card purchase. A reversal of that payment is
    // likewise not income. Card purchases themselves remain normal expenses.
    if (isCreditCardPayment(metadata) || (isReversal && metadata.reversed_credit_card_payment === true)) continue;

    if (isReversal && (reversedType === "expense" || (!reversedType && transactionType === "income"))) {
      summary.expenses = roundCurrencyValue(summary.expenses - amount);
      summary.net = roundCurrencyValue(summary.net + amount);
    } else if (isReversal && (reversedType === "income" || (!reversedType && transactionType === "expense"))) {
      summary.income = roundCurrencyValue(summary.income - amount);
      summary.net = roundCurrencyValue(summary.net - amount);
    } else if (transactionType === "income") {
      summary.income = roundCurrencyValue(summary.income + amount);
      summary.net = roundCurrencyValue(summary.net + amount);
    } else if (transactionType === "expense") {
      summary.expenses = roundCurrencyValue(summary.expenses + amount);
      summary.net = roundCurrencyValue(summary.net - amount);
    }
  }

  return summary;
}
