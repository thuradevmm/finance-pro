export type DebtNature = "Borrowing" | "Lending";
export type DebtRepaymentFrequency = "Monthly" | "One-time";

function normalizedKey(value: unknown) {
  return String(value ?? "").trim().toLowerCase().replace(/[\s_-]+/g, "");
}

export function normalizeDebtNature(value: unknown, debtName = ""): DebtNature {
  const key = normalizedKey(value);
  if (["lending", "lent", "receivable", "loanreceivable"].includes(key)) return "Lending";
  if (["borrowing", "borrowed", "liability", "loanpayable"].includes(key)) return "Borrowing";
  return /^\s*lend(?:ing|t)?\b/i.test(debtName) ? "Lending" : "Borrowing";
}

export function normalizeDebtRepaymentFrequency(value: unknown): DebtRepaymentFrequency {
  const key = normalizedKey(value);
  return ["onetime", "once", "single", "customdate"].includes(key) ? "One-time" : "Monthly";
}

export function debtRepaymentTransactionType(nature: DebtNature) {
  return nature === "Lending" ? "Income" as const : "Expense" as const;
}

/**
 * A lending record can be an opening receivable, and its payment account only
 * identifies where future returns are received. Without a separately confirmed
 * funding account, setup must not fabricate a historical cash outflow.
 */
export function debtOriginationTransactionType(nature: DebtNature) {
  return nature === "Lending" ? null : "Income" as const;
}
