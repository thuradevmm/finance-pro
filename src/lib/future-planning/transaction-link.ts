import type { TransactionType } from "@/types/finance";

export function futurePlanningDirectionSupportsTransactionType(
  direction: string,
  transactionType: TransactionType,
) {
  if (transactionType === "Transfer") return false;
  return direction === "income"
    ? transactionType === "Income"
    : transactionType === "Expense";
}
