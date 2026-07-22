import { transactionStatusIsFinalized } from "./status.ts";

export type TransferSummaryInput = {
  id: string;
  amountValue?: number | null;
  ledgerMetadata?: unknown;
  status?: string | null;
  transferGroupId?: string | null;
  type?: string | null;
};

function metadataRecord(metadata: unknown) {
  return metadata && typeof metadata === "object" && !Array.isArray(metadata)
    ? metadata as Record<string, unknown>
    : {};
}

function metadataString(metadata: Record<string, unknown>, key: string) {
  const value = metadata[key];
  return typeof value === "string" ? value : "";
}

/**
 * Returns current transfer volume, not historical churn. A posted reversal
 * cancels both its own inverse group and the source transfer group.
 */
export function effectiveTransferVolume(transactions: TransferSummaryInput[]) {
  const countedGroups = new Set<string>();
  return transactions.reduce((total, transaction) => {
    if (!transactionStatusIsFinalized(transaction.status) || String(transaction.type).toLowerCase() !== "transfer") return total;
    const metadata = metadataRecord(transaction.ledgerMetadata);
    const groupId = transaction.transferGroupId || transaction.id;
    if (countedGroups.has(groupId)) return total;
    countedGroups.add(groupId);
    const amount = Number(transaction.amountValue);
    const signedAmount = Number.isFinite(amount) ? Math.abs(amount) : 0;
    return total + (metadataString(metadata, "reversed_transaction_id") ? -signedAmount : signedAmount);
  }, 0);
}
