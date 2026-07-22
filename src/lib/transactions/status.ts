export const canonicalTransactionStatuses = [
  "cleared",
  "pending",
  "scheduled",
  "cancelled",
  "void",
  "failed",
  "unknown",
] as const;

export type CanonicalTransactionStatus = (typeof canonicalTransactionStatuses)[number];

export function normalizeTransactionStatus(value: unknown): CanonicalTransactionStatus {
  const normalized = String(value ?? "cleared").trim().toLowerCase();
  if (!normalized || ["cleared", "complete", "completed", "posted"].includes(normalized)) return "cleared";
  if (normalized === "pending") return "pending";
  if (normalized === "scheduled") return "scheduled";
  if (normalized === "cancelled" || normalized === "canceled") return "cancelled";
  if (normalized === "void" || normalized === "voided") return "void";
  if (normalized === "failed") return "failed";
  return "unknown";
}

/** Cleared transactions are finalized financial history and actual activity. */
export function transactionStatusIsFinalized(value: unknown) {
  return normalizeTransactionStatus(value) === "cleared";
}

/** Pending transactions reserve funds, but are not finalized income, spending, or linked progress. */
export function transactionStatusReservesWorkingBalance(value: unknown) {
  const status = normalizeTransactionStatus(value);
  // Preserve legacy/unknown rows in the working balance until the user reviews
  // them; only explicitly inert or forecast states are excluded.
  return !["cancelled", "failed", "scheduled", "void"].includes(status);
}

export function transactionStatusIsForecast(value: unknown) {
  return normalizeTransactionStatus(value) === "scheduled";
}

export function transactionStatusCanBeReversed(value: unknown) {
  return transactionStatusIsFinalized(value);
}

export function transactionStatusLabel(value: unknown) {
  const status = normalizeTransactionStatus(value);
  if (status === "cleared") return "Cleared";
  if (status === "pending") return "Pending";
  if (status === "scheduled") return "Scheduled";
  if (status === "cancelled") return "Cancelled";
  if (status === "void") return "Void";
  if (status === "failed") return "Failed";
  return "Unknown";
}

export function transactionStatusFilterLabels() {
  return canonicalTransactionStatuses.map((status) => transactionStatusLabel(status));
}
