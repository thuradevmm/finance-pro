import type { SupabaseClient } from "@supabase/supabase-js";

import type { IconName } from "@/components/ui/icon";
import { buildCreditCardDueBuckets } from "@/lib/accounts/credit-card-dates";
import { formatMmk } from "@/lib/currency";
import { combineDateWithTimestampTime, dateTimeSortValue, formatDisplayDate } from "@/lib/date-format";
import type { CategoryRecord } from "@/lib/categories/supabase";
import { buildEmiSchedule, calculateDebtPayoffSummary, formatDateInput, parseDateInput, unpaidEmiInstallments } from "@/lib/debts/emi";
import type { DebtInterestRatePeriod } from "@/lib/debts/emi";
import { calculateDebtProgressPercent } from "@/lib/debts/progress";
import { calculateDebtStatus } from "@/lib/debts/status";
import { resolveDebtStoredNumber } from "@/lib/debts/stored-values";
import {
  buildDebtTransactionLedgers,
  isCreditCardDebtInput,
  standaloneDebtPaymentTransactions,
  usesManualCreditCardTerms,
  type DebtLedgerActivity,
  type DebtTransactionLedger,
} from "@/lib/debts/transactions";
import { metadataRecord, numericValue, roundCurrencyValue } from "@/lib/ledger";
import type { DebtRecord, DebtStatus, SummaryMetric, UpcomingDebtPayment } from "@/types/finance";

export type { DebtInterestRatePeriod } from "@/lib/debts/emi";

