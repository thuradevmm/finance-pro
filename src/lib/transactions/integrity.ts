export type TransactionIntegrityInput = {
  id?: string | null;
  metadata?: unknown;
  status?: string | null;
};

function metadataRecord(metadata: unknown) {
  return metadata && typeof metadata === "object" && !Array.isArray(metadata)
    ? metadata as Record<string, unknown>
    : {};
}

function transactionStatusAffectsBalance(value: unknown) {
  const status = String(value ?? "cleared").trim().toLowerCase();
  return !["scheduled", "cancelled", "canceled", "void", "failed"].includes(status);
}

export function transactionReversalSourceId(transaction: TransactionIntegrityInput) {
  const value = metadataRecord(transaction.metadata).reversed_transaction_id;
  return typeof value === "string" ? value : "";
}

export function postedReversalSourceIds(transactions: TransactionIntegrityInput[]) {
  return new Set(
    transactions.flatMap((transaction) => {
      if (!transactionStatusAffectsBalance(transaction.status)) return [];
      const sourceId = transactionReversalSourceId(transaction);
      return sourceId ? [sourceId] : [];
    }),
  );
}

export function transactionMutationIntegrityError(
  transaction: TransactionIntegrityInput,
  hasPostedReversal: boolean,
) {
  if (transactionReversalSourceId(transaction)) {
    return "Reversal transactions cannot be edited, deleted, or reversed. Record a new correcting transaction if another adjustment is needed.";
  }
  if (hasPostedReversal) {
    return "This transaction has already been reversed and can no longer be edited, deleted, or reversed.";
  }
  return "";
}

export function transactionReversalIntegrityError(
  transaction: TransactionIntegrityInput,
  hasPostedReversal: boolean,
) {
  const mutationError = transactionMutationIntegrityError(transaction, hasPostedReversal);
  if (mutationError) return mutationError;
  if (!transactionStatusAffectsBalance(transaction.status)) {
    return "Only posted transactions can be reversed. Edit or delete this scheduled/cancelled transaction instead.";
  }
  return "";
}
