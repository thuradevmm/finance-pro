import type { TransactionType } from "@/types/finance";
import { formatMmk } from "@/lib/currency";

export function getAmountInputValue(amount: string) {
  return amount.replace(/[^0-9.]/g, "");
}

export function formatSignedAmount(amount: string, type: TransactionType) {
  const numericAmount = Number(getAmountInputValue(amount));

  if (!amount.trim() || Number.isNaN(numericAmount)) {
    return formatMmk(0);
  }

  const formattedAmount = formatMmk(Math.abs(numericAmount));

  if (type === "Income") {
    return `+${formattedAmount}`;
  }

  if (type === "Expense") {
    return `-${formattedAmount}`;
  }

  return formattedAmount;
}
