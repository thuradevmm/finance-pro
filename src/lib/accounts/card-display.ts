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
  cardCredit: number;
  charges: number;
  limit: number;
  minimumPayment: number;
  outstanding: number;
  payments: number;
  transactions: number;
};

export function summarizeCreditCardLookup(cards: CreditCardLookupValue[]) {
  const totals = cards.reduce((summary, card) => ({
    available: summary.available + card.available,
    cardCredit: summary.cardCredit + card.cardCredit,
    charges: summary.charges + card.charges,
    limit: summary.limit + card.limit,
    minimumPayment: summary.minimumPayment + card.minimumPayment,
    outstanding: summary.outstanding + card.outstanding,
    payments: summary.payments + card.payments,
    transactions: summary.transactions + card.transactions,
  }), {
    available: 0,
    cardCredit: 0,
    charges: 0,
    limit: 0,
    minimumPayment: 0,
    outstanding: 0,
    payments: 0,
    transactions: 0,
  });

  return {
    available: roundCardValue(totals.available),
    cardCredit: roundCardValue(totals.cardCredit),
    charges: roundCardValue(totals.charges),
    limit: roundCardValue(totals.limit),
    minimumPayment: roundCardValue(totals.minimumPayment),
    netPosition: roundCardValue(totals.cardCredit - totals.outstanding),
    outstanding: roundCardValue(totals.outstanding),
    payments: roundCardValue(totals.payments),
    transactions: totals.transactions,
  };
}
