export type ValidatableDebtInput = {
  durationMonths: number;
  interestRate: number;
  isCreditCardDebt: boolean;
  lender: string;
  monthlyPayment: number;
  name: string;
  nextPaymentDate: string;
  payoffDate: string;
  repaidAmount: number;
  startDate: string;
  status: string;
  totalAmount: number;
  type: string;
};

function validDateInput(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day;
}

export function isCreditCardDebtType(value: unknown) {
  const normalized = String(value ?? "").trim().toLowerCase().replace(/[\s_-]+/g, "");
  return normalized === "creditcard" || normalized === "creditcarddebt";
}

export function validateDebtInput(input: ValidatableDebtInput) {
  if (!input.name.trim()) return "Debt name is required.";
  if (!input.lender.trim()) return "Lender is required.";
  if (!Number.isFinite(input.totalAmount) || input.totalAmount <= 0) return "Total amount must be greater than zero.";
  if (!Number.isFinite(input.repaidAmount) || input.repaidAmount < 0) return "Repaid amount cannot be negative.";
  if (!Number.isFinite(input.interestRate) || input.interestRate < 0) return "Interest rate cannot be negative.";
  if (!Number.isFinite(input.monthlyPayment) || input.monthlyPayment < 0) return "Monthly payment cannot be negative.";
  if (!Number.isInteger(input.durationMonths) || input.durationMonths <= 0) return "Duration must be a whole number greater than zero.";
  if (!validDateInput(input.startDate)) return "Choose a valid debt start date.";
  if (input.nextPaymentDate && !validDateInput(input.nextPaymentDate)) return "Choose a valid next payment date.";
  if (input.payoffDate && !validDateInput(input.payoffDate)) return "Choose a valid payoff date.";
  if (!['Active', 'Overdue', 'Paid'].includes(input.status)) return "Choose a supported debt status.";
  return "";
}
