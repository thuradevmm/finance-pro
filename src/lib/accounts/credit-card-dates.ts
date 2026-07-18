function validBillingDay(value: number | null | undefined) {
  if (!Number.isFinite(value)) return null;
  const day = Math.trunc(value as number);
  return day >= 1 && day <= 31 ? day : null;
}

function daysInMonth(year: number, monthIndex: number) {
  return new Date(year, monthIndex + 1, 0).getDate();
}

function dateForBillingDay(year: number, monthIndex: number, day: number) {
  return new Date(year, monthIndex, Math.min(day, daysInMonth(year, monthIndex)));
}

function parseDate(value: Date | string) {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : new Date(value);
  const date = new Date(`${value.slice(0, 10)}T00:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function formatCreditCardDate(value: Date) {
  if (Number.isNaN(value.getTime())) return "";
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`;
}

/** Returns the first configured billing day strictly after the reference. */
export function nextCreditCardBillingDay(reference: Date | string, day: number | null | undefined) {
  const referenceDate = parseDate(reference);
  const billingDay = validBillingDay(day);
  if (!referenceDate || !billingDay) return null;
  referenceDate.setHours(0, 0, 0, 0);
  const sameMonth = dateForBillingDay(referenceDate.getFullYear(), referenceDate.getMonth(), billingDay);
  return sameMonth > referenceDate
    ? sameMonth
    : dateForBillingDay(referenceDate.getFullYear(), referenceDate.getMonth() + 1, billingDay);
}

/**
 * Assigns a charge to its next statement, then selects the first payment due
 * day after that statement. Without a statement day, it falls back to the next
 * due-day occurrence after the charge.
 */
export function nextCreditCardPaymentDate(input: {
  paymentDueDay: number | null | undefined;
  referenceDate: Date | string;
  statementDay?: number | null;
}) {
  const referenceDate = parseDate(input.referenceDate);
  const paymentDueDay = validBillingDay(input.paymentDueDay);
  if (!referenceDate || !paymentDueDay) return "";
  const statementDate = nextCreditCardBillingDay(referenceDate, input.statementDay);
  const dueDate = nextCreditCardBillingDay(statementDate ?? referenceDate, paymentDueDay);
  return dueDate ? formatCreditCardDate(dueDate) : "";
}

export type CreditCardDatedAmount = {
  amountValue: number;
  dateValue: string;
};

export type CreditCardDueBucket = {
  amountValue: number;
  dueDateValue: string;
};

function roundCurrency(value: number) {
  return Math.round((value + Math.sign(value) * Number.EPSILON) * 100) / 100;
}

/**
 * Groups purchases by statement cycle and applies all payments/credits FIFO.
 * This lets the UI distinguish the amount actually due on the next statement
 * from later, not-yet-due card utilization.
 */
export function buildCreditCardDueBuckets(input: {
  chargeActivity?: CreditCardDatedAmount[];
  fallbackDueDate?: string | null;
  openingChargeAmount?: number;
  paymentDueDay?: number | null;
  repaymentAmount?: number;
  statementDay?: number | null;
}) {
  const bucketAmounts = new Map<string, number>();
  const openingChargeAmount = Math.max(Number(input.openingChargeAmount) || 0, 0);
  if (openingChargeAmount > 0) {
    const dueDate = input.fallbackDueDate ?? "";
    bucketAmounts.set(dueDate, roundCurrency((bucketAmounts.get(dueDate) ?? 0) + openingChargeAmount));
  }

  for (const charge of input.chargeActivity ?? []) {
    const amount = Math.max(Number(charge.amountValue) || 0, 0);
    if (amount <= 0) continue;
    const dueDate = nextCreditCardPaymentDate({
      paymentDueDay: input.paymentDueDay,
      referenceDate: charge.dateValue,
      statementDay: input.statementDay,
    });
    bucketAmounts.set(dueDate, roundCurrency((bucketAmounts.get(dueDate) ?? 0) + amount));
  }

  let unappliedRepayment = Math.max(Number(input.repaymentAmount) || 0, 0);
  return [...bucketAmounts.entries()]
    .sort(([firstDate], [secondDate]) => {
      if (!firstDate) return secondDate ? 1 : 0;
      if (!secondDate) return -1;
      return firstDate.localeCompare(secondDate);
    })
    .flatMap(([dueDateValue, amountValue]): CreditCardDueBucket[] => {
      const applied = Math.min(unappliedRepayment, amountValue);
      unappliedRepayment = roundCurrency(Math.max(unappliedRepayment - applied, 0));
      const remaining = roundCurrency(Math.max(amountValue - applied, 0));
      return remaining > 0.005 ? [{ amountValue: remaining, dueDateValue }] : [];
    });
}
