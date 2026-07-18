"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useId, useMemo, useState } from "react";

import { createDebt, updateDebt } from "@/app/debts/actions";
import { useInteractionLoading } from "@/components/app/interaction-loading-provider";
import { DateInput } from "@/components/ui/date-input";
import { Icon } from "@/components/ui/icon";
import { FieldLabel, FormCard, SelectInput, TextAreaInput, TextInput } from "@/components/ui/form-controls";
import { LoadingButton } from "@/components/ui/loading-state";
import { ProgressCircle } from "@/components/ui/progress-circle";
import { ResponsiveAmount } from "@/components/ui/responsive-amount";
import { useToast } from "@/components/ui/toast-provider";
import { formatMmkPreview } from "@/lib/currency";
import { accountStatusContributesToCurrentTotals } from "@/lib/accounts/financial-status";
import { nextCreditCardPaymentDate } from "@/lib/accounts/credit-card-dates";
import { findAccountByOptionLabel, getAccountOptionDescription, getAccountOptionLabel, getAccountOptionLabels, type AccountRecord } from "@/lib/accounts/supabase";
import { getCategoriesForScope } from "@/lib/categories/category-scopes";
import type { CategoryRecord } from "@/lib/categories/supabase";
import { buildEmiSchedule } from "@/lib/debts/emi";
import type { DebtFormData, DebtInterestRatePeriod, DebtRecordWithValues } from "@/lib/debts/supabase";
import { isCreditCardDebtType } from "@/lib/debts/validation";
import type { DebtStatus } from "@/types/finance";

function parseAmount(value: string) {
  return Number(value.replace(/[^0-9.-]/g, ""));
}

