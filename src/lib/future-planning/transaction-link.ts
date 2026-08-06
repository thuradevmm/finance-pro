import type { TransactionType } from "@/types/finance";

export function futurePlanningDirectionSupportsTransactionType(
  direction: string,
  transactionType: TransactionType,
) {
  if (direction === "saving") return transactionType === "Income" || transactionType === "Transfer";
  if (transactionType === "Transfer") return false;
  return direction === "income"
    ? transactionType === "Income"
    : transactionType === "Expense";
}
