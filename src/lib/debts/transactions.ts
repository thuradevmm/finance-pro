function metadataRecord(metadata: unknown) {
  return metadata && typeof metadata === "object" && !Array.isArray(metadata)
    ? metadata as Record<string, unknown>
    : {};
}

function numericValue(value: unknown, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function roundCurrencyValue(value: number) {
  return Math.round((value + Math.sign(value) * Number.EPSILON) * 100) / 100;
}

function transactionStatusAffectsBalance(value: unknown) {
  const status = String(value ?? "cleared").trim().toLowerCase();
  return !["scheduled", "cancelled", "canceled", "void", "failed"].includes(status);
}

function transferDirection(metadata: Record<string, unknown>) {
  const direction = typeof metadata.transfer_direction === "string" ? metadata.transfer_direction.toLowerCase() : "";
  if (direction === "debit" || direction === "credit") return direction;
  const legacyRole = typeof metadata.same_account_transfer_role === "string" ? metadata.same_account_transfer_role.toLowerCase() : "";
  if (legacyRole === "out") return "debit";
  if (legacyRole === "in") return "credit";
  return "";
}

export type DebtLedgerDebtInput = {
  id: string;
  metadata?: unknown;
  payment_account_id?: string | null;
  repaid_amount?: number | string | null;
  total_amount?: number | string | null;
  type?: string | null;
};

export type DebtLedgerTransactionInput = {
  account_id?: string | null;
  amount?: number | string | null;
  id?: string | null;
  metadata?: unknown;
  related_entity_id?: string | null;
  related_entity_type?: string | null;
  status?: string | null;
  transaction_date?: string | null;
  transfer_account_id?: string | null;
  type?: string | null;
};

export type DebtPaymentInput = {
  amount?: number | string | null;
  debt_id?: string | null;
  id?: string | null;
  payment_date?: string | null;
  transaction_id?: string | null;
};

export type DebtLedgerActivity = {
  amountValue: number;
  dateValue: string;
};

export type DebtTransactionLedger = {
  chargeActivity: DebtLedgerActivity[];
  charges: number;
  repaymentActivity: DebtLedgerActivity[];
  repayments: number;
};

function emptyLedger(): DebtTransactionLedger {
  return { chargeActivity: [], charges: 0, repaymentActivity: [], repayments: 0 };
}

function metadataString(metadata: Record<string, unknown>, key: string) {
  const value = metadata[key];
  return typeof value === "string" ? value : "";
}

function normalizeDebtType(value: unknown) {
  return String(value ?? "").trim().toLowerCase().replace(/[\s_-]+/g, "");
}

export function isCreditCardDebtInput(debt: DebtLedgerDebtInput) {
  const metadata = metadataRecord(debt.metadata);
  return typeof metadata.credit_card_account_id === "string"
    || typeof metadata.auto_credit_card_account_id === "string"
    || normalizeDebtType(debt.type ?? metadata.type) === "creditcard";
}

export function usesManualCreditCardTerms(debt: DebtLedgerDebtInput) {
  const metadata = metadataRecord(debt.metadata);
  if (metadata.manual_credit_card_terms === true || metadata.auto_credit_card_terms === false) return true;
  if (metadata.auto_credit_card_account_id || metadata.auto_credit_card_terms === true) return false;
  return true;
}

export function creditCardAccountIdForDebt(debt: DebtLedgerDebtInput) {
  const metadata = metadataRecord(debt.metadata);
  return metadataString(metadata, "credit_card_account_id")
    || metadataString(metadata, "auto_credit_card_account_id")
    || debt.payment_account_id
    || "";
}

function storedNumber(columnValue: unknown, metadataValue: unknown) {
  if (columnValue !== null && columnValue !== undefined && columnValue !== "") return numericValue(columnValue);
  return numericValue(metadataValue);
}

/**
 * Manual card debts can carry a balance that predates the transaction ledger.
 * Automatic card debts always have a zero stored opening and are therefore
 * excluded, preventing their linked charges from being counted twice.
 */
export function creditCardOpeningBalancesByAccount(debts: DebtLedgerDebtInput[]) {
  const balances = new Map<string, number>();

  for (const debt of debts) {
    if (!isCreditCardDebtInput(debt) || !usesManualCreditCardTerms(debt)) continue;
    const accountId = creditCardAccountIdForDebt(debt);
    if (!accountId) continue;
    const metadata = metadataRecord(debt.metadata);
    const openingBalance = roundCurrencyValue(
      storedNumber(debt.total_amount, metadata.total_amount)
      - storedNumber(debt.repaid_amount, metadata.repaid_amount),
    );
    balances.set(accountId, roundCurrencyValue((balances.get(accountId) ?? 0) + openingBalance));
  }

  return balances;
}

function transferGroupId(transaction: DebtLedgerTransactionInput) {
  const metadata = metadataRecord(transaction.metadata);
  return metadataString(metadata, "transfer_group_id")
    || metadataString(metadata, "same_account_transfer_group_id")
    || transaction.id
    || "";
}

function reversalSourceId(transaction: DebtLedgerTransactionInput) {
  return metadataString(metadataRecord(transaction.metadata), "reversed_transaction_id");
}

/**
 * Debt progress is a gross principal/payment view, so a reversal removes both
 * the source and inverse rows instead of presenting the inverse as a new charge
 * or repayment. Transfer groups are cancelled together because a reversal
 * points at the source debit row while the card impact can live on its credit
 * row.
 */
export function effectiveDebtLedgerTransactions(transactions: DebtLedgerTransactionInput[]) {
  const transactionById = new Map(
    transactions.flatMap((transaction) => transaction.id ? [[transaction.id, transaction] as const] : []),
  );
  const reversedIds = new Set<string>();
  const reversedTransferGroups = new Set<string>();

  for (const transaction of transactions) {
    if (!transactionStatusAffectsBalance(transaction.status)) continue;
    const sourceId = reversalSourceId(transaction);
    if (!sourceId) continue;
    reversedIds.add(sourceId);
    const source = transactionById.get(sourceId);
    const sourceGroupId = source ? transferGroupId(source) : "";
    if (sourceGroupId) reversedTransferGroups.add(sourceGroupId);
  }

  return transactions.filter((transaction) => {
    if (!transactionStatusAffectsBalance(transaction.status)) return false;
    if (reversalSourceId(transaction)) return false;
    if (transaction.id && reversedIds.has(transaction.id)) return false;
    const groupId = transferGroupId(transaction);
    return !groupId || !reversedTransferGroups.has(groupId);
  });
}

/** Standalone debt-payment rows are legacy/manual evidence. Rows backed by a
 * transaction are intentionally excluded because that transaction is already
 * present in the linked ledger. */
export function standaloneDebtPaymentTransactions(payments: DebtPaymentInput[]): DebtLedgerTransactionInput[] {
  return payments.flatMap((payment) => {
    if (!payment.debt_id || payment.transaction_id) return [];
    return [{
      amount: payment.amount,
      id: payment.id ? `debt-payment:${payment.id}` : null,
      metadata: { debt_payment_id: payment.id ?? null, standalone_debt_payment: true },
      related_entity_id: payment.debt_id,
      related_entity_type: "debt",
      status: "cleared",
      transaction_date: payment.payment_date,
      type: "expense",
    }];
  });
}

function creditCardImpact(transaction: DebtLedgerTransactionInput, debtId: string, creditCardAccountId: string) {
  const type = String(transaction.type ?? "").toLowerCase();
  const metadata = metadataRecord(transaction.metadata);
  if (metadata.standalone_debt_payment === true) return "";
  const direction = transferDirection(metadata);
  const usesCreditCardAccount = transaction.account_id === creditCardAccountId;
  const paysCreditCardAccount = transaction.transfer_account_id === creditCardAccountId;
  const explicitlyTargetsDebt = metadataString(metadata, "credit_card_debt_id") === debtId
    || (transaction.related_entity_type === "debt" && transaction.related_entity_id === debtId);
  const explicitImpact = explicitlyTargetsDebt ? metadataString(metadata, "credit_card_debt_impact") : "";

  if (explicitImpact === "charge" || explicitImpact === "repayment") {
    // Both halves of a paired transfer carry the metadata. Only the half whose
    // primary account is the card represents the card-liability movement.
    if (type === "transfer" && direction && !usesCreditCardAccount) return "";
    return explicitImpact;
  }

  if (usesCreditCardAccount && paysCreditCardAccount) return "";
  if (type === "transfer") {
    if (direction) {
      if (!usesCreditCardAccount) return "";
      return direction === "debit" ? "charge" : "repayment";
    }
    if (usesCreditCardAccount) return "charge";
    if (paysCreditCardAccount) return "repayment";
    return "";
  }
  if (usesCreditCardAccount && type === "expense") return "charge";
  if (usesCreditCardAccount && type === "income") return "repayment";
  if (!usesCreditCardAccount && !paysCreditCardAccount && type === "expense") return "repayment";
  return "";
}

function standardDebtImpact(transaction: DebtLedgerTransactionInput) {
  const type = String(transaction.type ?? "").toLowerCase();
  const direction = transferDirection(metadataRecord(transaction.metadata));
  if (type === "transfer" && direction === "credit") return "";
  if (type === "expense" || type === "transfer") return "repayment";
  return "";
}

function applyImpact(ledger: DebtTransactionLedger, impact: string, transaction: DebtLedgerTransactionInput) {
  const amountValue = Math.abs(numericValue(transaction.amount));
  if (amountValue <= 0) return;
  const dateValue = transaction.transaction_date ?? "";

  if (impact === "charge") {
    ledger.charges = roundCurrencyValue(ledger.charges + amountValue);
    if (dateValue) ledger.chargeActivity.push({ amountValue, dateValue });
  } else if (impact === "repayment") {
    ledger.repayments = roundCurrencyValue(ledger.repayments + amountValue);
    if (dateValue) ledger.repaymentActivity.push({ amountValue, dateValue });
  }
}

/**
 * Builds every debt's linked ledger in one pass. A card-funded payment may
 * intentionally have two targets: repayment of the primary standard debt and
 * a charge to the secondary automatic credit-card debt.
 */
export function buildDebtTransactionLedgers(
  transactions: DebtLedgerTransactionInput[],
  debts: DebtLedgerDebtInput[],
) {
  const debtById = new Map(debts.map((debt) => [debt.id, debt]));
  const ledgers = new Map<string, DebtTransactionLedger>();

  function ledgerFor(debtId: string) {
    const current = ledgers.get(debtId);
    if (current) return current;
    const next = emptyLedger();
    ledgers.set(debtId, next);
    return next;
  }

  for (const transaction of effectiveDebtLedgerTransactions(transactions)) {
    const metadata = metadataRecord(transaction.metadata);
    const primaryDebtId = transaction.related_entity_type === "debt" ? transaction.related_entity_id ?? "" : "";
    const creditCardDebtId = metadataString(metadata, "credit_card_debt_id");

    if (primaryDebtId) {
      const debt = debtById.get(primaryDebtId);
      if (debt) {
        const impact = isCreditCardDebtInput(debt)
          ? creditCardImpact(transaction, debt.id, creditCardAccountIdForDebt(debt))
          : standardDebtImpact(transaction);
        applyImpact(ledgerFor(debt.id), impact, transaction);
      }
    }

    if (creditCardDebtId && creditCardDebtId !== primaryDebtId) {
      const debt = debtById.get(creditCardDebtId);
      if (debt && isCreditCardDebtInput(debt)) {
        applyImpact(
          ledgerFor(debt.id),
          creditCardImpact(transaction, debt.id, creditCardAccountIdForDebt(debt)),
          transaction,
        );
      }
    }
  }

  return ledgers;
}

export function debtTransactionLedgerFor(
  transactions: DebtLedgerTransactionInput[],
  debt: DebtLedgerDebtInput,
) {
  return buildDebtTransactionLedgers(transactions, [debt]).get(debt.id) ?? emptyLedger();
}