export function AddDebtForm({ accounts, categories, debt }: { accounts: AccountRecord[]; categories: CategoryRecord[]; debt?: DebtRecordWithValues }) {
  const { showError, showSuccess } = useToast();
  const router = useRouter();
  const beginLoading = useInteractionLoading();
  const nextPaymentDateInputId = useId();
  const [name, setName] = useState(debt?.name ?? "");
  const [lender, setLender] = useState(debt?.lender ?? "");
  const [totalAmount, setTotalAmount] = useState(debt ? String(debt.totalAmountValue) : "");
  const [repaidAmount, setRepaidAmount] = useState(debt ? String(debt.grossRepaidAmountValue) : "");
  const [interestRate, setInterestRate] = useState(debt ? String(debt.interestRateValue) : "");
  const [interestRatePeriod, setInterestRatePeriod] = useState<DebtInterestRatePeriod>(debt?.interestRatePeriod ?? "Yearly");
  const [startDate, setStartDate] = useState(debt?.startDate ?? "2026-06-01");
  const [durationMonths, setDurationMonths] = useState(debt?.durationMonths ? String(debt.durationMonths) : "12");
  const debtCategories = useMemo(() => getCategoriesForScope(categories, "Debts", "Debt"), [categories]);
  const [selectedCategoryId, setSelectedCategoryId] = useState(debt?.categoryId ?? (!debt ? debtCategories[0]?.id ?? "" : ""));
  const selectedCategory = debtCategories.find((category) => category.id === selectedCategoryId)
    ?? (!debt ? debtCategories[0] : undefined);
  const debtCategoryOptions = debt && !selectedCategory
    ? ["Uncategorized Debt", ...debtCategories.map((category) => category.name)]
    : debtCategories.length > 0 ? debtCategories.map((category) => category.name) : ["Uncategorized Debt"];
  const [status, setStatus] = useState<DebtStatus>(debt?.status ?? "Active");
  const availableAccounts = useMemo(() => accounts.filter((account) => (
    accountStatusContributesToCurrentTotals(account.status) || account.id === debt?.paymentAccountId
  )), [accounts, debt?.paymentAccountId]);
  const semanticIsCreditCard = debt?.isCreditCardDebt ?? isCreditCardDebtType(selectedCategory?.name);
  const paymentAccounts = semanticIsCreditCard
    ? availableAccounts.filter((account) => account.type === "Credit Card")
    : availableAccounts;
  const [paymentAccountId, setPaymentAccountId] = useState(debt?.paymentAccountId ?? paymentAccounts[0]?.id ?? "");
  const selectedPaymentAccount = paymentAccounts.find((account) => account.id === paymentAccountId);
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
  const categoryHasError = showErrors && !debt && !selectedCategory;
  const total = parseAmount(totalAmount);
  const repaid = parseAmount(repaidAmount);
  const paymentAccountHasError = showErrors && semanticIsCreditCard && !selectedPaymentAccount;
  const parsedInterestRateValue = interestRate.trim() ? Number(interestRate) : 0;
  const parsedInterestRate = Number.isFinite(parsedInterestRateValue) ? parsedInterestRateValue : 0;
  const repaymentSchedule = buildEmiSchedule({
    interestRate: parsedInterestRate,
    interestRatePeriod,
    numberOfMonths: normalizedDurationMonths,
    principal: total,
    repaidAmount: repaid,
    startDate,
  });
  const creditCardRemaining = Math.max(total - repaid, 0);
  const creditCardAppliedRepayment = Math.min(Math.max(repaid, 0), Math.max(total, 0));
  const creditCardDueDate = creditCardRemaining > 0 && selectedPaymentAccount
    ? nextCreditCardPaymentDate({
      paymentDueDay: selectedPaymentAccount.creditPaymentDueDay,
      referenceDate: startDate,
      statementDay: selectedPaymentAccount.creditStatementDay,
    })
    : "";
  const creditCardMinimumPayment = creditCardRemaining > 0
    ? Math.min(selectedPaymentAccount?.creditMinimumPaymentValue || creditCardRemaining, creditCardRemaining)
    : 0;
  const progressBasis = semanticIsCreditCard ? creditCardAppliedRepayment : repaymentSchedule.principalPaid;
  const progressPercent = total > 0 ? Math.min(Math.round((progressBasis / total) * 100), 100) : 0;
  const remaining = semanticIsCreditCard ? creditCardRemaining : repaymentSchedule.remainingPrincipal;
  const nextPaymentDate = semanticIsCreditCard ? creditCardDueDate : repaymentSchedule.nextPaymentDate;
  const payoffDate = semanticIsCreditCard ? creditCardDueDate : repaymentSchedule.payoffDate;
  const monthlyPaymentValue = semanticIsCreditCard ? creditCardMinimumPayment : repaymentSchedule.monthlyPayment;
  const totalRepaymentValue = semanticIsCreditCard ? total : repaymentSchedule.totalRepayment;
  const totalInterestValue = semanticIsCreditCard ? 0 : repaymentSchedule.totalInterest;

  async function handleSaveDebt(addAnother = false) {
    const hasErrors = name.trim() === "" || lender.trim() === "" || !Number.isFinite(total) || total <= 0 || !Number.isFinite(repaid) || repaid < 0 || parsedInterestRate < 0 || durationMonths.trim() === "" || normalizedDurationMonths <= 0 || (!debt && !selectedCategory) || (semanticIsCreditCard && !selectedPaymentAccount);
    setShowErrors(hasErrors);
    setFormError("");
    if (hasErrors) return;
    const input: DebtFormData = {
      categoryId: selectedCategory?.id ?? "",
      durationMonths: normalizedDurationMonths,
      interestRate: parsedInterestRate,
      interestRatePeriod,
      isCreditCardDebt: semanticIsCreditCard,
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
      type: semanticIsCreditCard ? "Credit Card" : debt?.type ?? selectedCategory?.name ?? "Debt",
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
            <TextInput label={semanticIsCreditCard ? "Payments / Credits" : "Payments Made (Including Interest)"} onChange={setRepaidAmount} placeholder="0" type="number" value={repaidAmount} />
          </div>

          <div className={`mt-5 grid grid-cols-1 gap-4 ${semanticIsCreditCard ? "" : "md:grid-cols-2"}`}>
            <div className="rounded-lg border border-[#c6c6cd]/60 bg-[#f8f9ff] px-4 py-3">
              <span className="block text-xs font-bold uppercase text-[#45464d]">{semanticIsCreditCard ? "Configured Minimum Payment" : "Calculated Monthly Payment"}</span>
              <ResponsiveAmount className="mt-1 font-semibold text-[#0b1c30]" maxSizeRem={1.125}>{formatMmkPreview(monthlyPaymentValue)}</ResponsiveAmount>
              <span className="mt-1 block text-xs font-semibold text-[#45464d]">{semanticIsCreditCard ? "From the linked card account" : normalizedDurationMonths > 0 ? `${normalizedDurationMonths} months` : "Set a valid duration"}</span>
            </div>
            {!semanticIsCreditCard ? <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-[minmax(0,1fr)_8rem]">
              <TextInput label="Interest Rate" onChange={setInterestRate} placeholder="5.85" type="number" value={interestRate} />
              <SelectInput label="Rate Type" onChange={(value) => setInterestRatePeriod(value as DebtInterestRatePeriod)} options={["Yearly", "Monthly"]} value={interestRatePeriod} />
            </div> : null}
          </div>

          <div className={`mt-5 grid grid-cols-1 gap-4 ${semanticIsCreditCard ? "" : "md:grid-cols-2"}`}>
            <TextInput label="Start Date" onChange={setStartDate} placeholder="2026-06-01" type="date" value={startDate} />
            {!semanticIsCreditCard ? <div>
              <TextInput error={durationHasError} label="Duration (Months)" onChange={setDurationMonths} placeholder="24" type="number" value={durationMonths} />
              {durationHasError ? <p className="mt-1 text-xs font-medium text-[#ba1a1a]">Duration must be greater than 0 months.</p> : null}
            </div> : null}
          </div>

          <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-2">
            <div>
              <FieldLabel htmlFor={nextPaymentDateInputId}>Next Payment Date</FieldLabel>
              <DateInput id={nextPaymentDateInputId} label="Next Payment Date" readOnly showIcon={false} tone="muted" value={nextPaymentDate} />
            </div>
            <div className="rounded-lg border border-[#c6c6cd]/60 bg-[#f8f9ff] px-4 py-3">
              <span className="block text-xs font-bold uppercase text-[#45464d]">{semanticIsCreditCard ? "Payment Due Date" : "Payoff Date"}</span>
              <span className="mt-1 block text-sm font-semibold text-[#0b1c30]">{payoffDate || (semanticIsCreditCard ? "Configure statement and due days on the card account" : "Set start date and duration")}</span>
            </div>
          </div>
        </FormCard>

        <FormCard title="Repayment Settings">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <SelectInput label="Status" onChange={(value) => setStatus(value as DebtStatus)} options={["Active", "Overdue", "Paid"]} value={status} />
            <div>
              <SelectInput label="Debt Category" onChange={(name) => {
                const nextCategory = debtCategories.find((category) => category.name === name);
                setSelectedCategoryId(nextCategory?.id ?? "");
                if (isCreditCardDebtType(nextCategory?.name) && accounts.find((account) => account.id === paymentAccountId)?.type !== "Credit Card") {
                  setPaymentAccountId(availableAccounts.find((account) => account.type === "Credit Card")?.id ?? "");
                }
              }} options={debtCategoryOptions} value={selectedCategory?.name ?? "Uncategorized Debt"} />
              {categoryHasError ? <p className="mt-1 text-xs font-medium text-[#ba1a1a]">Debt category is required.</p> : null}
            </div>
          </div>
          <div className="mt-5">
            <div>
              <SelectInput label="Payment Account" onChange={(name) => setPaymentAccountId(findAccountByOptionLabel(paymentAccounts, name)?.id ?? "")} options={paymentAccounts.length > 0 ? getAccountOptionLabels(paymentAccounts) : ["No accounts"]} value={selectedPaymentAccount ? getAccountOptionLabel(selectedPaymentAccount, paymentAccounts) : "No accounts"} />
              {paymentAccountHasError ? <p className="mt-1 text-xs font-medium text-[#ba1a1a]">Select a credit card account for this credit card debt.</p> : null}
            </div>
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
                <dt className="mb-1 text-xs font-bold uppercase text-[#45464d]">{semanticIsCreditCard ? "Applied Payment" : "Principal Repaid"}</dt>
                <dd><ResponsiveAmount className="font-semibold text-[#047857]" maxSizeRem={1.125}>{formatMmkPreview(progressBasis)}</ResponsiveAmount></dd>
              </div>
              <div>
                <dt className="mb-1 text-xs font-bold uppercase text-[#45464d]">Remaining</dt>
                <dd><ResponsiveAmount className="font-semibold text-[#0b1c30]" maxSizeRem={1.125}>{formatMmkPreview(remaining)}</ResponsiveAmount></dd>
              </div>
            </dl>

            <div className="mt-5 rounded-lg border border-[#c6c6cd]/40 bg-[#f8f9ff] p-4">
              <div className="flex items-center justify-between gap-4">
                <span className="text-xs font-bold uppercase text-[#45464d]">{semanticIsCreditCard ? "Minimum Payment" : "Monthly Payment"}</span>
                <ResponsiveAmount className="text-right font-semibold text-[#0b1c30]" maxSizeRem={0.875}>{formatMmkPreview(monthlyPaymentValue)}</ResponsiveAmount>
              </div>
              <div className="mt-4 flex items-center justify-between gap-4">
                <span className="text-xs font-bold uppercase text-[#45464d]">Start</span>
                <span className="text-sm font-semibold text-[#0b1c30]">{startDate || "Not set"}</span>
              </div>
              {!semanticIsCreditCard ? <div className="mt-4 flex items-center justify-between gap-4">
                <span className="text-xs font-bold uppercase text-[#45464d]">Interest</span>
                <span className="text-sm font-semibold text-[#0b1c30]">{interestRate || "0"}% {interestRatePeriod.toLowerCase()}</span>
              </div> : null}
              {!semanticIsCreditCard ? <div className="mt-4 flex items-center justify-between gap-4">
                <span className="text-xs font-bold uppercase text-[#45464d]">First Principal</span>
                <ResponsiveAmount className="text-right font-semibold text-[#0b1c30]" maxSizeRem={0.875}>{formatMmkPreview(repaymentSchedule.firstPrincipalAmount)}</ResponsiveAmount>
              </div> : null}
              {!semanticIsCreditCard ? <div className="mt-4 flex items-center justify-between gap-4">
                <span className="text-xs font-bold uppercase text-[#45464d]">First Interest</span>
                <ResponsiveAmount className="text-right font-semibold text-[#0b1c30]" maxSizeRem={0.875}>{formatMmkPreview(repaymentSchedule.firstInterestAmount)}</ResponsiveAmount>
              </div> : null}
              {!semanticIsCreditCard ? <div className="mt-4 flex items-center justify-between gap-4">
                <span className="text-xs font-bold uppercase text-[#45464d]">Total Interest</span>
                <ResponsiveAmount className="text-right font-semibold text-[#0b1c30]" maxSizeRem={0.875}>{formatMmkPreview(totalInterestValue)}</ResponsiveAmount>
              </div> : null}
              {!semanticIsCreditCard ? <div className="mt-4 flex items-center justify-between gap-4">
                <span className="text-xs font-bold uppercase text-[#45464d]">Total Repayment</span>
                <ResponsiveAmount className="text-right font-semibold text-[#0b1c30]" maxSizeRem={0.875}>{formatMmkPreview(totalRepaymentValue)}</ResponsiveAmount>
              </div> : null}
              <div className="mt-4 flex items-center justify-between gap-4">
                <span className="text-xs font-bold uppercase text-[#45464d]">{semanticIsCreditCard ? "Payment Due" : "Payoff"}</span>
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
                <span className="max-w-36 truncate text-sm font-semibold text-[#0b1c30]">{selectedPaymentAccount ? getAccountOptionLabel(selectedPaymentAccount, paymentAccounts) : "No account"}</span>
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
