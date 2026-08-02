import type { CategoryType, TransactionType } from "@/types/finance";

export type TransactionDisplayType = "Credit" | "Debit" | "Transfer";

/**
 * Database values remain Income/Expense for backward compatibility. All
 * product surfaces use accounting-facing Credit/Debit labels through these
 * mappings so persisted history and older integrations continue to work.
 */
export function transactionTypeLabel(type: TransactionType | string): TransactionDisplayType {
  const normalized = String(type).trim().toLowerCase();
  if (normalized === "income" || normalized === "credit") return "Credit";
  if (normalized === "expense" || normalized === "debit") return "Debit";
  return "Transfer";
}

export function transactionTypeFromLabel(value: unknown): TransactionType | null {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (normalized === "credit" || normalized === "income") return "Income";
  if (normalized === "debit" || normalized === "expense") return "Expense";
  if (normalized === "transfer") return "Transfer";
  return null;
}

export function categoryTypeLabel(type: CategoryType | string) {
  const normalized = String(type).trim().toLowerCase();
  if (normalized === "income" || normalized === "credit") return "Credit";
  if (normalized === "expense" || normalized === "debit") return "Debit";
  if (normalized === "debt" || normalized === "debts" || normalized === "borrowing & lending") return "Borrowing & Lending";
  return type;
}

export function planningDirectionLabel(value: unknown) {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (normalized === "income" || normalized === "credit") return "Credit";
  if (normalized === "expense" || normalized === "debit") return "Debit";
  if (normalized === "saving" || normalized === "savings") return "Saving";
  return String(value ?? "");
}
