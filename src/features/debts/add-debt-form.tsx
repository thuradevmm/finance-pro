"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

import { createDebt, updateDebt } from "@/app/debts/actions";
import { useInteractionLoading } from "@/components/app/interaction-loading-provider";
import { Icon } from "@/components/ui/icon";
import { FieldLabel, FormCard, SelectInput, TextAreaInput, TextInput } from "@/components/ui/form-controls";
import { LoadingButton } from "@/components/ui/loading-state";
import { ProgressCircle } from "@/components/ui/progress-circle";
import { ResponsiveAmount } from "@/components/ui/responsive-amount";
import { useToast } from "@/components/ui/toast-provider";
import { formatMmkPreview } from "@/lib/currency";
import { findAccountByOptionLabel, getAccountOptionDescription, getAccountOptionLabel, getAccountOptionLabels, type AccountRecord } from "@/lib/accounts/supabase";
import { getCategoriesForScope } from "@/lib/categories/category-scopes";
import type { CategoryRecord } from "@/lib/categories/supabase";
import type { DebtFormData, DebtInterestRatePeriod, DebtRecordWithValues } from "@/lib/debts/supabase";
import type { DebtStatus } from "@/types/finance";

function parseAmount(value: string) {
  return Number(value.replace(/[^0-9.-]/g, ""));
}

function formatDateInput(value: Date) {
  if (Number.isNaN(value.getTime())) return "";
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function addMonthsPreservingDay(startDate: string, monthCount: number) {
  const start = new Date(`${startDate}T00:00:00`);
  if (Number.isNaN(start.getTime()) || !Number.isFinite(monthCount) || monthCount <= 0) return "";

  const expectedDay = start.getDate();
  const result = new Date(start);
  result.setMonth(result.getMonth() + monthCount);
  if (result.getDate() !== expectedDay) result.setDate(0);
  return result;
}

function daysBetween(startDate: Date, endDate: Date) {
  return Math.max(Math.round((endDate.getTime() - startDate.getTime()) / 86_400_000), 0);
}

function roundMoney(value: number) {
  return Math.round(value * 100) / 100;
}

function emiInstallment(principal: number, interestRate: number, interestRatePeriod: DebtInterestRatePeriod, numberOfMonths: number) {
  if (!Number.isFinite(principal) || principal <= 0 || numberOfMonths <= 0) return 0;
  const monthlyRate = interestRatePeriod === "Monthly" ? interestRate / 100 : interestRate / 1200;
  if (!Number.isFinite(monthlyRate) || monthlyRate <= 0) return roundMoney(principal / numberOfMonths);

  const payment = principal * (monthlyRate / (1 - (1 + monthlyRate) ** -numberOfMonths));
  return roundMoney(payment);
}

type RepaymentScheduleItem = {
  amount: number;
  date: string;
  timestamp: number;
};

function startOfToday() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return today.getTime();
}

function calculateNextPaymentDate(payments: RepaymentScheduleItem[], repaidAmount: number) {
  if (payments.length === 0) return "";

  let remainingRepaidAmount = Math.max(roundMoney(repaidAmount), 0);
  const firstUnpaidPayment = payments.find((payment) => {
    if (remainingRepaidAmount + 0.005 >= payment.amount) {
      remainingRepaidAmount = roundMoney(remainingRepaidAmount - payment.amount);
      return false;
    }

    return true;
  });

  if (!firstUnpaidPayment) return "";
  const todayTimestamp = startOfToday();
  if (firstUnpaidPayment.timestamp < todayTimestamp) return firstUnpaidPayment.date;

  const currentOrFuturePayment = payments.find((payment) => payment.timestamp >= todayTimestamp && payment.timestamp >= firstUnpaidPayment.timestamp);
  if (currentOrFuturePayment) return currentOrFuturePayment.date;

  return firstUnpaidPayment.date;
}