export type DebtFormData = {
  categoryId: string;
  durationMonths: number;
  interestRate: number;
  interestRatePeriod: DebtInterestRatePeriod;
  isCreditCardDebt: boolean;
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

export type DebtRecordWithValues = DebtRecord & {
  chargeActivity: DebtLedgerActivity[];
  categoryId: string;
  createdAtValue: string;
  creditCardAccountId: string;
  creditCardDueBuckets: DebtInstallment[];
  creditCardUsedAmountValue: number;
  durationMonths: number;
  grossRepaidAmountValue: number;
  interestRatePeriod: DebtInterestRatePeriod;
  interestRateValue: number;
  isCreditCardDebt: boolean;
  usesManualCreditCardTerms: boolean;
  nextPaymentDateValue: string;
  notes: string;
  paymentAccountId: string;
  payoffQuoteAmountValue: number;
  payoffQuoteDateValue: string;
  payoffQuoteInterestAmountValue: number;
  payoffQuotePrincipalAmountValue: number;
  payoffDate: string;
  repaymentActivity: DebtLedgerActivity[];
  repaidAmountValue: number;
  remainingBalanceValue: number;
  settledAtValue: string;
  startDate: string;
  storedRepaidAmountValue: number;
  totalAmountValue: number;
  monthlyPaymentValue: number;
  type: string;
};

export type { DebtLedgerActivity } from "@/lib/debts/transactions";

type DebtInstallment = {
  amountValue: number;
  dueDateValue: string;
};

type DebtRow = {
  category_id?: string | null;
  created_at?: string | null;
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
  account_id: string | null;
  amount: number | string | null;
  id: string;
  metadata: unknown;
  related_entity_type: string | null;
  status: string | null;
  transaction_date: string | null;
  transfer_account_id: string | null;
  type: string | null;
  related_entity_id: string | null;
};

const debtAppearances: Record<string, { bg: string; icon: IconName; tone: string }> = {
  "Car Loan": { bg: "bg-[#ecfdf5]", icon: "credit", tone: "text-[#047857]" },
  "Credit Card": { bg: "bg-[#fff1f0]", icon: "credit", tone: "text-[#b42318]" },
  Mortgage: { bg: "bg-[#eff6ff]", icon: "home", tone: "text-[#0058be]" },
  "Personal Loan": { bg: "bg-[#eef2ff]", icon: "account", tone: "text-[#4f46e5]" },
  "Student Loan": { bg: "bg-[#fff1f0]", icon: "document", tone: "text-[#b42318]" },
};

function isCreditCardDebt(row: DebtRow, metadata: Record<string, unknown>) {
  return isCreditCardDebtInput({ ...row, metadata });
}

function metadataString(metadata: Record<string, unknown>, key: string) {
  const value = metadata[key];
  return typeof value === "string" ? value : "";
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

function formatDate(value: string) {
  return formatDisplayDate(value);
}

function addMonths(date: Date, monthCount: number) {
  const next = new Date(date);
  const day = next.getDate();
  next.setMonth(next.getMonth() + monthCount);
  if (next.getDate() !== day) next.setDate(0);
  return next;
}

function creditCardDueDateValue(debt: DebtRecordWithValues) {
  if (debt.creditCardUsedAmountValue <= 0) return "";
  return debt.nextPaymentDateValue;
}

function upcomingInstallments(debt: DebtRecordWithValues): DebtInstallment[] {
  if (debt.isCreditCardDebt) {
    if (debt.creditCardUsedAmountValue <= 0) return [];
    if (!debt.usesManualCreditCardTerms) return debt.creditCardDueBuckets;

    const dueDateValue = creditCardDueDateValue(debt);
    const firstDueDate = parseDateInput(dueDateValue);
    if (!firstDueDate) return [];
    const regularPayment = debt.monthlyPaymentValue > 0
      ? debt.monthlyPaymentValue
      : debt.creditCardUsedAmountValue;
    const installmentCount = Math.min(Math.max(
      debt.durationMonths,
      Math.ceil(debt.creditCardUsedAmountValue / regularPayment),
      1,
    ), 600);
    let remaining = debt.creditCardUsedAmountValue;

    return Array.from({ length: installmentCount }).flatMap((_, index): DebtInstallment[] => {
      if (remaining <= 0.005) return [];
      const amountValue = roundCurrencyValue(Math.min(regularPayment, remaining));
      remaining = roundCurrencyValue(Math.max(remaining - amountValue, 0));
      return [{
        amountValue,
        dueDateValue: formatDateInput(addMonths(firstDueDate, index)),
      }];
    });
  }

  if (debt.status === "Paid" || debt.remainingBalanceValue <= 0) return [];

  const schedule = buildEmiSchedule({
    interestRate: debt.interestRateValue,
    interestRatePeriod: debt.interestRatePeriod,
    numberOfMonths: debt.durationMonths,
    principal: debt.totalAmountValue,
    repaidAmount: debt.grossRepaidAmountValue,
    startDate: debt.startDate,
  });
  const scheduledInstallments = unpaidEmiInstallments(schedule.payments, debt.grossRepaidAmountValue);
  if (scheduledInstallments.length > 0) return scheduledInstallments;

  if (!debt.nextPaymentDateValue) return [];

  const firstDueDate = parseDateInput(debt.nextPaymentDateValue);
  if (!firstDueDate) return [];

  let dueDate = firstDueDate;
  let unappliedPayments = debt.repaymentActivity.reduce((sum, repayment) => sum + repayment.amountValue, 0);
  let scheduleBalance = roundCurrencyValue(debt.remainingBalanceValue + unappliedPayments);
  const regularPayment = debt.monthlyPaymentValue > 0 ? debt.monthlyPaymentValue : scheduleBalance;
  const balanceInstallments = regularPayment > 0 ? Math.ceil(scheduleBalance / regularPayment) : 1;
  const maxInstallments = Math.min(Math.max(debt.durationMonths, balanceInstallments, 1) + 12, 600);
  const installments: Array<{ amountValue: number; dueDateValue: string }> = [];

  for (let installmentIndex = 0; installmentIndex < maxInstallments && scheduleBalance > 0.005; installmentIndex += 1) {
    const installmentAmount = roundCurrencyValue(Math.min(regularPayment, scheduleBalance));
    const appliedPayment = Math.min(unappliedPayments, installmentAmount);
    const amountDue = roundCurrencyValue(installmentAmount - appliedPayment);

    if (amountDue > 0.005) {
      installments.push({
        amountValue: amountDue,
        dueDateValue: formatDateInput(dueDate),
      });
    }

    unappliedPayments = roundCurrencyValue(Math.max(unappliedPayments - appliedPayment, 0));
    scheduleBalance = roundCurrencyValue(scheduleBalance - installmentAmount);
    dueDate = addMonths(dueDate, 1);
  }

  return installments;
}

function mapDebt(
  row: DebtRow,
  categories: Map<string, CategoryRecord>,
  transactionLedger?: DebtTransactionLedger,
): DebtRecordWithValues {
  const metadata = metadataRecord(row.metadata);
  const categoryId = row.category_id ?? (typeof metadata.category_id === "string" ? metadata.category_id : "");
  const category = categories.get(categoryId);
  const isCreditCard = isCreditCardDebt(row, metadata);
  const creditCardAccountId = isCreditCard
    ? metadataString(metadata, "credit_card_account_id") || metadataString(metadata, "auto_credit_card_account_id") || row.payment_account_id || ""
    : "";
  const manualCreditCardTerms = isCreditCard && usesManualCreditCardTerms({ ...row, metadata });
  const type = category?.name ?? (isCreditCard ? "Credit Card" : String(row.type ?? metadata.type ?? "Debt"));
  const appearance = category ? { bg: category.bg, icon: category.icon, tone: category.tone } : debtAppearances[type] ?? debtAppearances["Personal Loan"];
  const chargeActivity = transactionLedger?.chargeActivity ?? [];
  const repaymentActivity = transactionLedger?.repaymentActivity ?? [];
  const storedRepaidAmountValue = resolveDebtStoredNumber(row.repaid_amount, metadata.repaid_amount);
  const linkedRepaymentAmountValue = transactionLedger?.repayments ?? 0;
  const totalChargedAmountValue = resolveDebtStoredNumber(row.total_amount, metadata.total_amount) + (transactionLedger?.charges ?? 0);
  const grossRepaidAmountValue = storedRepaidAmountValue + linkedRepaymentAmountValue;
  const repaidAmountValue = isCreditCard
    ? Math.min(grossRepaidAmountValue, Math.max(totalChargedAmountValue, 0))
    : grossRepaidAmountValue;
  const creditCardUsedAmountValue = isCreditCard ? Math.max(totalChargedAmountValue - grossRepaidAmountValue, 0) : 0;
  const totalAmountValue = totalChargedAmountValue;
  const interestRatePeriod = normalizeInterestRatePeriod(metadata.interest_rate_period);
  const interestRateValue = resolveDebtStoredNumber(row.interest_rate, metadata.interest_rate);
  const storedMonthlyPaymentValue = resolveDebtStoredNumber(row.monthly_payment, metadata.monthly_payment);
  const storedPayoffDate = typeof metadata.payoff_date === "string" ? metadata.payoff_date : "";
  const startDate = row.start_date ?? (typeof metadata.start_date === "string" ? metadata.start_date : "");
  const storedNextPaymentDateValue = row.next_payment_date ?? (typeof metadata.next_payment_date === "string" ? metadata.next_payment_date : "");
  const cardDueBuckets = isCreditCard
    ? buildCreditCardDueBuckets({
      chargeActivity,
      fallbackDueDate: storedNextPaymentDateValue,
      openingChargeAmount: resolveDebtStoredNumber(row.total_amount, metadata.total_amount),
      paymentDueDay: numericValue(metadata.credit_payment_due_day) || null,
      repaymentAmount: grossRepaidAmountValue,
      statementDay: numericValue(metadata.credit_statement_day) || null,
    })
    : [];
  const durationMonths = isCreditCard && !manualCreditCardTerms
    ? Math.max(numericValue(metadata.duration_months, 1), 1)
    : Math.max(numericValue(metadata.duration_months, wholeMonthsBetween(startDate, storedPayoffDate)), 0);
  const emiSchedule = !isCreditCard && totalAmountValue > 0
    ? buildEmiSchedule({
      interestRate: interestRateValue,
      interestRatePeriod,
      numberOfMonths: durationMonths,
      principal: totalAmountValue,
      repaidAmount: repaidAmountValue,
      startDate,
    })
    : null;
  const settledAtValue = typeof metadata.early_payoff_date === "string"
    ? metadata.early_payoff_date
    : typeof metadata.paid_at === "string"
      ? metadata.paid_at.slice(0, 10)
      : "";
  const hasEarlyPayoffSettlement = metadata.early_payoff === true
    || (String(row.status ?? metadata.status ?? "").toLowerCase() === "paid" && numericValue(metadata.remaining_principal) <= 0.005 && Boolean(settledAtValue));
  const payoffSummary = !isCreditCard && totalAmountValue > 0
    ? calculateDebtPayoffSummary({
      interestRate: interestRateValue,
      interestRatePeriod,
      numberOfMonths: durationMonths,
      openingRepaidAmount: storedRepaidAmountValue,
      principal: totalAmountValue,
      referenceDate: formatDateInput(new Date()),
      repayments: repaymentActivity,
      settledAt: settledAtValue,
      settledEarly: hasEarlyPayoffSettlement,
      startDate,
    })
    : null;
  const remaining = isCreditCard ? creditCardUsedAmountValue : payoffSummary?.remainingPrincipal ?? emiSchedule?.remainingPrincipal ?? Math.max(totalAmountValue - repaidAmountValue, 0);
  const isPaid = remaining <= 0.005;
  const monthlyPaymentValue = isPaid
    ? 0
    : isCreditCard
      ? manualCreditCardTerms
        ? Math.min(storedMonthlyPaymentValue || cardDueBuckets[0]?.amountValue || 0, cardDueBuckets[0]?.amountValue ?? creditCardUsedAmountValue)
        : cardDueBuckets[0]?.amountValue ?? 0
      : emiSchedule ? emiSchedule.monthlyPayment : storedMonthlyPaymentValue;
  const payoffDate = payoffSummary?.isEarlyPayoff ? payoffSummary.paidAt : emiSchedule?.payoffDate || storedPayoffDate;
  const nextPaymentDateValue = isPaid
    ? ""
    : isCreditCard
      ? cardDueBuckets[0]?.dueDateValue ?? ""
      : emiSchedule?.nextPaymentDate || storedNextPaymentDateValue;
  const repaidPrincipalValue = payoffSummary?.principalPaid ?? emiSchedule?.principalPaid ?? repaidAmountValue;
  const displayedRepaidAmountValue = isCreditCard ? repaidAmountValue : repaidPrincipalValue;
  // Credit-card total and progress share the same gross charge basis. This
  // keeps Total, Repaid, Remaining, and the percentage arithmetically aligned.
  const progressAmountValue = isCreditCard ? totalChargedAmountValue : totalAmountValue;
  const progressPercent = calculateDebtProgressPercent(repaidPrincipalValue, progressAmountValue);

  return {
    ...appearance,
    chargeActivity,
    categoryId,
    createdAtValue: row.created_at ?? "",
    creditCardAccountId,
    creditCardDueBuckets: cardDueBuckets,
    creditCardUsedAmountValue,
    durationMonths,
    grossRepaidAmountValue,
    id: row.id,
    interestRate: `${interestRateValue}% ${interestRatePeriod.toLowerCase()}`,
    interestRatePeriod,
    interestRateValue,
    isCreditCardDebt: isCreditCard,
    usesManualCreditCardTerms: manualCreditCardTerms,
    lender: row.lender ?? (typeof metadata.lender === "string" ? metadata.lender : ""),
    monthlyPayment: formatMmk(monthlyPaymentValue),
    monthlyPaymentValue,
    name: row.name,
    nextPaymentDate: formatDate(nextPaymentDateValue),
    nextPaymentDateTimeValue: combineDateWithTimestampTime(nextPaymentDateValue, row.created_at),
    nextPaymentDateValue,
    notes: row.description ?? (typeof metadata.notes === "string" ? metadata.notes : ""),
    paymentAccountId: row.payment_account_id ?? (typeof metadata.payment_account_id === "string" ? metadata.payment_account_id : ""),
    payoffQuoteAmountValue: payoffSummary?.currentQuote.payoffAmount ?? 0,
    payoffQuoteDateValue: payoffSummary?.currentQuote.asOfDate ?? "",
    payoffQuoteInterestAmountValue: payoffSummary?.currentQuote.accruedInterestAmount ?? 0,
    payoffQuotePrincipalAmountValue: payoffSummary?.currentQuote.principalOutstandingAmount ?? 0,
    payoffDate,
    progressPercent,
    repaymentActivity,
    remainingBalance: formatMmk(remaining),
    remainingBalanceValue: remaining,
    repaidAmount: formatMmk(displayedRepaidAmountValue),
    repaidAmountValue: displayedRepaidAmountValue,
    settledAtValue: payoffSummary?.paidAt ?? settledAtValue,
    startDate,
    status: calculateDebtStatus({
      dueDate: nextPaymentDateValue,
      remainingAmount: remaining,
      storedStatus: row.status ?? metadata.status,
    }),
    storedRepaidAmountValue,
    totalAmount: formatMmk(totalAmountValue),
    totalAmountValue,
    type,
  };
}

export async function getDebts(supabase: SupabaseClient, userId: string, categories: CategoryRecord[], options: { limit?: number } = {}) {
  let debtsQuery = supabase.from("debts").select("*").eq("user_id", userId).is("deleted_at", null).order("created_at", { ascending: false });
  if (options.limit) debtsQuery = debtsQuery.limit(options.limit);

  const [debtsResult, transactionsResult, debtPaymentsResult] = await Promise.all([
    debtsQuery,
    supabase.from("transactions").select("id,related_entity_id,related_entity_type,account_id,transfer_account_id,type,amount,metadata,status,transaction_date").eq("user_id", userId).is("deleted_at", null),
    supabase.from("debt_payments").select("id,debt_id,transaction_id,amount,payment_date").eq("user_id", userId),
  ]);
  const error = debtsResult.error ?? transactionsResult.error ?? debtPaymentsResult.error;
  if (error) throw new Error(error.message);
  const categoriesById = new Map(categories.map((category) => [category.id, category]));
  const debtRows = debtsResult.data as DebtRow[];
  const transactionLedgers = buildDebtTransactionLedgers([
    ...(transactionsResult.data as LinkedTransactionRow[]),
    ...standaloneDebtPaymentTransactions(debtPaymentsResult.data ?? []),
  ], debtRows);
  return debtRows
    .map((row) => mapDebt(row, categoriesById, transactionLedgers.get(row.id)))
    .sort((first, second) => dateTimeSortValue(first.nextPaymentDateTimeValue ?? "") - dateTimeSortValue(second.nextPaymentDateTimeValue ?? ""));
}

export async function getDebt(supabase: SupabaseClient, userId: string, debtId: string, categories: CategoryRecord[]) {
  const debts = await getDebts(supabase, userId, categories);
  return debts.find((debt) => debt.id === debtId) ?? null;
}

export function getDebtSummaries(debts: DebtRecordWithValues[]): SummaryMetric[] {
  const totalDebt = debts.reduce((sum, debt) => sum + debt.totalAmountValue, 0);
  const repaid = debts.reduce((sum, debt) => sum + debt.repaidAmountValue, 0);
  const remaining = debts.reduce((sum, debt) => sum + debt.remainingBalanceValue, 0);
  const creditCardUsed = debts.reduce((sum, debt) => sum + debt.creditCardUsedAmountValue, 0);
  const summaries: SummaryMetric[] = [
    { label: "Total Debt", value: formatMmk(totalDebt), icon: "trendingDown", tone: "text-[#b42318]", bg: "bg-[#fff1f0]" },
    { label: "Principal / Applied", value: formatMmk(repaid), icon: "trendingUp", tone: "text-[#047857]", bg: "bg-[#ecfdf5]" },
    { label: "Remaining Debt", value: formatMmk(remaining), icon: "timeline", tone: "text-[#0058be]", bg: "bg-[#eff6ff]" },
    { label: "Active Debts", value: String(debts.filter((debt) => debt.status !== "Paid").length), icon: "document", tone: "text-[#4f46e5]", bg: "bg-[#eef2ff]" },
  ];
  return creditCardUsed > 0 || debts.some((debt) => debt.isCreditCardDebt)
    ? [
      ...summaries.slice(0, 3),
      { label: "Credit Card Used", value: formatMmk(creditCardUsed), icon: "credit", tone: "text-[#b42318]", bg: "bg-[#fff1f0]" },
      summaries[3],
    ]
    : summaries;
}

export function getUpcomingDebtPayments(debts: DebtRecordWithValues[]): UpcomingDebtPayment[] {
  const today = Date.now();
  return debts
    .flatMap((debt): UpcomingDebtPayment[] => {
      if (debt.status === "Paid" || (!debt.isCreditCardDebt && debt.remainingBalanceValue <= 0)) return [];
      return upcomingInstallments(debt).flatMap((installment, index) => {
        if (installment.amountValue <= 0) return [];
        const dueDateTimeValue = combineDateWithTimestampTime(installment.dueDateValue, debt.createdAtValue);
        return [{
          amount: formatMmk(installment.amountValue),
          amountValue: installment.amountValue,
          category: debt.type,
          debtId: debt.id,
          debtName: debt.name,
          dueDateTimeValue,
          dueDateValue: installment.dueDateValue,
          dueLabel: formatDate(installment.dueDateValue),
          id: `${debt.id}-${installment.dueDateValue}-${index}`,
          isOverdue: new Date(`${installment.dueDateValue}T23:59:59`).getTime() < today,
        }];
      });
    })
    .sort((first, second) => dateTimeSortValue(first.dueDateTimeValue ?? "") - dateTimeSortValue(second.dueDateTimeValue ?? ""));
}
