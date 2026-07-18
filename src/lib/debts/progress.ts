function finiteAmount(value: number) {
  return Number.isFinite(value) ? Math.max(value, 0) : 0;
}

/**
 * Calculates repayment progress against the original amount owed. The result
 * is intentionally clamped because overpayments should not render progress
 * beyond a completed debt.
 */
export function calculateDebtProgressPercent(repaidAmount: number, amountOwed: number) {
  const total = finiteAmount(amountOwed);
  if (total <= 0) return 0;

  const repaid = finiteAmount(repaidAmount);
  return Math.min(Math.round((repaid / total) * 100), 100);
}