function calculateRepaymentSchedule(principal: number, repaidAmount: number, interestRate: number, interestRatePeriod: DebtInterestRatePeriod, numberOfMonths: number, startDate: string) {
  const regularInstallment = emiInstallment(principal, interestRate, interestRatePeriod, numberOfMonths);
  const startedAt = new Date(`${startDate}T00:00:00`);
  if (Number.isNaN(startedAt.getTime()) || numberOfMonths <= 0) {
    return {
      firstInterestAmount: 0,
      firstPrincipalAmount: 0,
      monthlyPayment: regularInstallment,
      nextPaymentDate: "",
      payoffDate: "",
      totalInterest: 0,
      totalRepayment: 0,
    };
  }

  const firstDueDate = addMonthsPreservingDay(startDate, 1);
  if (firstDueDate) firstDueDate.setDate(firstDueDate.getDate() - 1);
  const finalDueDate = addMonthsPreservingDay(startDate, numberOfMonths);
  if (finalDueDate) finalDueDate.setDate(finalDueDate.getDate() - 1);
  const calculatedPayoffDate = finalDueDate ? formatDateInput(finalDueDate) : "";

  if (!regularInstallment) {
    const dateOnlyPayments = firstDueDate
      ? Array.from({ length: numberOfMonths }, (_, index) => {
        const dueDate = addMonthsPreservingDay(startDate, index + 1);
        if (!dueDate) return null;
        dueDate.setDate(dueDate.getDate() - 1);
        return {
          amount: 0,
          date: formatDateInput(dueDate),
          timestamp: dueDate.getTime(),
        };
      }).filter((payment): payment is RepaymentScheduleItem => payment != null)
      : [];

    return {
      firstInterestAmount: 0,
      firstPrincipalAmount: 0,
      monthlyPayment: regularInstallment,
      nextPaymentDate: calculateNextPaymentDate(dateOnlyPayments, repaidAmount),
      payoffDate: calculatedPayoffDate,
      totalInterest: 0,
      totalRepayment: 0,
    };
  }

  let balance = principal;
  let previousDate = startedAt;
  let totalInterest = 0;
  let totalPrincipal = 0;
  let firstInterestAmount = 0;
  let firstPrincipalAmount = 0;
  const payments: RepaymentScheduleItem[] = [];
  let payoffDate = "";

  for (let month = 1; month <= numberOfMonths; month += 1) {
    const dueDate = addMonthsPreservingDay(startDate, month);
    if (!dueDate) break;
    dueDate.setDate(dueDate.getDate() - 1);
    payoffDate = formatDateInput(dueDate);

    const rawInterestAmount = interestRatePeriod === "Monthly"
      ? balance * (interestRate / 100)
      : balance * (interestRate / 100) * (daysBetween(previousDate, dueDate) / 365);
    const interestAmount = roundMoney(rawInterestAmount);
    const installmentAmount = month === numberOfMonths ? roundMoney(balance + interestAmount) : regularInstallment;
    const principalAmount = month === numberOfMonths ? balance : roundMoney(installmentAmount - interestAmount);
    payments.push({ amount: installmentAmount, date: payoffDate, timestamp: dueDate.getTime() });

    if (month === 1) {
      firstInterestAmount = interestAmount;
      firstPrincipalAmount = principalAmount;
    }

    balance = roundMoney(balance - principalAmount);
    totalInterest += rawInterestAmount;
    totalPrincipal = roundMoney(totalPrincipal + principalAmount);
    previousDate = dueDate;
  }

  return {
    firstInterestAmount,
    firstPrincipalAmount,
    monthlyPayment: regularInstallment,
    nextPaymentDate: calculateNextPaymentDate(payments, repaidAmount),
    payoffDate,
    totalInterest: roundMoney(totalInterest),
    totalRepayment: roundMoney(totalPrincipal + totalInterest),
  };
}

