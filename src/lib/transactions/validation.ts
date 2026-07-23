export type ValidatableTransactionInput = {
  accountAmountType: string;
  accountId: string;
  amount: number;
  categoryId: string;
  date: string;
  futurePlanningAmountId?: string;
  relatedEntityId: string;
  relatedEntityType: string;
  status: string;
  transferAccountAmountType: string;
  transferAccountId: string;
  type: string;
};

function validDateInput(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day;
}

export function validateTransactionInput(input: ValidatableTransactionInput) {
  if (!Number.isFinite(input.amount) || input.amount <= 0) return "Amount must be a finite number greater than zero.";
  if (!validDateInput(input.date)) return "Choose a valid transaction date.";
  if (!input.accountId) return "Select an account.";
  if (!input.accountAmountType.trim()) return "Select an account amount type.";
  if (!["Expense", "Income", "Transfer"].includes(input.type)) return "Choose a supported transaction type.";
  if (input.type === "Transfer" && input.futurePlanningAmountId) return "Transfers cannot be linked to a future-planning amount.";
  if (!["cleared", "pending", "scheduled"].includes(input.status.trim().toLowerCase())) return "Choose a supported transaction status.";

  if (input.type === "Transfer") {
    if (!input.transferAccountId) return "Select a destination account.";
    if (!input.transferAccountAmountType.trim()) return "Select a destination amount type.";
    if (input.accountId === input.transferAccountId
      && input.accountAmountType.trim().toLowerCase() === input.transferAccountAmountType.trim().toLowerCase()) {
      return "Same-account transfers require different source and destination amount types.";
    }
  } else {
    if (!input.categoryId) return "Select a category.";
    if (input.transferAccountId) return "Only transfers can have a destination account.";
  }

  const relatedTypes = ["asset", "budget", "debt", "none", "savings_goal", "subscription"];
  if (!relatedTypes.includes(input.relatedEntityType)) return "Choose a supported linked record type.";
  if (input.relatedEntityType !== "none" && input.relatedEntityType !== "debt" && !input.relatedEntityId) {
    return "Select the linked record.";
  }
  return "";
}
