import type { CategoryFinancialRole, CategoryType } from "@/types/finance";

export type FinancialPurposeOption = {
  description: string;
  label: string;
  value: Exclude<CategoryFinancialRole, "">;
};

const purposeLabels: Record<Exclude<CategoryFinancialRole, "">, string> = {
  debt_obligation: "Debt obligation",
  discretionary: "Discretionary",
  emergency_reserve: "Emergency reserve",
  essential: "Essential living",
  income: "Income source",
  other: "General / no indicator",
  savings: "Savings & capital",
};

const purposeDescriptions: Record<Exclude<CategoryFinancialRole, "">, string> = {
  debt_obligation: "Required repayments and borrowing commitments. Reserved for debt-focused reporting.",
  discretionary: "Optional lifestyle spending. Kept separate from essential living costs.",
  emergency_reserve: "Emergency-only savings. Its linked fund balance feeds Emergency Readiness.",
  essential: "Necessary living costs such as rent, food, and utilities. Feeds Essential Expense Load.",
  income: "Salary, business, or other Credit sources. Cash-flow already includes every finalized Credit.",
  other: "Use when this group should not feed a purpose-specific dashboard indicator.",
  savings: "General savings and reusable capital. Saving Momentum still follows actual linked contributions.",
};

const purposeValuesByType: Record<CategoryType, Array<Exclude<CategoryFinancialRole, "">>> = {
  Account: ["emergency_reserve", "savings", "other"],
  Asset: ["savings", "discretionary", "other"],
  Debt: ["debt_obligation", "other"],
  Expense: ["essential", "debt_obligation", "discretionary", "other"],
  Income: ["income", "other"],
  "Savings Goal": ["emergency_reserve", "savings", "other"],
  Subscription: ["essential", "discretionary", "other"],
};

export function financialPurposeOptionsFor(type: CategoryType): FinancialPurposeOption[] {
  return purposeValuesByType[type].map((value) => ({
    description: purposeDescriptions[value],
    label: purposeLabels[value],
    value,
  }));
}

export function financialPurposeLabel(role: CategoryFinancialRole) {
  return role ? purposeLabels[role] : "Not set";
}

export function financialPurposeFieldLabel(type: CategoryType) {
  if (type === "Expense") return "Debit dashboard classification";
  if (type === "Income") return "Credit dashboard classification";
  return `${type} dashboard classification`;
}

export function financialPurposeSupports(type: CategoryType, role: CategoryFinancialRole) {
  return role !== "" && purposeValuesByType[type].includes(role);
}