export function AddDebtForm({ accounts, categories, debt }: { accounts: AccountRecord[]; categories: CategoryRecord[]; debt?: DebtRecordWithValues }) {
  const { showError, showSuccess } = useToast();
  const router = useRouter();
  const beginLoading = useInteractionLoading();
  const [name, setName] = useState(debt?.name ?? "");
  const [lender, setLender] = useState(debt?.lender ?? "");
  const [totalAmount, setTotalAmount] = useState(debt ? String(debt.totalAmountValue) : "");
  const [repaidAmount, setRepaidAmount] = useState(debt ? String(debt.repaidAmountValue) : "");
  const [interestRate, setInterestRate] = useState(debt ? String(debt.interestRateValue) : "");
  const [interestRatePeriod, setInterestRatePeriod] = useState<DebtInterestRatePeriod>(debt?.interestRatePeriod ?? "Yearly");
  const [startDate, setStartDate] = useState(debt?.startDate ?? "2026-06-01");
  const [durationMonths, setDurationMonths] = useState(debt?.durationMonths ? String(debt.durationMonths) : "12");
  const debtCategories = useMemo(() => getCategoriesForScope(categories, "Debts", "Debt"), [categories]);
  const [selectedCategoryId, setSelectedCategoryId] = useState(debt?.categoryId ?? debtCategories[0]?.id ?? "");
  const selectedCategory = debtCategories.find((category) => category.id === selectedCategoryId) ?? debtCategories[0];
  const debtCategoryOptions = debtCategories.length > 0 ? debtCategories.map((category) => category.name) : ["Uncategorized Debt"];
  const [status, setStatus] = useState<DebtStatus>(debt?.status ?? "Active");
  const activeAccounts = useMemo(() => accounts.filter((account) => account.status === "Active"), [accounts]);
  const [paymentAccountId, setPaymentAccountId] = useState(debt?.paymentAccountId ?? activeAccounts[0]?.id ?? "");
  const selectedPaymentAccount = activeAccounts.find((account) => account.id === paymentAccountId);
  const [notes, setNotes] = useState(debt?.notes ?? "");
  const [showErrors, setShowErrors] = useState(false);
  const [formError, setFormError] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const nameHasError = showErrors && name.trim() === "";
  const lenderHasError = showErrors && lender.trim() === "";
  const totalHasError = showErrors && totalAmount.trim() === "";
  const durationValue = Number(durationMonths);
  const normalizedDurationMonths = Number.isFinite(durationValue) ? Math.trunc(durationValue) : 0;
  const durationHasError = showErrors && (durationMonths.trim() === "" || normalizedDurationMonths <= 0);
  const categoryHasError = showErrors && debtCategories.length > 0 && !selectedCategory;
  const total = parseAmount(totalAmount);
  const repaid = parseAmount(repaidAmount);
  const parsedInterestRateValue = interestRate.trim() ? Number(interestRate) : 0;
  const parsedInterestRate = Number.isFinite(parsedInterestRateValue) ? parsedInterestRateValue : 0;
  const progressPercent = total > 0 ? Math.round((repaid / total) * 100) : 0;
  const remaining = Math.max(total - repaid, 0);
  const repaymentSchedule = calculateRepaymentSchedule(total, repaid, parsedInterestRate, interestRatePeriod, normalizedDurationMonths, startDate);
  const nextPaymentDate = repaymentSchedule.nextPaymentDate;
  const payoffDate = repaymentSchedule.payoffDate;
  const monthlyPaymentValue = repaymentSchedule.monthlyPayment;
  const totalRepaymentValue = repaymentSchedule.totalRepayment;
  const totalInterestValue = repaymentSchedule.totalInterest;

  async function handleSaveDebt(addAnother = false) {
    const hasErrors = name.trim() === "" || lender.trim() === "" || totalAmount.trim() === "" || durationMonths.trim() === "" || normalizedDurationMonths <= 0 || (debtCategories.length > 0 && !selectedCategory);
    setShowErrors(hasErrors);
    setFormError("");
    if (hasErrors) return;
    const input: DebtFormData = {
      categoryId: selectedCategory?.id ?? "",
      durationMonths: normalizedDurationMonths,
      interestRate: parsedInterestRate,
      interestRatePeriod,
      lender,
      monthlyPayment: monthlyPaymentValue,
      name,
      nextPaymentDate,
      notes,
      paymentAccountId,
      payoffDate,
      repaidAmount: repaidAmount.trim() ? Number(repaidAmount) : 0,
      startDate,
      status,
      totalAmount: Number(totalAmount),
      type: selectedCategory?.name ?? debt?.type ?? "Debt",
    };
    setIsSaving(true);
    const result = debt ? await updateDebt(debt.id, input) : await createDebt(input);
    if (result.error) {
      setIsSaving(false);
      setFormError(result.error);
      showError(result.error);
      return;
    }
    if (addAnother && !debt) {
      setIsSaving(false);
      setName("");
      setLender("");
      setTotalAmount("");
      setRepaidAmount("");
      setDurationMonths("12");
      setNotes("");
      showSuccess("Debt saved successfully.");
      return;
    }
    showSuccess(debt ? "Debt updated successfully." : "Debt saved successfully.");
    beginLoading();
    router.push("/debts");
    router.refresh();
  }

  return (
    <div className="grid min-w-0 grid-cols-1 gap-6 xl:grid-cols-12">
      <div className="min-w-0 space-y-6 xl:col-span-8">
        <FormCard title="Debt Details">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div>
              <TextInput error={nameHasError} label="Debt Name" onChange={setName} placeholder="Mortgage" value={name} />
              {nameHasError ? <p className="mt-1 text-xs font-medium text-[#ba1a1a]">Debt name is required.</p> : null}
            </div>
            <div>
              <TextInput error={lenderHasError} label="Lender" onChange={setLender} placeholder="Chase Bank" value={lender} />
              {lenderHasError ? <p className="mt-1 text-xs font-medium text-[#ba1a1a]">Lender is required.</p> : null}
            </div>
          </div>

          <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-2">
            <div>
              <TextInput error={totalHasError} label="Total Amount" onChange={setTotalAmount} placeholder="350000" type="number" value={totalAmount} />
              {totalHasError ? <p className="mt-1 text-xs font-medium text-[#ba1a1a]">Total amount is required.</p> : null}
            </div>
            <TextInput label="Repaid Amount" onChange={setRepaidAmount} placeholder="0" type="number" value={repaidAmount} />
          </div>

          <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="rounded-lg border border-[#c6c6cd]/60 bg-[#f8f9ff] px-4 py-3">
              <span className="block text-xs font-bold uppercase text-[#45464d]">Calculated Monthly Payment</span>
              <ResponsiveAmount className="mt-1 font-semibold text-[#0b1c30]" maxSizeRem={1.125}>{formatMmkPreview(monthlyPaymentValue)}</ResponsiveAmount>
              <span className="mt-1 block text-xs font-semibold text-[#45464d]">{normalizedDurationMonths > 0 ? `${normalizedDurationMonths} months` : "Set a valid duration"}</span>
            </div>
            <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-[minmax(0,1fr)_8rem]">
              <TextInput label="Interest Rate" onChange={setInterestRate} placeholder="5.85" type="number" value={interestRate} />
              <SelectInput label="Rate Type" onChange={(value) => setInterestRatePeriod(value as DebtInterestRatePeriod)} options={["Yearly", "Monthly"]} value={interestRatePeriod} />
            </div>
          </div>

          <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-2">
            <TextInput label="Start Date" onChange={setStartDate} placeholder="2026-06-01" type="date" value={startDate} />
            <div>
              <TextInput error={durationHasError} label="Duration (Months)" onChange={setDurationMonths} placeholder="24" type="number" value={durationMonths} />
              {durationHasError ? <p className="mt-1 text-xs font-medium text-[#ba1a1a]">Duration must be greater than 0 months.</p> : null}
            </div>
          </div>

          <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-2">
            <div>
              <FieldLabel>Next Payment Date</FieldLabel>
              <input
                className="h-12 w-full rounded-lg border border-[#c6c6cd] bg-[#f8f9ff] px-4 text-sm font-medium text-[#0b1c30] outline-none"
                readOnly
                type="date"
                value={nextPaymentDate}
              />
            </div>
            <div className="rounded-lg border border-[#c6c6cd]/60 bg-[#f8f9ff] px-4 py-3">
              <span className="block text-xs font-bold uppercase text-[#45464d]">Payoff Date</span>
              <span className="mt-1 block text-sm font-semibold text-[#0b1c30]">{payoffDate || "Set start date and duration"}</span>
            </div>
          </div>
        </FormCard>

        <FormCard title="Repayment Settings">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <SelectInput label="Status" onChange={(value) => setStatus(value as DebtStatus)} options={["Active", "Overdue", "Paid"]} value={status} />
            <div>
              <SelectInput label="Debt Category" onChange={(name) => setSelectedCategoryId(debtCategories.find((category) => category.name === name)?.id ?? "")} options={debtCategoryOptions} value={selectedCategory?.name ?? "Uncategorized Debt"} />
              {categoryHasError ? <p className="mt-1 text-xs font-medium text-[#ba1a1a]">Debt category is required.</p> : null}
            </div>
          </div>
          <div className="mt-5">
            <SelectInput label="Payment Account" onChange={(name) => setPaymentAccountId(findAccountByOptionLabel(activeAccounts, name)?.id ?? "")} options={activeAccounts.length > 0 ? getAccountOptionLabels(activeAccounts) : ["No accounts"]} value={selectedPaymentAccount ? getAccountOptionLabel(selectedPaymentAccount, activeAccounts) : "No accounts"} />
            {selectedPaymentAccount ? <p className="mt-2 text-xs font-semibold text-[#76777d]">{getAccountOptionDescription(selectedPaymentAccount)}</p> : null}
          </div>
          <div className="mt-5">
            <TextAreaInput label="Notes" onChange={setNotes} placeholder="Optional repayment notes..." value={notes} />
          </div>
        </FormCard>

        <div className="space-y-3 pt-2">
          {formError ? <div className="w-full rounded-md border border-[#fecaca] bg-[#fff1f0] px-4 py-2 text-sm font-medium leading-5 text-[#991b1b]" role="alert">{formError}</div> : null}
          <div className="flex flex-col-reverse items-stretch justify-end gap-3 sm:flex-row sm:items-center">
            <Link
              className="inline-flex min-h-11 shrink-0 items-center justify-center whitespace-nowrap rounded-md px-4 text-sm font-semibold text-[#45464d] transition hover:bg-[#eff4ff]"
              href="/debts"
            >
              Cancel
            </Link>
            <button
              className="inline-flex min-h-11 shrink-0 items-center justify-center whitespace-nowrap rounded-md border border-[#c6c6cd]/70 bg-[#eff4ff] px-4 text-sm font-semibold text-[#0058be] transition hover:bg-[#dce9ff]"
              disabled={isSaving || Boolean(debt)}
              onClick={() => handleSaveDebt(true)}
              type="button"
            >
              Save & Add Another
            </button>
            <LoadingButton
              className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-md bg-[#0b1c30] px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-[#1f2937]"
              isLoading={isSaving}
              loadingLabel="Saving…"
              onClick={() => handleSaveDebt(false)}
              type="button"
            >
              Save Debt
            </LoadingButton>
          </div>
        </div>
      </div>

      <aside className="hidden min-w-0 xl:col-span-4 xl:block">
        <div className="sticky top-24 rounded-lg border border-[#c6c6cd]/60 bg-[#eff4ff] p-6 shadow-[0_4px_20px_rgba(15,23,42,0.04)]">
          <div className="rounded-lg border border-[#c6c6cd]/60 bg-white p-5">
            <div className="mb-5 flex items-center gap-3 border-b border-[#c6c6cd]/40 pb-4">
              <span className={`grid size-11 place-items-center rounded-lg ${selectedCategory?.bg ?? "bg-[#fffbeb]"} ${selectedCategory?.tone ?? "text-[#92400e]"}`}>
                <Icon name={selectedCategory?.icon ?? "credit"} />
              </span>
              <div>
                <p className="text-xs font-bold uppercase text-[#45464d]">Debt Preview</p>
                <h3 className="text-xl font-semibold text-[#0b1c30]">{name || selectedCategory?.name || "New Debt"}</h3>
              </div>
            </div>

            <ProgressCircle percent={progressPercent} tone={selectedCategory?.tone ?? "text-[#92400e]"} />

            <dl className="mt-5 grid grid-cols-2 gap-3 text-center">
              <div>
                <dt className="mb-1 text-xs font-bold uppercase text-[#45464d]">Repaid</dt>
                <dd><ResponsiveAmount className="font-semibold text-[#047857]" maxSizeRem={1.125}>{repaidAmount ? formatMmkPreview(repaidAmount) : formatMmkPreview(0)}</ResponsiveAmount></dd>
              </div>
              <div>
                <dt className="mb-1 text-xs font-bold uppercase text-[#45464d]">Remaining</dt>
                <dd><ResponsiveAmount className="font-semibold text-[#0b1c30]" maxSizeRem={1.125}>{formatMmkPreview(remaining)}</ResponsiveAmount></dd>
              </div>
            </dl>

            <div className="mt-5 rounded-lg border border-[#c6c6cd]/40 bg-[#f8f9ff] p-4">
              <div className="flex items-center justify-between gap-4">
                <span className="text-xs font-bold uppercase text-[#45464d]">Monthly Payment</span>
                <ResponsiveAmount className="text-right font-semibold text-[#0b1c30]" maxSizeRem={0.875}>{formatMmkPreview(monthlyPaymentValue)}</ResponsiveAmount>
              </div>
              <div className="mt-4 flex items-center justify-between gap-4">
                <span className="text-xs font-bold uppercase text-[#45464d]">Start</span>
                <span className="text-sm font-semibold text-[#0b1c30]">{startDate || "Not set"}</span>
              </div>
              <div className="mt-4 flex items-center justify-between gap-4">
                <span className="text-xs font-bold uppercase text-[#45464d]">Interest</span>
                <span className="text-sm font-semibold text-[#0b1c30]">{interestRate || "0"}% {interestRatePeriod.toLowerCase()}</span>
              </div>
              <div className="mt-4 flex items-center justify-between gap-4">
                <span className="text-xs font-bold uppercase text-[#45464d]">First Principal</span>
                <ResponsiveAmount className="text-right font-semibold text-[#0b1c30]" maxSizeRem={0.875}>{formatMmkPreview(repaymentSchedule.firstPrincipalAmount)}</ResponsiveAmount>
              </div>
              <div className="mt-4 flex items-center justify-between gap-4">
                <span className="text-xs font-bold uppercase text-[#45464d]">First Interest</span>
                <ResponsiveAmount className="text-right font-semibold text-[#0b1c30]" maxSizeRem={0.875}>{formatMmkPreview(repaymentSchedule.firstInterestAmount)}</ResponsiveAmount>
              </div>
              <div className="mt-4 flex items-center justify-between gap-4">
                <span className="text-xs font-bold uppercase text-[#45464d]">Total Interest</span>
                <ResponsiveAmount className="text-right font-semibold text-[#0b1c30]" maxSizeRem={0.875}>{formatMmkPreview(totalInterestValue)}</ResponsiveAmount>
              </div>
              <div className="mt-4 flex items-center justify-between gap-4">
                <span className="text-xs font-bold uppercase text-[#45464d]">Total Repayment</span>
                <ResponsiveAmount className="text-right font-semibold text-[#0b1c30]" maxSizeRem={0.875}>{formatMmkPreview(totalRepaymentValue)}</ResponsiveAmount>
              </div>
              <div className="mt-4 flex items-center justify-between gap-4">
                <span className="text-xs font-bold uppercase text-[#45464d]">Payoff</span>
                <span className="text-sm font-semibold text-[#0b1c30]">{payoffDate || "Not set"}</span>
              </div>
              <div className="mt-4 flex items-center justify-between gap-4">
                <span className="text-xs font-bold uppercase text-[#45464d]">Category</span>
                <span className="max-w-36 truncate text-sm font-semibold text-[#0b1c30]">{selectedCategory?.name ?? "No category"}</span>
              </div>
              <div className="mt-4 flex items-center justify-between gap-4">
                <span className="text-xs font-bold uppercase text-[#45464d]">Status</span>
                <span className="text-sm font-semibold text-[#0b1c30]">{status}</span>
              </div>
              <div className="mt-4 flex items-center justify-between gap-4">
                <span className="text-xs font-bold uppercase text-[#45464d]">Account</span>
                <span className="max-w-36 truncate text-sm font-semibold text-[#0b1c30]">{selectedPaymentAccount ? getAccountOptionLabel(selectedPaymentAccount, activeAccounts) : "No account"}</span>
              </div>
            </div>
            <p className="mt-5 rounded-lg border border-[#c6c6cd]/40 bg-white p-4 text-sm font-medium text-[#45464d]">
              {notes || "Repayment notes will appear here."}
            </p>
          </div>
        </div>
      </aside>
    </div>
  );
}
