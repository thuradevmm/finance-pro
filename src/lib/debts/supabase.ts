import type { SupabaseClient } from "@supabase/supabase-js";

import type { IconName } from "@/components/ui/icon";
import { formatMmk } from "@/lib/currency";
import type { CategoryRecord } from "@/lib/categories/supabase";
import type { DebtRecord, DebtStatus, SummaryMetric, UpcomingDebtPayment } from "@/types/finance";

export type DebtFormData = {
  categoryId: string;
  durationMonths: number;
  interestRate: number;
  interestRatePeriod: DebtInterestRatePeriod;
  lender: string;
  monthlyPayment: number;
  name: string;
  nextPaymentDate: string;
  notes: string;
  paymentAccountId: string;
  payoffDate: string;
  repaidAmount: number;
  startDate: string;
  status: DebtStatus;
  totalAmount: number;
  type: string;
};

export type DebtInterestRatePeriod = "Monthly" | "Yearly";

export type DebtRecordWithValues = DebtRecord & {
  categoryId: string;
  durationMonths: number;
  interestRatePeriod: DebtInterestRatePeriod;
  interestRateValue: number;
  nextPaymentDateValue: string;
  notes: string;
  paymentAccountId: string;
  payoffDate: string;
  repaidAmountValue: number;
  startDate: string;
  totalAmountValue: number;
  monthlyPaymentValue: number;
  type: string;
};

type DebtRow = {
  category_id?: string | null;
  description?: string | null;
  id: string;
  interest_rate?: number | string | null;
  lender?: string | null;
  metadata?: unknown;
  monthly_payment?: number | string | null;
  name: string;
  next_payment_date?: string | null;
  payment_account_id?: string | null;
  repaid_amount?: number | string | null;
  start_date?: string | null;
  status?: string | null;
  total_amount?: number | string | null;
  type?: string | null;
};

type LinkedTransactionRow = {
  amount: number | string | null;
  related_entity_id: string | null;
};

const debtAppearances: Record<string, { bg: string; icon: IconName; tone: string }> = {
  "Car Loan": { bg: "bg-[#ecfdf5]", icon: "credit", tone: "text-[#047857]" },
  Mortgage: { bg: "bg-[#eff6ff]", icon: "home", tone: "text-[#0058be]" },
  "Personal Loan": { bg: "bg-[#eef2ff]", icon: "account", tone: "text-[#4f46e5]" },
  "Student Loan": { bg: "bg-[#fff1f0]", icon: "document", tone: "text-[#b42318]" },
};

function metadataRecord(metadata: unknown) {
  return metadata && typeof metadata === "object" && !Array.isArray(metadata) ? metadata as Record<string, unknown> : {};
}

