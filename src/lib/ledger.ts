import {
  transactionStatusIsFinalized,
  transactionStatusReservesWorkingBalance,
} from "./transactions/status.ts";
import {
  creditCardJournalRole,
  creditCardJournalRoleIsLiability,
  creditCardJournalRoleIsPurchase,
} from "./transactions/credit-card-journal.ts";

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
  cashAdvances: number;
  credited: number;
  creditUsed: number;
  debited: number;
  deltas: Map<string, number>;
  fees: number;
  inflow: number;
  interest: number;
  outflow: number;
  pendingInflow: number;
  pendingOutflow: number;
  repayments: number;
  refunds: number;
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

export type FinancingTransactionDelta = {
  paymentDelta: number;
  receiptDelta: number;
};

export type TransactionCardSummary = LedgerSummary & {
  financingPayments: number;
  financingReceipts: number;
};

export type FinancialPositionSummary = {
  cardCredit: number;
  cardLiability: number;
  cashBalance: number;
  net: number;
};

export type CreditCardDebtImpact = "charge" | "repayment" | "";
export type AccountingClass =
  | "financing_payment"
  | "financing_receipt"
  | "operating_expense"
  | "operating_income"
  | "transfer";

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
  "accounting_class",
  "accounting_version",
  "credit_card_account_id",
  "credit_card_debt_id",
  "credit_card_debt_impact",
  "credit_card_payment",
  "credit_card_journal_group_id",
  "credit_card_journal_role",
  "debt_interest_amount",
  "debt_principal_amount",
  "external_id",
  "external_source",
  "external_sync_group_id",
  "financial_event",
  "future_link_amount_snapshot",
  "future_link_label",
  "future_planning_amount_id",
  "future_predicted_amount",
  "future_prediction_mode",
  "reversed_credit_card_payment",
  "reversed_financial_event",
  "reversed_transaction_id",
  "reversed_transaction_type",
  "same_account_transfer_role",
  "transfer_account_amount_type",
  "transfer_counter_amount",
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
  if (["aya_visa", "visa", "visa_card", "mastercard", "mpu", "amex", "jcb", "unionpay"].includes(key)) {
    return "credit_card";
  }
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

export function accountingClass(metadata: Record<string, unknown>): AccountingClass | "" {
  const value = typeof metadata.accounting_class === "string"
    ? metadata.accounting_class.trim().toLowerCase()
    : "";
  return [
    "financing_payment",
    "financing_receipt",
    "operating_expense",
    "operating_income",
    "transfer",
  ].includes(value)
    ? value as AccountingClass
    : "";
}

function debtInterestAmount(metadata: Record<string, unknown>, amount: number) {
  if (metadata.debt_interest_amount == null || metadata.debt_interest_amount === "") return 0;
  return roundCurrencyValue(Math.min(Math.max(numericValue(metadata.debt_interest_amount), 0), amount));
}

