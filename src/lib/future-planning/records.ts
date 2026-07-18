import type { AccountAmountType, TransactionType } from "@/types/finance";

export type FutureRecurrence = "Monthly" | "Once" | "Weekly" | "Yearly";
export type FuturePlanStatus = "Active" | "Paused";

export type FutureTransactionFormData = {
  accountAmountType: AccountAmountType;
  accountId: string;
  amount: number;
  categoryId: string;
  endDate: string;
  note: string;
  recurrence: FutureRecurrence;
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
  relatedEntityId: string;
  relatedEntityType: string;
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
