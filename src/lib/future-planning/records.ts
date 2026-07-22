import type { AccountAmountType, TransactionType } from "@/types/finance";

export type FutureRecurrence = "Monthly" | "Once" | "Weekly" | "Yearly";
export type FuturePlanStatus = "Active" | "Paused";
export type FuturePlanRelatedEntityType = "asset" | "budget" | "debt" | "none" | "savings_goal" | "subscription";

export type FuturePlanLinkOption = {
  amount: number;
  categoryId: string;
  id: string;
  label: string;
  type: Exclude<FuturePlanRelatedEntityType, "none">;
};

export type FutureDatePrediction = {
  amount: number;
  date: string;
};

export type FutureTransactionFormData = {
  accountAmountType: AccountAmountType;
  accountId: string;
  amount: number;
  categoryId: string;
  endDate: string;
  note: string;
  predictions?: FutureDatePrediction[];
  recurrence: FutureRecurrence;
  relatedEntityAmountSnapshot?: number | null;
  relatedEntityId: string;
  relatedEntityLabel: string;
  relatedEntityType: FuturePlanRelatedEntityType;
  startDate: string;
  status: FuturePlanStatus;
  title: string;
  type: Exclude<TransactionType, "Transfer">;
};

export type FutureTransactionRecord = {
  account: string;
  accountAmountType: AccountAmountType;
  accountId: string;
  amountValue: number;
  category: string;
  categoryId: string;
  date: string;
  dateValue: string;
  endDate: string;
  id: string;
  note: string;
  recurrence: FutureRecurrence;
  relatedEntityAmountSnapshot: number | null;
  relatedEntityId: string;
  relatedEntityLabel: string;
  relatedEntityType: FuturePlanRelatedEntityType;
  status: FuturePlanStatus;
  title: string;
  type: Exclude<TransactionType, "Transfer">;
};

function parseDate(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  if (date.getFullYear() !== Number(match[1]) || date.getMonth() !== Number(match[2]) - 1 || date.getDate() !== Number(match[3])) return null;
  return date;
}

function formatDate(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function addMonths(date: Date, monthCount: number) {
  const day = date.getDate();
  const next = new Date(date.getFullYear(), date.getMonth() + monthCount, 1);
  const lastDay = new Date(next.getFullYear(), next.getMonth() + 1, 0).getDate();
  next.setDate(Math.min(day, lastDay));
  return next;
}

function addYears(date: Date, yearCount: number) {
  const month = date.getMonth();
  const day = date.getDate();
  const next = new Date(date.getFullYear() + yearCount, month, 1);
  const lastDay = new Date(next.getFullYear(), month + 1, 0).getDate();
  next.setDate(Math.min(day, lastDay));
  return next;
}

export function getFutureOccurrenceDates(input: Pick<FutureTransactionFormData, "endDate" | "recurrence" | "startDate">, limit = 240) {
  const start = parseDate(input.startDate);
  if (!start) return [];
  if (input.recurrence === "Once") return [formatDate(start)];

  const end = parseDate(input.endDate);
  if (!end || end < start) return [];

  const dates: string[] = [];
  let occurrence = start;
  let occurrenceIndex = 0;
  while (occurrence <= end && dates.length < limit) {
    dates.push(formatDate(occurrence));
    occurrenceIndex += 1;
    if (input.recurrence === "Weekly") {
      const next = new Date(start);
      next.setDate(next.getDate() + (occurrenceIndex * 7));
      occurrence = next;
    } else if (input.recurrence === "Monthly") {
      occurrence = addMonths(start, occurrenceIndex);
    } else {
      occurrence = addYears(start, occurrenceIndex);
    }
  }
  return dates;
}

function positiveAmount(value: unknown) {
  const amount = Number(value);
  return Number.isFinite(amount) && amount > 0 ? amount : 0;
}

/**
 * The transaction row is the source of truth for a user's prediction. The
 * metadata value only supports older or partially migrated rows whose amount
 * could not be read.
 */
export function futurePredictedAmount(transactionAmount: unknown, metadata: Record<string, unknown>) {
  return positiveAmount(transactionAmount) || positiveAmount(metadata.future_predicted_amount);
}

/**
 * A linked module amount is display-only context. Legacy linked plans did not
 * store a separate snapshot, so their own prediction is the safest fallback.
 */
export function futureLinkAmountSnapshot(metadata: Record<string, unknown>, legacyPrediction?: unknown) {
  const snapshot = Number(metadata.future_link_amount_snapshot);
  if (metadata.future_link_amount_snapshot !== null
    && metadata.future_link_amount_snapshot !== undefined
    && Number.isFinite(snapshot)
    && snapshot >= 0) return snapshot;
  const fallback = positiveAmount(legacyPrediction);
  return fallback > 0 ? fallback : null;
}

export function suggestedFutureAmount(currentAmount: string, suggestion: number, userEditedAmount: boolean) {
  return userEditedAmount ? currentAmount : String(suggestion);
}

/** Materializes explicit rows; it never averages or infers a recurring value. */
export function materializeFuturePredictions(
  occurrenceDates: string[],
  defaultAmount: number,
  predictions: FutureDatePrediction[] = [],
) {
  const amountsByDate = new Map(predictions.map((prediction) => [prediction.date, prediction.amount]));
  return occurrenceDates.map((date) => ({
    amount: amountsByDate.get(date) ?? defaultAmount,
    date,
  }));
}
