export function calculateTransactionRemainingAmount({
  amount,
  availableAmount,
  direction,
  maximumAmount,
  reservesBalance,
}: {
  amount: number;
  availableAmount: number;
  direction: "inflow" | "outflow";
  maximumAmount?: number;
  reservesBalance: boolean;
}) {
  const safeAvailableAmount = Number.isFinite(availableAmount) ? availableAmount : 0;
  if (!reservesBalance || !Number.isFinite(amount) || amount <= 0) return safeAvailableAmount;

  const remainingAmount = direction === "inflow"
    ? safeAvailableAmount + amount
    : safeAvailableAmount - amount;
  const cappedAmount = Number.isFinite(maximumAmount)
    ? Math.min(remainingAmount, maximumAmount as number)
    : remainingAmount;

  return Math.round((cappedAmount + Number.EPSILON) * 100) / 100;
}
