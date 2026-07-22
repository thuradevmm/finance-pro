import { transactionStatusCanBeReversed, transactionStatusIsFinalized } from "./status.ts";

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

export function transactionReversalSourceId(transaction: TransactionIntegrityInput) {
  const value = metadataRecord(transaction.metadata).reversed_transaction_id;
  return typeof value === "string" ? value : "";
}

export function postedReversalSourceIds(transactions: TransactionIntegrityInput[]) {
  return new Set(
    transactions.flatMap((transaction) => {
      if (!transactionStatusIsFinalized(transaction.status)) return [];
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
  if (!transactionStatusCanBeReversed(transaction.status)) {
    return "Only cleared transactions can be reversed. Mark a pending transaction as cleared first, or edit/delete a non-finalized transaction.";
  }
  return "";
}