function numericValue(value: unknown, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function normalizeInterestRatePeriod(value: unknown): DebtInterestRatePeriod {
  return String(value ?? "").toLowerCase() === "monthly" ? "Monthly" : "Yearly";
}

function wholeMonthsBetween(startValue: string, endValue: string) {
  const start = new Date(`${startValue}T00:00:00`);
  const end = new Date(`${endValue}T00:00:00`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) return 0;

  const monthCount = (end.getFullYear() - start.getFullYear()) * 12 + end.getMonth() - start.getMonth();
  return Math.max(monthCount + (end.getDate() > start.getDate() ? 1 : 0), 1);
}

function normalizeStatus(value: unknown, remaining: number): DebtStatus {
  const status = String(value ?? "").toLowerCase();
  if (remaining <= 0 || status === "paid") return "Paid";
  if (status === "overdue") return "Overdue";
  return "Active";
}

function formatDate(value: string) {
  if (!value) return "Not set";
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-US", { day: "2-digit", month: "short", year: "numeric" }).format(date);
}

function mapDebt(row: DebtRow, categories: Map<string, CategoryRecord>, linkedRepaymentsByDebtId: Map<string, number>): DebtRecordWithValues {
  const metadata = metadataRecord(row.metadata);
  const categoryId = row.category_id ?? (typeof metadata.category_id === "string" ? metadata.category_id : "");
  const category = categories.get(categoryId);
  const type = category?.name ?? String(row.type ?? metadata.type ?? "Debt");
  const appearance = category ? { bg: category.bg, icon: category.icon, tone: category.tone } : debtAppearances[type] ?? debtAppearances["Personal Loan"];
  const totalAmountValue = numericValue(row.total_amount) || numericValue(metadata.total_amount);
  const repaidAmountValue = (numericValue(row.repaid_amount) || numericValue(metadata.repaid_amount)) + (linkedRepaymentsByDebtId.get(row.id) ?? 0);
  const monthlyPaymentValue = numericValue(row.monthly_payment) || numericValue(metadata.monthly_payment);
  const interestRatePeriod = normalizeInterestRatePeriod(metadata.interest_rate_period);
  const payoffDate = typeof metadata.payoff_date === "string" ? metadata.payoff_date : "";
  const startDate = row.start_date ?? (typeof metadata.start_date === "string" ? metadata.start_date : "");
  const nextPaymentDateValue = row.next_payment_date ?? (typeof metadata.next_payment_date === "string" ? metadata.next_payment_date : "");
  const durationMonths = Math.max(numericValue(metadata.duration_months, wholeMonthsBetween(startDate, payoffDate)), 0);
  const remaining = Math.max(totalAmountValue - repaidAmountValue, 0);
  const progressPercent = totalAmountValue > 0 ? Math.min(Math.round((repaidAmountValue / totalAmountValue) * 100), 100) : 0;

  return {
    ...appearance,
    categoryId,
    durationMonths,
    id: row.id,
    interestRate: `${numericValue(row.interest_rate) || numericValue(metadata.interest_rate)}% ${interestRatePeriod.toLowerCase()}`,
    interestRatePeriod,
    interestRateValue: numericValue(row.interest_rate) || numericValue(metadata.interest_rate),
    lender: row.lender ?? (typeof metadata.lender === "string" ? metadata.lender : ""),
    monthlyPayment: formatMmk(monthlyPaymentValue),
    monthlyPaymentValue,
    name: row.name,
    nextPaymentDate: formatDate(nextPaymentDateValue),
    nextPaymentDateValue,
    notes: row.description ?? (typeof metadata.notes === "string" ? metadata.notes : ""),
    paymentAccountId: row.payment_account_id ?? (typeof metadata.payment_account_id === "string" ? metadata.payment_account_id : ""),
    payoffDate,
    progressPercent,
    remainingBalance: formatMmk(remaining),
    repaidAmount: formatMmk(repaidAmountValue),
    repaidAmountValue,
    startDate,
    status: normalizeStatus(row.status ?? metadata.status, remaining),
    totalAmount: formatMmk(totalAmountValue),
    totalAmountValue,
    type,
  };
}

export async function getDebts(supabase: SupabaseClient, userId: string, categories: CategoryRecord[]) {
  const [debtsResult, transactionsResult] = await Promise.all([
    supabase.from("debts").select("*").eq("user_id", userId).is("deleted_at", null).order("created_at", { ascending: false }),
    supabase.from("transactions").select("related_entity_id,amount").eq("user_id", userId).eq("related_entity_type", "debt").is("deleted_at", null),
  ]);
  if (debtsResult.error) throw new Error(debtsResult.error.message);
  if (transactionsResult.error) throw new Error(transactionsResult.error.message);
  const categoriesById = new Map(categories.map((category) => [category.id, category]));
  const linkedRepaymentsByDebtId = new Map<string, number>();
  for (const transaction of transactionsResult.data as LinkedTransactionRow[]) {
    if (!transaction.related_entity_id) continue;
    linkedRepaymentsByDebtId.set(
      transaction.related_entity_id,
      (linkedRepaymentsByDebtId.get(transaction.related_entity_id) ?? 0) + Math.abs(numericValue(transaction.amount)),
    );
  }
  return (debtsResult.data as DebtRow[]).map((row) => mapDebt(row, categoriesById, linkedRepaymentsByDebtId));
}

export async function getDebt(supabase: SupabaseClient, userId: string, debtId: string, categories: CategoryRecord[]) {
  const debts = await getDebts(supabase, userId, categories);
  return debts.find((debt) => debt.id === debtId) ?? null;
}

export function getDebtSummaries(debts: DebtRecordWithValues[]): SummaryMetric[] {
  const totalDebt = debts.reduce((sum, debt) => sum + debt.totalAmountValue, 0);
  const repaid = debts.reduce((sum, debt) => sum + debt.repaidAmountValue, 0);
  return [
    { label: "Total Debt", value: formatMmk(totalDebt), icon: "trendingDown", tone: "text-[#b42318]", bg: "bg-[#fff1f0]" },
    { label: "Repaid", value: formatMmk(repaid), icon: "trendingUp", tone: "text-[#047857]", bg: "bg-[#ecfdf5]" },
    { label: "Remaining Debt", value: formatMmk(Math.max(totalDebt - repaid, 0)), icon: "timeline", tone: "text-[#0058be]", bg: "bg-[#eff6ff]" },
    { label: "Active Debts", value: String(debts.filter((debt) => debt.status !== "Paid").length), icon: "document", tone: "text-[#4f46e5]", bg: "bg-[#eef2ff]" },
  ];
}

export function getUpcomingDebtPayments(debts: DebtRecordWithValues[]): UpcomingDebtPayment[] {
  const today = Date.now();
  return debts
    .filter((debt) => debt.status !== "Paid" && debt.nextPaymentDateValue)
    .slice(0, 5)
    .map((debt) => ({
      amount: debt.monthlyPayment,
      debtName: debt.name,
      dueLabel: debt.nextPaymentDate,
      id: debt.id,
      isOverdue: new Date(`${debt.nextPaymentDateValue}T23:59:59`).getTime() < today,
    }));
}
