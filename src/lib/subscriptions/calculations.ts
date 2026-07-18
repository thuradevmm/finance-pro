export type SubscriptionCycleValue = "Weekly" | "Monthly" | "Yearly" | string;

export type SubscriptionPaymentCutoffEvidence = {
  billingDueDate?: string | null;
  createdAt?: string | null;
  paymentDate?: string | null;
};

function dateParts(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(year, month - 1, day);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return null;
  return { day, month, year };
}

function formatDate(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export function subscriptionBillingOccurrence(anchorDate: string, billingCycle: SubscriptionCycleValue, occurrenceIndex: number) {
  const anchor = dateParts(anchorDate);
  if (!anchor || !Number.isInteger(occurrenceIndex) || occurrenceIndex < 0) return "";
  const cycle = billingCycle.trim().toLowerCase();
  if (cycle === "weekly") {
    const date = new Date(anchor.year, anchor.month - 1, anchor.day);
    date.setDate(date.getDate() + occurrenceIndex * 7);
    return formatDate(date);
  }

  const monthOffset = occurrenceIndex * (cycle === "yearly" || cycle === "annual" ? 12 : 1);
  const target = new Date(anchor.year, anchor.month - 1 + monthOffset, 1);
  target.setDate(Math.min(anchor.day, new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate()));
  return formatDate(target);
}

export function nextSubscriptionBillingDate(anchorDate: string, currentDate: string, billingCycle: SubscriptionCycleValue) {
  if (!dateParts(anchorDate) || !dateParts(currentDate)) return "";
  for (let occurrence = 1; occurrence <= 1200; occurrence += 1) {
    const candidate = subscriptionBillingOccurrence(anchorDate, billingCycle, occurrence);
    if (!candidate) return "";
    if (candidate > currentDate) return candidate;
  }
  return "";
}

/**
 * Schedule edits store an ISO timestamp cutoff so payment evidence created for
 * the old schedule cannot mark the replacement schedule as paid. Older rows
 * used a date-only cutoff, so retain their billing-period comparison semantics.
 */
export function subscriptionPaymentIsAfterCutoff(
  payment: SubscriptionPaymentCutoffEvidence,
  cutoff: string,
) {
  if (!cutoff) return true;

  if (cutoff.includes("T")) {
    const cutoffTime = Date.parse(cutoff);
    const createdTime = Date.parse(payment.createdAt ?? "");
    if (!Number.isFinite(cutoffTime)) return true;
    return Number.isFinite(createdTime) && createdTime > cutoffTime;
  }

  const evidenceDate = payment.billingDueDate || payment.paymentDate || "";
  return !evidenceDate || evidenceDate >= cutoff;
}

export function subscriptionPaymentCoversCycle(paymentAmount: number, expectedAmount: number) {
  if (!Number.isFinite(expectedAmount) || expectedAmount <= 0) return true;
  return Number.isFinite(paymentAmount) && paymentAmount + 0.005 >= expectedAmount;
}

export function annualizedSubscriptionCost(amount: number, billingCycle: SubscriptionCycleValue) {
  if (!Number.isFinite(amount) || amount <= 0) return 0;
  const cycle = billingCycle.trim().toLowerCase();
  if (cycle === "weekly") return amount * 52;
  if (cycle === "yearly" || cycle === "annual") return amount;
  return amount * 12;
}

export function monthlySubscriptionCost(amount: number, billingCycle: SubscriptionCycleValue) {
  return annualizedSubscriptionCost(amount, billingCycle) / 12;
}

export function isOngoingSubscriptionStatus(status: unknown) {
  const normalized = String(status ?? "active").trim().toLowerCase();
  return normalized === "active" || normalized === "expiring";
}

export function normalizeSubscriptionStatus(status: unknown) {
  const normalized = String(status ?? "").trim().toLowerCase();
  if (normalized === "paused") return "Paused" as const;
  if (normalized === "expiring") return "Expiring" as const;
  return "Active" as const;
}
