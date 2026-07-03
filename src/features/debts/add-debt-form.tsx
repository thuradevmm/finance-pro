"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

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
import { findAccountByOptionLabel, getAccountOptionDescription, getAccountOptionLabel, getAccountOptionLabels, type AccountRecord } from "@/lib/accounts/supabase";
import { getCategoriesForScope } from "@/lib/categories/category-scopes";
import type { CategoryRecord } from "@/lib/categories/supabase";
import { buildEmiSchedule } from "@/lib/debts/emi";
import type { DebtFormData, DebtInterestRatePeriod, DebtRecordWithValues } from "@/lib/debts/supabase";
import type { DebtStatus } from "@/types/finance";

function parseAmount(value: string) {
  return Number(value.replace(/[^0-9.-]/g, ""));
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
  const repaymentSchedule = buildEmiSchedule({
    interestRate: parsedInterestRate,
    interestRatePeriod,
    numberOfMonths: normalizedDurationMonths,
    principal: total,
    repaidAmount: repaid,
    startDate,
  });
  const progressPercent = total > 0 ? Math.min(Math.round((repaymentSchedule.principalPaid / total) * 100), 100) : 0;
  const remaining = repaymentSchedule.remainingPrincipal;
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
              <DateInput label="Next Payment Date" readOnly showIcon={false} tone="muted" value={nextPaymentDate} />
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
