import { roundCurrencyValue, type FinancialPositionSummary, type LedgerSummary } from "./ledger.ts";
import { normalizeTransactionDate } from "./transactions/filters.ts";

export type ReconciliationDebtInput = {
  id?: string | null;
  isCreditCardDebt?: boolean;
  isCanceled?: boolean;
  nature?: string | null;
  remainingBalanceValue?: number | string | null;
  status?: string | null;
};

export type NetWorthSummary = {
  borrowingLiabilities: number;
  cardLiabilities: number;
  cashAndCardCredit: number;
  lendingReceivables: number;
  netWorth: number;
  totalAssets: number;
  totalLiabilities: number;
};

export type FinancialReconciliation = NetWorthSummary & LedgerSummary & {
  cancellationAdjustments: number;
  difference: number;
  hasIndependentOpeningPosition: boolean;
  openingPositionAndAdjustments: number;
  reconciledClosingNetWorth: number;
  scopeTransfers: number;
};

export type ReconciliationDateRange = {
  dateFrom: string;
  dateTo: string;
};

export function normalizeReconciliationDateRange(
  input: Partial<ReconciliationDateRange>,
  defaults: ReconciliationDateRange,
): ReconciliationDateRange {
  const dateFrom = normalizeTransactionDate(input.dateFrom) || defaults.dateFrom;
  const dateTo = normalizeTransactionDate(input.dateTo) || defaults.dateTo;

  return dateFrom <= dateTo
    ? { dateFrom, dateTo }
    : { dateFrom: dateTo, dateTo: dateFrom };
}

function numericValue(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function activeStandardDebt(debt: ReconciliationDebtInput) {
  return !debt.isCreditCardDebt
    && !debt.isCanceled
    && String(debt.status ?? "").trim().toLowerCase() !== "archived"
    && numericValue(debt.remainingBalanceValue) > 0;
}

/**
 * Extends liquid account position into a balance-sheet net worth. Credit-card
 * debt is already present in the account position and is intentionally not
 * counted again from the debt register.
 */
export function summarizeNetWorth(
  accountPosition: FinancialPositionSummary,
  debts: ReconciliationDebtInput[],
): NetWorthSummary {
  const borrowingLiabilities = roundCurrencyValue(debts
    .filter((debt) => activeStandardDebt(debt) && String(debt.nature).toLowerCase() !== "lending")
    .reduce((sum, debt) => sum + numericValue(debt.remainingBalanceValue), 0));
  const lendingReceivables = roundCurrencyValue(debts
    .filter((debt) => activeStandardDebt(debt) && String(debt.nature).toLowerCase() === "lending")
    .reduce((sum, debt) => sum + numericValue(debt.remainingBalanceValue), 0));
  const cashAndCardCredit = roundCurrencyValue(accountPosition.cashBalance + accountPosition.cardCredit);
  const totalAssets = roundCurrencyValue(cashAndCardCredit + lendingReceivables);
  const cardLiabilities = roundCurrencyValue(accountPosition.cardLiability);
  const totalLiabilities = roundCurrencyValue(cardLiabilities + borrowingLiabilities);

  return {
    borrowingLiabilities,
    cardLiabilities,
    cashAndCardCredit,
    lendingReceivables,
    netWorth: roundCurrencyValue(totalAssets - totalLiabilities),
    totalAssets,
    totalLiabilities,
  };
}

/**
 * Waiving borrowing increases net worth; abandoning a lending receivable
 * decreases it. Undoing either cancellation applies the exact opposite. This
 * non-cash movement belongs in the reconciliation bridge, not operating
 * Credits or Debits and not the account ledger.
 */
export function summarizeDebtCancellationAdjustments(
  openingDebts: ReconciliationDebtInput[],
  closingDebts: ReconciliationDebtInput[],
) {
  const openingById = new Map(openingDebts.flatMap((debt) => debt.id ? [[debt.id, debt]] : []));
  return roundCurrencyValue(closingDebts.reduce((total, debt) => {
    if (!debt.id || debt.isCreditCardDebt) return total;
    const opening = openingById.get(debt.id);
    const wasCanceled = opening?.isCanceled ?? false;
    const isCanceled = debt.isCanceled ?? false;
    if (wasCanceled === isCanceled) return total;
    const amount = numericValue(debt.remainingBalanceValue);
    const cancellationSign = String(debt.nature).toLowerCase() === "lending" ? -1 : 1;
    return total + (isCanceled ? cancellationSign * amount : -cancellationSign * amount);
  }, 0));
}

/**
 * A complete historical bridge cannot assume that every opening account,
 * manually-created debt, or lending record has a corresponding transaction.
 * Those legacy/opening values are presented explicitly instead of being
 * misclassified as income or expense.
 */
export function reconcileFinancialPosition(
  accountPosition: FinancialPositionSummary,
  debts: ReconciliationDebtInput[],
  transactions: Pick<LedgerSummary, "expenses" | "income">,
  openingNetWorth?: number,
  scopeTransfers = 0,
  cancellationAdjustments = 0,
): FinancialReconciliation {
  const netWorth = summarizeNetWorth(accountPosition, debts);
  const income = roundCurrencyValue(transactions.income);
  const expenses = roundCurrencyValue(transactions.expenses);
  const normalizedScopeTransfers = roundCurrencyValue(scopeTransfers);
  const normalizedCancellationAdjustments = roundCurrencyValue(cancellationAdjustments);
  const net = roundCurrencyValue(income - expenses + normalizedScopeTransfers);
  const hasIndependentOpeningPosition = Number.isFinite(openingNetWorth);
  // The optional opening position is calculated independently as of the day
  // before the selected range. The fallback preserves legacy callers that do
  // not have an opening snapshot, but those callers must not present the
  // resulting zero as an independently verified reconciliation.
  const openingPositionAndAdjustments = hasIndependentOpeningPosition
    ? roundCurrencyValue(openingNetWorth!)
    : roundCurrencyValue(netWorth.netWorth - net);
  const reconciledClosingNetWorth = roundCurrencyValue(openingPositionAndAdjustments + net + normalizedCancellationAdjustments);

  return {
    ...netWorth,
    cancellationAdjustments: normalizedCancellationAdjustments,
    difference: roundCurrencyValue(netWorth.netWorth - reconciledClosingNetWorth),
    expenses,
    hasIndependentOpeningPosition,
    income,
    net,
    openingPositionAndAdjustments,
    reconciledClosingNetWorth,
    scopeTransfers: normalizedScopeTransfers,
  };
}

export function reconciliationSeverity(difference: number) {
  const absoluteDifference = Math.abs(roundCurrencyValue(difference));
  if (absoluteDifference <= 0.005) return "balanced" as const;
  if (absoluteDifference <= 1) return "minor" as const;
  return "review" as const;
}