function debtPrincipalAmount(metadata: Record<string, unknown>, amount: number) {
  if (metadata.debt_principal_amount != null && metadata.debt_principal_amount !== "") {
    return roundCurrencyValue(Math.min(Math.max(numericValue(metadata.debt_principal_amount), 0), amount));
  }
  return roundCurrencyValue(Math.max(amount - debtInterestAmount(metadata, amount), 0));
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

function debtFinancingMovement(transaction: LedgerTransactionInput, metadata: Record<string, unknown>) {
  if (isCreditCardPayment(metadata) || metadata.reversed_credit_card_payment === true) return true;
  if (String(transaction.related_entity_type ?? "").trim().toLowerCase() !== "debt" || !transaction.related_entity_id) return false;

  const primaryDebtId = transaction.related_entity_id;
  const creditDebtId = typeof metadata.credit_card_debt_id === "string" ? metadata.credit_card_debt_id : "";
  // Paying a standard debt with a credit card has a primary standard-debt
  // settlement plus a secondary card charge. It remains financing activity.
  if (creditDebtId && creditDebtId !== primaryDebtId) return true;

  const impact = creditCardDebtImpact(metadata);
  if (impact === "charge") return false;
  // A purchase reversal stores the inverse card impact ("repayment"), but it
  // reverses operating spending rather than representing a card settlement.
  if (
    reversedTransactionType(transaction) === "expense"
    && metadata.financial_event === "credit_card_activity_reversal"
    && metadata.reversed_credit_card_payment !== true
  ) return false;
  return true;
}

/**
 * Separates liability/receivable movements from operating income and expense.
 * Positive values are posted financing activity; reversals subtract from the
 * original bucket. This works for current metadata and legacy debt links that
 * only persisted related_entity_type/id.
 */
export function financingTransactionDelta(transaction: LedgerTransactionInput): FinancingTransactionDelta {
  const empty = { paymentDelta: 0, receiptDelta: 0 };
  if (!transactionStatusIsFinalized(transaction.status)) return empty;

  const amount = roundCurrencyValue(Math.abs(numericValue(transaction.amount)));
  if (amount <= 0) return empty;

  const metadata = metadataRecord(transaction.metadata);
  const explicitClass = accountingClass(metadata);
  if (explicitClass) {
    const isTransferCredit = String(transaction.type ?? "").trim().toLowerCase() === "transfer"
      && transferDirection(metadata) === "credit";
    if (isTransferCredit || !["financing_payment", "financing_receipt"].includes(explicitClass)) return empty;
    const principalAmount = debtPrincipalAmount(metadata, amount);
    const sign = reversedTransactionType(transaction) ? -1 : 1;
    return explicitClass === "financing_payment"
      ? { paymentDelta: roundCurrencyValue(sign * principalAmount), receiptDelta: 0 }
      : { paymentDelta: 0, receiptDelta: roundCurrencyValue(sign * principalAmount) };
  }
  if (!debtFinancingMovement(transaction, metadata)) return empty;

  const reversalType = reversedTransactionType(transaction);
  if (reversalType === "expense") return { paymentDelta: -amount, receiptDelta: 0 };
  if (reversalType === "transfer") {
    return transferDirection(metadata) === "credit" ? empty : { paymentDelta: -amount, receiptDelta: 0 };
  }
  if (reversalType === "income") return { paymentDelta: 0, receiptDelta: -amount };
  if (reversalType) return empty;

  const transactionType = String(transaction.type ?? "").trim().toLowerCase();
  if (transactionType === "transfer") {
    // Paired transfers copy the related record to both rows. Only the debit
    // half is the principal payment; counting the credit half would double it.
    return transferDirection(metadata) === "credit" ? empty : { paymentDelta: amount, receiptDelta: 0 };
  }
  if (transactionType === "expense") return { paymentDelta: amount, receiptDelta: 0 };
  if (transactionType === "income") return { paymentDelta: 0, receiptDelta: amount };
  return empty;
}

/**
 * Returns signed economic income and expense deltas for categories, planning,
 * and dashboard summaries. Reversal rows reduce the original economic bucket;
 * debt/card settlements and receivable returns are financing movements and
 * therefore contribute to neither operating income nor spending.
 */
export function economicTransactionDelta(transaction: LedgerTransactionInput): EconomicTransactionDelta {
  const empty = { expenseDelta: 0, incomeDelta: 0 };
  if (!transactionStatusIsFinalized(transaction.status)) return empty;

  const amount = roundCurrencyValue(Math.abs(numericValue(transaction.amount)));
  if (amount <= 0) return empty;

  const metadata = metadataRecord(transaction.metadata);
  const reversalType = reversedTransactionType(transaction);
  const explicitClass = accountingClass(metadata);
  if (explicitClass) {
    const sign = reversalType ? -1 : 1;
    if (explicitClass === "operating_expense") {
      return { expenseDelta: roundCurrencyValue(sign * amount), incomeDelta: 0 };
    }
    if (explicitClass === "operating_income") {
      return { expenseDelta: 0, incomeDelta: roundCurrencyValue(sign * amount) };
    }
    if (
      explicitClass === "financing_payment"
      && !(String(transaction.type ?? "").trim().toLowerCase() === "transfer" && transferDirection(metadata) === "credit")
    ) {
      return {
        expenseDelta: roundCurrencyValue(sign * debtInterestAmount(metadata, amount)),
        incomeDelta: 0,
      };
    }
    return empty;
  }
  const financing = financingTransactionDelta(transaction);
  if (financing.paymentDelta !== 0 || financing.receiptDelta !== 0) return empty;

  if (reversalType === "expense") return { expenseDelta: -amount, incomeDelta: 0 };
  if (reversalType === "income") return { expenseDelta: 0, incomeDelta: -amount };
  if (reversalType) return empty;

  const transactionType = String(transaction.type ?? "").trim().toLowerCase();
  if (transactionType === "expense") return { expenseDelta: amount, incomeDelta: 0 };
  if (transactionType === "income") return { expenseDelta: 0, incomeDelta: amount };
  return empty;
}

/**
 * Returns literal posted transaction-type totals for the Transactions page.
 * Every finalized Income or Expense row contributes to its displayed type,
 * including debt/card activity. A reversal subtracts from the original type.
 */
export function cashflowTransactionDelta(transaction: LedgerTransactionInput): EconomicTransactionDelta {
  if (!transactionStatusIsFinalized(transaction.status)) return { expenseDelta: 0, incomeDelta: 0 };
  const amount = roundCurrencyValue(Math.abs(numericValue(transaction.amount)));
  if (amount <= 0) return { expenseDelta: 0, incomeDelta: 0 };

  const reversalType = reversedTransactionType(transaction);
  if (reversalType === "expense") return { expenseDelta: -amount, incomeDelta: 0 };
  if (reversalType === "income") return { expenseDelta: 0, incomeDelta: -amount };
  if (reversalType) return { expenseDelta: 0, incomeDelta: 0 };

  const transactionType = String(transaction.type ?? "").trim().toLowerCase();
  if (transactionType === "expense") return { expenseDelta: amount, incomeDelta: 0 };
  if (transactionType === "income") return { expenseDelta: 0, incomeDelta: amount };
  return { expenseDelta: 0, incomeDelta: 0 };
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
  if (creditCardJournalRoleIsPurchase(creditCardJournalRole(metadata))) return metadata;
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
  return {
    cashAdvances: 0,
    credited: 0,
    creditUsed: 0,
    debited: 0,
    deltas: new Map(),
    fees: 0,
    inflow: 0,
    interest: 0,
    outflow: 0,
    pendingInflow: 0,
    pendingOutflow: 0,
    repayments: 0,
    refunds: 0,
    transactionCount: 0,
  };
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

function ledgerEffects(
  transaction: LedgerTransactionInput,
  accountTypes: Map<string, string | null>,
  includeNonBalanceStatuses = false,
): LedgerEffect[] {
  if (!includeNonBalanceStatuses && !transactionStatusAffectsBalance(transaction.status)) return [];

  const amount = Math.abs(numericValue(transaction.amount));
  if (amount <= 0) return [];

  const metadata = metadataRecord(transaction.metadata);
  const transactionType = String(transaction.type ?? "").toLowerCase();
  const direction = transferDirection(metadata);
  const amountType = normalizeAmountType(metadata.account_amount_type);
  const transferAmountType = normalizeAmountType(metadata.transfer_account_amount_type ?? metadata.account_amount_type);
  const effects: LedgerEffect[] = [];

  function pushEffect(
    accountId: string | null | undefined,
    effectAmountType: string,
    effectDirection: "credit" | "debit",
    balanceMode: "default" | "liability_decrease" | "liability_increase" | "none" = "default",
  ) {
    if (!accountId) return;
    const isCreditCard = isCreditCardType(accountTypes.get(accountId));
    effects.push({
      accountId,
      amount,
      amountType: effectAmountType,
      cashDelta: balanceMode === "none" ? 0 : signedCashDelta(amount, isCreditCard, effectDirection),
      creditUsedDelta: balanceMode === "none"
        ? 0
        : balanceMode === "liability_decrease" && isCreditCard
          ? -amount
        : balanceMode === "liability_increase" && isCreditCard
          ? amount
          : signedCreditUsedDelta(amount, isCreditCard, effectDirection),
      flow: effectDirection === "credit" ? "inflow" : "outflow",
      isCreditCard,
      transactionType,
    });
  }

  const journalRole = creditCardJournalRole(metadata);
  if (transactionType === "income") {
    pushEffect(
      transaction.account_id,
      amountType,
      "credit",
      creditCardJournalRoleIsPurchase(journalRole)
        ? "none"
        : creditCardJournalRoleIsLiability(journalRole)
          ? journalRole === "liability_credit_reversal" ? "default" : "liability_increase"
          : "default",
    );
  } else if (transactionType === "expense") {
    pushEffect(
      transaction.account_id,
      amountType,
      "debit",
      creditCardJournalRoleIsPurchase(journalRole)
        ? "none"
        : journalRole === "liability_credit_reversal"
          ? "liability_decrease"
          : "default",
    );
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
    const countedAccountIds = new Set<string>();
    for (const effect of ledgerEffects(transaction, accountTypes, true)) {
      if (countedAccountIds.has(effect.accountId)) continue;
      countedAccountIds.add(effect.accountId);
      getActivity(effect.accountId).transactionCount += 1;
    }

    for (const effect of ledgerEffects(transaction, accountTypes)) {
      const activity = getActivity(effect.accountId);
      const transactionMetadata = metadataRecord(transaction.metadata);
      const journalRole = creditCardJournalRole(transactionMetadata);
      if (transactionStatusIsFinalized(transaction.status)) {
        if (effect.flow === "inflow") {
          activity.inflow = roundCurrencyValue(activity.inflow + effect.amount);
        } else {
          activity.outflow = roundCurrencyValue(activity.outflow + effect.amount);
        }
        if (effect.isCreditCard) {
          const financialEvent = String(transactionMetadata.financial_event ?? "");
          const reversedFinancialEvent = String(transactionMetadata.reversed_financial_event ?? "");
          const reversalType = reversedTransactionType(transaction);

          if (financialEvent === "credit_card_cash_advance") {
            activity.cashAdvances = roundCurrencyValue(activity.cashAdvances + effect.amount);
          } else if (reversedFinancialEvent === "credit_card_cash_advance") {
            activity.cashAdvances = roundCurrencyValue(activity.cashAdvances - effect.amount);
          } else if (journalRole === "liability_credit") {
            activity.credited = roundCurrencyValue(activity.credited + effect.amount);
          } else if (journalRole === "liability_credit_reversal") {
            activity.credited = roundCurrencyValue(activity.credited - effect.amount);
          } else if (journalRole === "purchase_debit") {
            activity.debited = roundCurrencyValue(activity.debited + effect.amount);
          } else if (journalRole === "purchase_debit_reversal") {
            activity.debited = roundCurrencyValue(activity.debited - effect.amount);
          } else if (isCreditCardPayment(transactionMetadata)) {
            activity.repayments = roundCurrencyValue(activity.repayments + effect.amount);
          } else if (
            transactionMetadata.reversed_credit_card_payment === true
            || financialEvent === "credit_card_payment_reversal"
          ) {
            activity.repayments = roundCurrencyValue(activity.repayments - effect.amount);
          } else if (financialEvent === "credit_card_fee") {
            activity.fees = roundCurrencyValue(activity.fees + effect.amount);
          } else if (reversedFinancialEvent === "credit_card_fee") {
            activity.fees = roundCurrencyValue(activity.fees - effect.amount);
          } else if (financialEvent === "credit_card_interest") {
            activity.interest = roundCurrencyValue(activity.interest + effect.amount);
          } else if (reversedFinancialEvent === "credit_card_interest") {
            activity.interest = roundCurrencyValue(activity.interest - effect.amount);
          } else if (financialEvent === "credit_card_refund") {
            activity.refunds = roundCurrencyValue(activity.refunds + effect.amount);
          } else if (reversedFinancialEvent === "credit_card_refund") {
            activity.refunds = roundCurrencyValue(activity.refunds - effect.amount);
          } else if (reversalType === "expense") {
            activity.debited = roundCurrencyValue(activity.debited - effect.amount);
          } else if (reversalType === "income") {
            activity.refunds = roundCurrencyValue(activity.refunds - effect.amount);
          } else if (effect.flow === "outflow") {
            activity.debited = roundCurrencyValue(activity.debited + effect.amount);
          } else {
            activity.refunds = roundCurrencyValue(activity.refunds + effect.amount);
          }
        }
      } else if (String(transaction.status ?? "").trim().toLowerCase() === "pending") {
        if (effect.flow === "inflow") {
          activity.pendingInflow = roundCurrencyValue(activity.pendingInflow + effect.amount);
        } else {
          activity.pendingOutflow = roundCurrencyValue(activity.pendingOutflow + effect.amount);
        }
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

export function summarizeCashflowTransactions(
  transactions: LedgerTransactionInput[],
): LedgerSummary {
  const summary: LedgerSummary = { expenses: 0, income: 0, net: 0 };

  for (const transaction of transactions) {
    const delta = cashflowTransactionDelta(transaction);
    summary.expenses = roundCurrencyValue(summary.expenses + delta.expenseDelta);
    summary.income = roundCurrencyValue(summary.income + delta.incomeDelta);
    summary.net = roundCurrencyValue(summary.income - summary.expenses);
  }

  return summary;
}

/**
 * Transaction cards show economic income and expense. Principal movements and
 * card settlements remain available to reconciliation consumers, while the
 * displayed arithmetic invariant is always Net = Income - Expenses.
 */
export function summarizeTransactionCards(
  transactions: LedgerTransactionInput[],
): TransactionCardSummary {
  const typeTotals = summarizeLedgerTransactions(transactions);
  let financingPayments = 0;
  let financingReceipts = 0;
  for (const transaction of transactions) {
    const financing = financingTransactionDelta(transaction);
    financingPayments = roundCurrencyValue(financingPayments + financing.paymentDelta);
    financingReceipts = roundCurrencyValue(financingReceipts + financing.receiptDelta);
  }
  return {
    expenses: typeTotals.expenses,
    financingPayments,
    financingReceipts,
    income: typeTotals.income,
    net: roundCurrencyValue(typeTotals.income - typeTotals.expenses),
  };
}
