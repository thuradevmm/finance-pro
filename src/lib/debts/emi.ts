function roundCurrencyValue(value: number) {
  return Math.round((value + Math.sign(value) * Number.EPSILON) * 100) / 100;
}

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

export type DebtDatedRepayment = {
  amountValue: number;
  dateValue: string;
};

export type DebtPayoffQuote = {
  accruedInterestAmount: number;
  asOfDate: string;
  payoffAmount: number;
  principalOutstandingAmount: number;
};

export type DebtPayoffSummary = {
  currentQuote: DebtPayoffQuote;
  isPaidOff: boolean;
  isEarlyPayoff: boolean;
  paidAt: string;
  principalPaid: number;
  remainingPrincipal: number;
  settlementAmount: number;
  settlementInterestAmount: number;
  settlementPrincipalAmount: number;
  totalPaid: number;
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

type CalculateDebtPayoffSummaryInput = BuildEmiScheduleInput & {
  openingRepaidAmount?: number;
  referenceDate?: string;
  repayments?: DebtDatedRepayment[];
  settledAt?: string;
  settledEarly?: boolean;
};

const dayMs = 86_400_000;
const payoffTolerance = 0.005;

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

function compareDebtRepayments(first: DebtDatedRepayment, second: DebtDatedRepayment) {
  const firstDate = parseDateInput(first.dateValue);
  const secondDate = parseDateInput(second.dateValue);
  const dateDifference = (firstDate?.getTime() ?? 0) - (secondDate?.getTime() ?? 0);
  return dateDifference || first.amountValue - second.amountValue;
}

function safeReferenceDate(value: string | null | undefined) {
  return parseDateInput(value) ?? new Date();
}

function nextScheduleDueDateAfter(payments: EmiSchedulePayment[], afterDate: Date) {
  const afterTimestamp = startOfDateTimestamp(afterDate);
  const payment = payments.find((entry) => entry.timestamp > afterTimestamp);
  return payment ? parseDateInput(payment.dueDateValue) : null;
}

function fallbackMonthlyPeriodEnd(startDate: Date) {
  return addMonthsPreservingDay(formatDateInput(startDate), 1) ?? new Date(startDate.getTime() + (30 * dayMs));
}

function calculateMonthlyAccruedInterest(
  balance: number,
  interestRate: number,
  fromDate: Date,
  toDate: Date,
  payments: EmiSchedulePayment[],
) {
  const monthlyRate = interestRate / 100;
  if (!Number.isFinite(monthlyRate) || monthlyRate <= 0) return 0;

  let cursor = new Date(fromDate);
  let accruedInterest = 0;

  while (cursor < toDate) {
    const scheduledPeriodEnd = nextScheduleDueDateAfter(payments, cursor) ?? fallbackMonthlyPeriodEnd(cursor);
    const periodEnd = scheduledPeriodEnd > cursor ? scheduledPeriodEnd : fallbackMonthlyPeriodEnd(cursor);
    const effectiveEnd = periodEnd < toDate ? periodEnd : toDate;
    const periodDays = Math.max(daysBetween(cursor, periodEnd), 1);
    const accruedDays = Math.max(daysBetween(cursor, effectiveEnd), 0);
    accruedInterest += balance * monthlyRate * (accruedDays / periodDays);
    cursor = periodEnd;
  }

  return accruedInterest;
}

function payoffInterestAmount(
  balance: number,
  interestRate: number,
  interestRatePeriod: DebtInterestRatePeriod,
  fromDate: Date,
  toDate: Date,
  payments: EmiSchedulePayment[],
) {
  if (!Number.isFinite(interestRate) || interestRate <= 0 || balance <= 0 || toDate <= fromDate) return 0;

  const raw = interestRatePeriod === "Monthly"
    ? calculateMonthlyAccruedInterest(balance, interestRate, fromDate, toDate, payments)
    : balance * (interestRate / 100) * (daysBetween(fromDate, toDate) / 365);
  return roundCurrencyValue(raw);
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
  return addMonthsPreservingDay(startDate, month);
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

function payoffQuoteForRepaidAmount(
  schedule: DebtRepaymentSchedule,
  input: Pick<BuildEmiScheduleInput, "interestRate" | "interestRatePeriod" | "principal" | "startDate">,
  repaidAmount: number,
  asOfDateValue: string,
): DebtPayoffQuote {
  const asOfDate = safeReferenceDate(asOfDateValue);
  const asOfDateInput = formatDateInput(asOfDate);
  const principal = finitePositiveValue(input.principal);
  const startedAt = parseDateInput(input.startDate);
  if (!startedAt || principal <= 0) {
    return {
      accruedInterestAmount: 0,
      asOfDate: asOfDateInput,
      payoffAmount: 0,
      principalOutstandingAmount: 0,
    };
  }

  const allocations = allocateEmiPayments(schedule.payments, repaidAmount);
  const principalPaid = roundCurrencyValue(allocations.reduce((sum, payment) => sum + payment.paidPrincipalValue, 0));
  const principalOutstanding = roundCurrencyValue(Math.max(principal - principalPaid, 0));
  if (principalOutstanding <= payoffTolerance) {
    return {
      accruedInterestAmount: 0,
      asOfDate: asOfDateInput,
      payoffAmount: 0,
      principalOutstandingAmount: 0,
    };
  }

  let lastInterestCoveredIndex = -1;
  for (let index = 0; index < allocations.length; index += 1) {
    const payment = allocations[index];
    if (payment.interestAmount <= payoffTolerance || payment.paidInterestValue + payoffTolerance >= payment.interestAmount) {
      lastInterestCoveredIndex = index;
      continue;
    }
    break;
  }

  const lastCoveredDate = lastInterestCoveredIndex >= 0
    ? parseDateInput(allocations[lastInterestCoveredIndex].dueDateValue) ?? startedAt
    : startedAt;
  const accrualStartDate = lastCoveredDate > asOfDate ? asOfDate : lastCoveredDate;
  const openPeriodInterestCredit = lastCoveredDate > asOfDate ? 0 : allocations[lastInterestCoveredIndex + 1]?.paidInterestValue ?? 0;
  const accruedInterest = payoffInterestAmount(
    principalOutstanding,
    input.interestRate,
    input.interestRatePeriod,
    accrualStartDate,
    asOfDate,
    schedule.payments,
  );
  const accruedInterestDue = roundCurrencyValue(Math.max(accruedInterest - openPeriodInterestCredit, 0));

  return {
    accruedInterestAmount: accruedInterestDue,
    asOfDate: asOfDateInput,
    payoffAmount: roundCurrencyValue(principalOutstanding + accruedInterestDue),
    principalOutstandingAmount: principalOutstanding,
  };
}

export function calculateDebtPayoffSummary(input: CalculateDebtPayoffSummaryInput): DebtPayoffSummary {
  const principal = finitePositiveValue(input.principal);
  const schedule = buildEmiSchedule({
    interestRate: input.interestRate,
    interestRatePeriod: input.interestRatePeriod,
    numberOfMonths: input.numberOfMonths,
    principal,
    repaidAmount: 0,
    startDate: input.startDate,
  });
  const sortedRepayments = [...(input.repayments ?? [])]
    .filter((repayment) => finitePositiveValue(repayment.amountValue) > 0 && parseDateInput(repayment.dateValue))
    .sort(compareDebtRepayments);
  let appliedAmount = roundCurrencyValue(Math.max(input.openingRepaidAmount ?? input.repaidAmount ?? 0, 0));
  const totalDatedRepaymentAmount = roundCurrencyValue(sortedRepayments.reduce((sum, repayment) => sum + finitePositiveValue(repayment.amountValue), 0));
  if (input.settledEarly && appliedAmount + totalDatedRepaymentAmount + payoffTolerance >= principal) {
    const paidAt = input.settledAt || sortedRepayments.at(-1)?.dateValue || "";
    return {
      currentQuote: {
        accruedInterestAmount: 0,
        asOfDate: paidAt || input.referenceDate || formatDateInput(new Date()),
        payoffAmount: 0,
        principalOutstandingAmount: 0,
      },
      isPaidOff: true,
      isEarlyPayoff: true,
      paidAt,
      principalPaid: principal,
      remainingPrincipal: 0,
      settlementAmount: 0,
      settlementInterestAmount: roundCurrencyValue(Math.max(appliedAmount + totalDatedRepaymentAmount - principal, 0)),
      settlementPrincipalAmount: principal,
      totalPaid: roundCurrencyValue(appliedAmount + totalDatedRepaymentAmount),
    };
  }

  for (const repayment of sortedRepayments) {
    const repaymentAmount = roundCurrencyValue(finitePositiveValue(repayment.amountValue));
    const quote = payoffQuoteForRepaidAmount(schedule, input, appliedAmount, repayment.dateValue);
    if (quote.principalOutstandingAmount > payoffTolerance && repaymentAmount + payoffTolerance >= quote.payoffAmount) {
      return {
        currentQuote: {
          accruedInterestAmount: 0,
          asOfDate: quote.asOfDate,
          payoffAmount: 0,
          principalOutstandingAmount: 0,
        },
        isPaidOff: true,
        isEarlyPayoff: true,
        paidAt: quote.asOfDate,
        principalPaid: principal,
        remainingPrincipal: 0,
        settlementAmount: repaymentAmount,
        settlementInterestAmount: quote.accruedInterestAmount,
        settlementPrincipalAmount: quote.principalOutstandingAmount,
        totalPaid: roundCurrencyValue(appliedAmount + repaymentAmount),
      };
    }

    appliedAmount = roundCurrencyValue(appliedAmount + repaymentAmount);
  }

  const allocations = allocateEmiPayments(schedule.payments, appliedAmount);
  const principalPaid = roundCurrencyValue(allocations.reduce((sum, payment) => sum + payment.paidPrincipalValue, 0));
  const remainingPrincipal = roundCurrencyValue(Math.max(principal - principalPaid, 0));
  const referenceDate = input.referenceDate ?? formatDateInput(new Date());
  const currentQuote = payoffQuoteForRepaidAmount(schedule, input, appliedAmount, referenceDate);

  return {
    currentQuote,
    isPaidOff: remainingPrincipal <= payoffTolerance,
    isEarlyPayoff: false,
    paidAt: remainingPrincipal <= payoffTolerance ? sortedRepayments.at(-1)?.dateValue ?? "" : "",
    principalPaid,
    remainingPrincipal: remainingPrincipal <= payoffTolerance ? 0 : remainingPrincipal,
    settlementAmount: 0,
    settlementInterestAmount: 0,
    settlementPrincipalAmount: 0,
    totalPaid: appliedAmount,
  };
}
