import { roundCurrencyValue } from "@/lib/ledger";

export type DebtInterestRatePeriod = "Monthly" | "Yearly";

export type EmiSchedulePayment = {
  amount: number;
  dueDateValue: string;
  installmentNumber: number;
  interestAmount: number;
  principalAmount: number;
  principalOutstanding: number;
  timestamp: number;
};

export type EmiPaymentAllocation = EmiSchedulePayment & {
  amountDueValue: number;
  paidAmountValue: number;
  paidInterestValue: number;
  paidPrincipalValue: number;
};

export type DebtRepaymentSchedule = {
  firstInterestAmount: number;
  firstPrincipalAmount: number;
  installmentAmount: number;
  monthlyPayment: number;
  nextPaymentDate: string;
  payoffDate: string;
  principalPaid: number;
  remainingPrincipal: number;
  totalInterest: number;
  totalPrincipal: number;
  totalRepayment: number;
  payments: EmiSchedulePayment[];
};

type BuildEmiScheduleInput = {
  interestRate: number;
  interestRatePeriod: DebtInterestRatePeriod;
  numberOfMonths: number;
  principal: number;
  repaidAmount?: number;
  startDate: string;
};

const dayMs = 86_400_000;

function finitePositiveValue(value: number) {
  return Number.isFinite(value) && value > 0 ? value : 0;
}

function normalizedMonthCount(value: number) {
  return Number.isFinite(value) && value > 0 ? Math.trunc(value) : 0;
}

