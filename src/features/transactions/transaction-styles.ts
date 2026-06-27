import type { IconName } from "@/components/ui/icon";
import type { Transaction, TransactionCategoryName, TransactionType } from "@/types/finance";

export const categoryStyles: Partial<Record<TransactionCategoryName | string, string>> = {
  Food: "border-[#bae6fd] bg-[#e0f2fe] text-[#0369a1]",
  Housing: "border-[#fecaca] bg-[#fee2e2] text-[#991b1b]",
  Income: "border-[#bbf7d0] bg-[#dcfce7] text-[#166534]",
  Subscriptions: "border-[#e9d5ff] bg-[#f3e8ff] text-[#7e22ce]",
  Transfer: "border-[#d4d4d8] bg-[#f4f4f5] text-[#3f3f46]",
  Travel: "border-[#fed7aa] bg-[#ffedd5] text-[#c2410c]",
  Utilities: "border-[#bfdbfe] bg-[#dbeafe] text-[#1d4ed8]",
};

export function transactionTypeBadgeClass(type: TransactionType) {
  if (type === "Income") {
    return "border-[#bbf7d0] bg-[#dcfce7] text-[#166534]";
  }

  if (type === "Expense") {
    return "border-[#fecaca] bg-[#fee2e2] text-[#991b1b]";
  }

  return "border-[#d4d4d8] bg-[#f4f4f5] text-[#3f3f46]";
}

export function transactionTypeIcon(type: TransactionType): IconName {
  if (type === "Income") {
    return "trendingUp";
  }

  if (type === "Expense") {
    return "trendingDown";
  }

  return "sync";
}

export function amountClass(type: TransactionType, transferDirection?: Transaction["transferDirection"]) {
  if (type === "Income" || transferDirection === "Credit") {
    return "text-[#047857]";
  }

  if (type === "Expense" || transferDirection === "Debit") {
    return "text-[#b42318]";
  }

  return "text-[#0b1c30]";
}
