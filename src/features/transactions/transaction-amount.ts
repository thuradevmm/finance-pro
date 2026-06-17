import type { TransactionType } from "@/types/finance";

export function getAmountInputValue(amount: string) {
  return amount.replace(/[^0-9.]/g, "");
}

export function formatSignedAmount(amount: string, type: TransactionType) {
  const numericAmount = Number(getAmountInputValue(amount));

  if (!amount.trim() || Number.isNaN(numericAmount)) {
    return "$0.00";
  }

  const formattedAmount = `$${Math.abs(numericAmount).toLocaleString("en-US", {
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
  })}`;

  if (type === "Income") {
    return `+${formattedAmount}`;
  }

  if (type === "Expense") {
    return `-${formattedAmount}`;
  }

  return formattedAmount;
}
