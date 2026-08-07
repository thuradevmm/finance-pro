export function formatAccountIdentifier(value: string) {
  const compactValue = value.replace(/\s+/g, "").trim();
  if (!compactValue) return "Not set";

  const digitCount = (compactValue.match(/\d/g) ?? []).length;
  if (digitCount === 0) return compactValue;

  const groupSize = digitCount >= 12 || digitCount % 4 === 0 ? 4 : 3;
  let digitsInGroup = 0;
  let formatted = "";
  for (const character of compactValue) {
    if (/\d/.test(character)) {
      if (digitsInGroup === groupSize) {
        formatted += " ";
        digitsInGroup = 0;
      }
      formatted += character;
      digitsInGroup += 1;
    } else {
      formatted += character;
      digitsInGroup = 0;
    }
  }
  return formatted.trim();
}

export function maskCardNumber(value: string) {
  const compactValue = value.replace(/\D+/g, "");
  if (!compactValue) return "Not set";

  const visibleDigits = compactValue.slice(-4);
  if (compactValue.length <= 4) return visibleDigits;

  const hiddenLength = Math.max(compactValue.length - visibleDigits.length, 4);
  const hiddenGroups = Array.from(
    { length: Math.ceil(hiddenLength / 4) },
    (_, index) => "•".repeat(Math.min(4, hiddenLength - index * 4)),
  );

  return [...hiddenGroups, visibleDigits].join(" ");
}

export function creditUtilizationPercent(used: number, limit: number) {
  if (!Number.isFinite(used) || !Number.isFinite(limit) || limit <= 0) return 0;
  return Math.max(used, 0) / limit * 100;
}

export function formatCreditUtilization(used: number, limit: number) {
  return `${new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 1,
    minimumFractionDigits: 0,
  }).format(creditUtilizationPercent(used, limit))}%`;
}

export function formatBillingDay(day: number | null) {
  return day == null ? "Not set" : `Day ${day}`;
}

function roundCardValue(value: number) {
  const sign = Math.sign(value);
  return sign * Math.round((Math.abs(value) + Number.EPSILON) * 100) / 100;
}

/**
 * Converts the signed card ledger (charges minus credits/payments) into the
 * four values shown throughout the Accounts UI. Keeping this derivation pure
 * and shared prevents form previews from disagreeing with saved card details.
 */
export function calculateCreditCardPosition(signedLedgerBalance: number, configuredLimit: number) {
  const limit = roundCardValue(Math.max(Number.isFinite(configuredLimit) ? configuredLimit : 0, 0));
  const signedBalance = roundCardValue(Number.isFinite(signedLedgerBalance) ? signedLedgerBalance : 0);
  const outstanding = roundCardValue(Math.max(signedBalance, 0));
  const cardCredit = roundCardValue(Math.max(-signedBalance, 0));
  const available = roundCardValue(Math.min(Math.max(limit - outstanding, 0), limit));

  return { available, cardCredit, limit, outstanding };
}

type CreditCardLookupValue = {
  available: number;
  cashAdvances?: number;
  cardCredit: number;
  charges: number;
  credited?: number;
  debited?: number;
  fees?: number;
  interest?: number;
  limit: number;
  minimumPayment: number;
  outstanding: number;
  pendingCredits?: number;
  pendingDebits?: number;
  payments: number;
  refunds?: number;
  transactions: number;
};

export function summarizeCreditCardLookup(cards: CreditCardLookupValue[]) {
  const initialTotals = {
    available: 0,
    cashAdvances: 0,
    cardCredit: 0,
    charges: 0,
    credited: 0,
    debited: 0,
    fees: 0,
    interest: 0,
    limit: 0,
    minimumPayment: 0,
    outstanding: 0,
    pendingCredits: 0,
    pendingDebits: 0,
    payments: 0,
    refunds: 0,
    transactions: 0,
  };
  const totals = cards.reduce<typeof initialTotals>((summary, card) => ({
    available: summary.available + card.available,
    cashAdvances: summary.cashAdvances + (card.cashAdvances ?? 0),
    cardCredit: summary.cardCredit + card.cardCredit,
    charges: summary.charges + card.charges,
    credited: summary.credited + (card.credited ?? card.payments),
    debited: summary.debited + (card.debited ?? card.charges),
    fees: summary.fees + (card.fees ?? 0),
    interest: summary.interest + (card.interest ?? 0),
    limit: summary.limit + card.limit,
    minimumPayment: summary.minimumPayment + card.minimumPayment,
    outstanding: summary.outstanding + card.outstanding,
    pendingCredits: summary.pendingCredits + (card.pendingCredits ?? 0),
    pendingDebits: summary.pendingDebits + (card.pendingDebits ?? 0),
    payments: summary.payments + card.payments,
    refunds: summary.refunds + (card.refunds ?? 0),
    transactions: summary.transactions + card.transactions,
  }), initialTotals);

  return {
    available: roundCardValue(totals.available),
    cashAdvances: roundCardValue(totals.cashAdvances),
    cardCredit: roundCardValue(totals.cardCredit),
    charges: roundCardValue(totals.charges),
    credited: roundCardValue(totals.credited),
    debited: roundCardValue(totals.debited),
    fees: roundCardValue(totals.fees),
    interest: roundCardValue(totals.interest),
    limit: roundCardValue(totals.limit),
    minimumPayment: roundCardValue(totals.minimumPayment),
    netPosition: roundCardValue(totals.cardCredit - totals.outstanding),
    outstanding: roundCardValue(totals.outstanding),
    pendingCredits: roundCardValue(totals.pendingCredits),
    pendingDebits: roundCardValue(totals.pendingDebits),
    payments: roundCardValue(totals.payments),
    refunds: roundCardValue(totals.refunds),
    transactions: totals.transactions,
  };
}