export function formatDateInput(value: Date) {
  if (Number.isNaN(value.getTime())) return "";
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`;
}

export function parseDateInput(value: string | null | undefined) {
  if (!value) return null;
  const dateValue = value.includes("T") ? value.slice(0, 10) : value;
  const date = new Date(`${dateValue}T00:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function addMonthsPreservingDay(startDate: string, monthCount: number) {
  const start = parseDateInput(startDate);
  if (!start || !Number.isFinite(monthCount) || monthCount <= 0) return null;

  const expectedDay = start.getDate();
  const result = new Date(start);
  result.setMonth(result.getMonth() + monthCount);
  if (result.getDate() !== expectedDay) result.setDate(0);
  return result;
}

function daysBetween(startDate: Date, endDate: Date) {
  return Math.max(Math.round((endDate.getTime() - startDate.getTime()) / dayMs), 0);
}

function startOfDateTimestamp(value: Date) {
  const date = new Date(value);
  date.setHours(0, 0, 0, 0);
  return date.getTime();
}

export function calculateEmiPayment(
  principal: number,
  interestRate: number,
  interestRatePeriod: DebtInterestRatePeriod,
  numberOfMonths: number,
) {
  const principalValue = finitePositiveValue(principal);
  const monthCount = normalizedMonthCount(numberOfMonths);
  if (principalValue <= 0 || monthCount <= 0) return 0;

  const monthlyRate = interestRatePeriod === "Monthly" ? interestRate / 100 : interestRate / 1200;
  if (!Number.isFinite(monthlyRate) || monthlyRate <= 0) {
    return roundCurrencyValue(principalValue / monthCount);
  }

  const payment = principalValue * (monthlyRate / (1 - (1 + monthlyRate) ** -monthCount));
  return roundCurrencyValue(payment);
}

function dueDateForMonth(startDate: string, month: number) {
  const dueDate = addMonthsPreservingDay(startDate, month);
  if (!dueDate) return null;
  dueDate.setDate(dueDate.getDate() - 1);
  return dueDate;
}

function paymentInterestAmount(
  balance: number,
  interestRate: number,
  interestRatePeriod: DebtInterestRatePeriod,
  previousDate: Date,
  dueDate: Date,
) {
  if (!Number.isFinite(interestRate) || interestRate <= 0) return { raw: 0, rounded: 0 };
  const raw = interestRatePeriod === "Monthly"
    ? balance * (interestRate / 100)
    : balance * (interestRate / 100) * (daysBetween(previousDate, dueDate) / 365);
  return { raw, rounded: roundCurrencyValue(raw) };
}

export function allocateEmiPayments(payments: EmiSchedulePayment[], repaidAmount: number): EmiPaymentAllocation[] {
  let unappliedPayment = Math.max(roundCurrencyValue(repaidAmount), 0);

  return payments.map((payment) => {
    const paidAmountValue = roundCurrencyValue(Math.min(unappliedPayment, payment.amount));
    const paidInterestValue = roundCurrencyValue(Math.min(paidAmountValue, payment.interestAmount));
    const paidPrincipalValue = roundCurrencyValue(Math.min(Math.max(paidAmountValue - paidInterestValue, 0), payment.principalAmount));
    unappliedPayment = roundCurrencyValue(Math.max(unappliedPayment - paidAmountValue, 0));

    return {
      ...payment,
      amountDueValue: roundCurrencyValue(Math.max(payment.amount - paidAmountValue, 0)),
      paidAmountValue,
      paidInterestValue,
      paidPrincipalValue,
    };
  });
}

export function calculateNextEmiPaymentDate(
  payments: EmiSchedulePayment[],
  repaidAmount: number,
  referenceDate = new Date(),
) {
  const allocations = allocateEmiPayments(payments, repaidAmount);
  const firstUnpaidPayment = allocations.find((payment) => payment.amountDueValue > 0.005);
  if (!firstUnpaidPayment) return "";

  const todayTimestamp = startOfDateTimestamp(referenceDate);
  if (firstUnpaidPayment.timestamp < todayTimestamp) return firstUnpaidPayment.dueDateValue;

  const currentOrFuturePayment = allocations.find((payment) => {
    return payment.amountDueValue > 0.005
      && payment.timestamp >= todayTimestamp
      && payment.timestamp >= firstUnpaidPayment.timestamp;
  });
  return currentOrFuturePayment?.dueDateValue ?? firstUnpaidPayment.dueDateValue;
}

export function unpaidEmiInstallments(payments: EmiSchedulePayment[], repaidAmount: number) {
  return allocateEmiPayments(payments, repaidAmount).flatMap((payment) => {
    if (payment.amountDueValue <= 0.005) return [];
    return [{
      amountValue: payment.amountDueValue,
      dueDateValue: payment.dueDateValue,
    }];
  });
}

export function buildEmiSchedule(input: BuildEmiScheduleInput): DebtRepaymentSchedule {
  const principal = finitePositiveValue(input.principal);
  const monthCount = normalizedMonthCount(input.numberOfMonths);
  const installmentAmount = calculateEmiPayment(principal, input.interestRate, input.interestRatePeriod, monthCount);
  const startedAt = parseDateInput(input.startDate);

  if (!startedAt || principal <= 0 || monthCount <= 0) {
    return {
      firstInterestAmount: 0,
      firstPrincipalAmount: 0,
      installmentAmount,
      monthlyPayment: installmentAmount,
      nextPaymentDate: "",
      payoffDate: "",
      principalPaid: 0,
      remainingPrincipal: principal,
      totalInterest: 0,
      totalPrincipal: principal,
      totalRepayment: principal,
      payments: [],
    };
  }

  let balance = principal;
  let previousDate = startedAt;
  let totalInterest = 0;
  let totalPrincipal = 0;
  let firstInterestAmount = 0;
  let firstPrincipalAmount = 0;
  let previousInstallmentTotal = 0;
  let payoffDate = "";
  const payments: EmiSchedulePayment[] = [];

  for (let month = 1; month <= monthCount; month += 1) {
    const dueDate = dueDateForMonth(input.startDate, month);
    if (!dueDate) break;
    payoffDate = formatDateInput(dueDate);

    const interest = paymentInterestAmount(balance, input.interestRate, input.interestRatePeriod, previousDate, dueDate);
    totalInterest += interest.raw;

    const isFinalPayment = month === monthCount;
    const targetTotalRepayment = roundCurrencyValue(principal + totalInterest);
    const paymentAmount = isFinalPayment
      ? roundCurrencyValue(Math.max(targetTotalRepayment - previousInstallmentTotal, 0))
      : installmentAmount;
    const principalAmount = isFinalPayment
      ? roundCurrencyValue(Math.max(paymentAmount - interest.rounded, 0))
      : roundCurrencyValue(Math.min(Math.max(paymentAmount - interest.rounded, 0), balance));
    const interestAmount = isFinalPayment
      ? interest.rounded
      : roundCurrencyValue(Math.max(paymentAmount - principalAmount, 0));
    const nextBalance = isFinalPayment ? 0 : roundCurrencyValue(Math.max(balance - principalAmount, 0));

    if (month === 1) {
      firstInterestAmount = interestAmount;
      firstPrincipalAmount = principalAmount;
    }

    payments.push({
      amount: paymentAmount,
      dueDateValue: payoffDate,
      installmentNumber: month,
      interestAmount,
      principalAmount,
      principalOutstanding: nextBalance,
      timestamp: dueDate.getTime(),
    });

    previousInstallmentTotal = roundCurrencyValue(previousInstallmentTotal + paymentAmount);
    totalPrincipal = roundCurrencyValue(Math.min(totalPrincipal + principalAmount, principal));
    balance = nextBalance;
    previousDate = dueDate;
  }

  const allocations = allocateEmiPayments(payments, input.repaidAmount ?? 0);
  const principalPaid = roundCurrencyValue(allocations.reduce((sum, payment) => sum + payment.paidPrincipalValue, 0));
  const totalRepayment = roundCurrencyValue(payments.reduce((sum, payment) => sum + payment.amount, 0));

  return {
    firstInterestAmount,
    firstPrincipalAmount,
    installmentAmount,
    monthlyPayment: installmentAmount,
    nextPaymentDate: calculateNextEmiPaymentDate(payments, input.repaidAmount ?? 0),
    payoffDate,
    principalPaid,
    remainingPrincipal: roundCurrencyValue(Math.max(principal - principalPaid, 0)),
    totalInterest: roundCurrencyValue(totalInterest),
    totalPrincipal: roundCurrencyValue(totalPrincipal),
    totalRepayment,
    payments,
  };
}
