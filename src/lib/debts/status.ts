export type CalculatedDebtStatus = "Active" | "Overdue" | "Paid";

function dateTimestamp(value: string | null | undefined) {
  if (!value) return null;
  const date = new Date(`${value.slice(0, 10)}T23:59:59`);
  return Number.isNaN(date.getTime()) ? null : date.getTime();
}

export function calculateDebtStatus(input: {
  dueDate?: string | null;
  remainingAmount: number;
  storedStatus?: unknown;
  today?: Date;
}): CalculatedDebtStatus {
  if (Number.isFinite(input.remainingAmount) && input.remainingAmount <= 0.005) return "Paid";

  const dueTimestamp = dateTimestamp(input.dueDate);
  const today = input.today ?? new Date();
  if (dueTimestamp != null) return dueTimestamp < today.getTime() ? "Overdue" : "Active";
  if (String(input.storedStatus ?? "").trim().toLowerCase() === "overdue") return "Overdue";
  return "Active";
}
