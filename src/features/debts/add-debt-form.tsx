"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

import { createDebt, updateDebt } from "@/app/debts/actions";
import { useInteractionLoading } from "@/components/app/interaction-loading-provider";
import { Icon, type IconName } from "@/components/ui/icon";
import { FormCard, SelectInput, TextAreaInput, TextInput } from "@/components/ui/form-controls";
import { LoadingButton } from "@/components/ui/loading-state";
import { ProgressCircle } from "@/components/ui/progress-circle";
import { ResponsiveAmount } from "@/components/ui/responsive-amount";
import type { AccountRecord } from "@/lib/accounts/supabase";
import { getCategoriesForScope } from "@/lib/categories/category-scopes";
import type { CategoryRecord } from "@/lib/categories/supabase";
import type { DebtFormData, DebtRecordWithValues } from "@/lib/debts/supabase";
import type { DebtStatus } from "@/types/finance";

const debtTypes: { label: string; icon: IconName; bg: string; tone: string }[] = [
  { label: "Mortgage", icon: "home", bg: "bg-[#eff6ff]", tone: "text-[#0058be]" },
  { label: "Student Loan", icon: "document", bg: "bg-[#fff1f0]", tone: "text-[#b42318]" },
  { label: "Car Loan", icon: "credit", bg: "bg-[#ecfdf5]", tone: "text-[#047857]" },
  { label: "Personal Loan", icon: "account", bg: "bg-[#eef2ff]", tone: "text-[#4f46e5]" },
];

function parseAmount(value: string) {
  return Number(value.replace(/[^0-9.-]/g, ""));
}

export function AddDebtForm({ accounts, categories, debt }: { accounts: AccountRecord[]; categories: CategoryRecord[]; debt?: DebtRecordWithValues }) {
  const router = useRouter();
  const beginLoading = useInteractionLoading();
  const [selectedType, setSelectedType] = useState(debtTypes.find((type) => type.label === debt?.type) ?? debtTypes[0]);
  const [name, setName] = useState(debt?.name ?? "");
  const [lender, setLender] = useState(debt?.lender ?? "");
  const [totalAmount, setTotalAmount] = useState(debt ? String(debt.totalAmountValue) : "");
  const [repaidAmount, setRepaidAmount] = useState(debt ? String(debt.repaidAmountValue) : "");
  const [monthlyPayment, setMonthlyPayment] = useState(debt ? String(debt.monthlyPaymentValue) : "");
  const [interestRate, setInterestRate] = useState(debt ? String(debt.interestRateValue) : "");
  const [startDate, setStartDate] = useState(debt?.startDate ?? "2026-06-01");
  const [nextPaymentDate, setNextPaymentDate] = useState(debt?.nextPaymentDateValue ?? "2026-11-15");
  const debtCategories = useMemo(() => getCategoriesForScope(categories, "Debts"), [categories]);
  const [selectedCategoryId, setSelectedCategoryId] = useState(debt?.categoryId ?? debtCategories[0]?.id ?? "");
  const [status, setStatus] = useState<DebtStatus>(debt?.status ?? "Active");
  const activeAccounts = useMemo(() => accounts.filter((account) => account.status === "Active"), [accounts]);
  const [paymentAccountId, setPaymentAccountId] = useState(debt?.paymentAccountId ?? activeAccounts[0]?.id ?? "");
  const [notes, setNotes] = useState(debt?.notes ?? "");
  const [showErrors, setShowErrors] = useState(false);
  const [formError, setFormError] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const nameHasError = showErrors && name.trim() === "";
  const lenderHasError = showErrors && lender.trim() === "";
  const totalHasError = showErrors && totalAmount.trim() === "";
  const paymentHasError = showErrors && monthlyPayment.trim() === "";
  const total = parseAmount(totalAmount);
  const repaid = parseAmount(repaidAmount);
  const progressPercent = total > 0 ? Math.round((repaid / total) * 100) : 0;
  const remaining = Math.max(total - repaid, 0);

  async function handleSaveDebt(addAnother = false) {
    const hasErrors = name.trim() === "" || lender.trim() === "" || totalAmount.trim() === "" || monthlyPayment.trim() === "";
    setShowErrors(hasErrors);
    setFormError("");
    if (hasErrors) return;
    const input: DebtFormData = {
      categoryId: selectedCategoryId,
      interestRate: interestRate.trim() ? Number(interestRate) : 0,
      lender,
      monthlyPayment: Number(monthlyPayment),
      name,
      nextPaymentDate,
      notes,
      paymentAccountId,
      repaidAmount: repaidAmount.trim() ? Number(repaidAmount) : 0,
      startDate,
      status,
      totalAmount: Number(totalAmount),
      type: selectedType.label,
    };
    setIsSaving(true);
    const result = debt ? await updateDebt(debt.id, input) : await createDebt(input);
    if (result.error) {
      setIsSaving(false);
      setFormError(result.error);
      return;
    }
    if (addAnother && !debt) {
      setIsSaving(false);
      setName("");
      setLender("");
      setTotalAmount("");
      setRepaidAmount("");
      setMonthlyPayment("");
      setNotes("");
      return;
    }
    beginLoading();
    router.push("/debts");
    router.refresh();
  }

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
      <div className="space-y-6 lg:col-span-8">
        <FormCard title="Debt Type">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {debtTypes.map((type) => {
              const isActive = selectedType.label === type.label;

              return (
                <button
                  aria-pressed={isActive}
                  className={
                    isActive
                      ? "rounded-lg border border-[#2170e4] bg-[#eff6ff] p-4 text-left shadow-sm"
                      : "rounded-lg border border-[#c6c6cd]/70 bg-white p-4 text-left transition hover:bg-[#eff4ff]"
                  }
                  key={type.label}
                  onClick={() => setSelectedType(type)}
                  type="button"
                >
                  <span className={`mb-3 grid size-10 place-items-center rounded-lg ${type.bg} ${type.tone}`}>
                    <Icon name={type.icon} />
                  </span>
                  <span className="text-sm font-semibold text-[#0b1c30]">{type.label}</span>
                </button>
              );
            })}
          </div>
        </FormCard>

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
            <div>
              <TextInput
                error={paymentHasError}
                label="Monthly Payment"
                onChange={setMonthlyPayment}
                placeholder="2100"
                type="number"
                value={monthlyPayment}
              />
              {paymentHasError ? <p className="mt-1 text-xs font-medium text-[#ba1a1a]">Monthly payment is required.</p> : null}
            </div>
            <TextInput label="Interest Rate" onChange={setInterestRate} placeholder="5.85" type="number" value={interestRate} />
          </div>

          <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-2">
            <TextInput label="Start Date" onChange={setStartDate} placeholder="2026-06-01" value={startDate} />
            <TextInput label="Next Payment Date" onChange={setNextPaymentDate} placeholder="2026-11-15" value={nextPaymentDate} />
          </div>
        </FormCard>

        <FormCard title="Repayment Settings">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <SelectInput label="Status" onChange={(value) => setStatus(value as DebtStatus)} options={["Active", "Overdue", "Paid"]} value={status} />
            <SelectInput label="Debt Category" onChange={(name) => setSelectedCategoryId(debtCategories.find((category) => category.name === name)?.id ?? "")} options={debtCategories.length > 0 ? debtCategories.map((category) => category.name) : ["No debt categories"]} value={debtCategories.find((category) => category.id === selectedCategoryId)?.name ?? "No debt categories"} />
          </div>
          <div className="mt-5">
            <SelectInput label="Payment Account" onChange={(name) => setPaymentAccountId(activeAccounts.find((account) => account.name === name)?.id ?? "")} options={activeAccounts.length > 0 ? activeAccounts.map((account) => account.name) : ["No accounts"]} value={activeAccounts.find((account) => account.id === paymentAccountId)?.name ?? "No accounts"} />
          </div>
          <div className="mt-5">
            <TextAreaInput label="Notes" onChange={setNotes} placeholder="Optional repayment notes..." value={notes} />
          </div>
        </FormCard>

        <div className="flex flex-col-reverse items-stretch justify-end gap-3 pt-2 sm:flex-row sm:items-center">
          {formError ? <div className="w-full rounded-md border border-[#fecaca] bg-[#fff1f0] px-4 py-2 text-sm font-medium text-[#991b1b]" role="alert">{formError}</div> : null}
          <Link
            className="inline-flex h-10 items-center justify-center rounded-md px-4 text-sm font-semibold text-[#45464d] transition hover:bg-[#eff4ff]"
            href="/debts"
          >
            Cancel
          </Link>
          <button
            className="inline-flex h-10 items-center justify-center rounded-md border border-[#c6c6cd]/70 bg-[#eff4ff] px-4 text-sm font-semibold text-[#0058be] transition hover:bg-[#dce9ff]"
            disabled={isSaving || Boolean(debt)}
            onClick={() => handleSaveDebt(true)}
            type="button"
          >
            Save & Add Another
          </button>
          <LoadingButton
            className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-[#0b1c30] px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-[#1f2937]"
            isLoading={isSaving}
            loadingLabel="Saving…"
            onClick={() => handleSaveDebt(false)}
            type="button"
          >
            Save Debt
          </LoadingButton>
        </div>
      </div>

      <aside className="hidden lg:col-span-4 lg:block">
        <div className="sticky top-24 rounded-lg border border-[#c6c6cd]/60 bg-[#eff4ff] p-6 shadow-[0_4px_20px_rgba(15,23,42,0.04)]">
          <div className="rounded-lg border border-[#c6c6cd]/60 bg-white p-5">
            <div className="mb-5 flex items-center gap-3 border-b border-[#c6c6cd]/40 pb-4">
              <span className={`grid size-11 place-items-center rounded-lg ${selectedType.bg} ${selectedType.tone}`}>
                <Icon name={selectedType.icon} />
              </span>
              <div>
                <p className="text-xs font-bold uppercase text-[#45464d]">Debt Preview</p>
                <h3 className="text-xl font-semibold text-[#0b1c30]">{name || selectedType.label}</h3>
              </div>
            </div>

            <ProgressCircle percent={progressPercent} tone={selectedType.tone} />

            <dl className="mt-5 grid grid-cols-2 gap-3 text-center">
              <div>
                <dt className="mb-1 text-xs font-bold uppercase text-[#45464d]">Repaid</dt>
                <dd><ResponsiveAmount className="font-semibold text-[#047857]" maxSizeRem={1.125}>{repaidAmount ? `MMK ${repaidAmount}` : "MMK 0"}</ResponsiveAmount></dd>
              </div>
              <div>
                <dt className="mb-1 text-xs font-bold uppercase text-[#45464d]">Remaining</dt>
                <dd><ResponsiveAmount className="font-semibold text-[#0b1c30]" maxSizeRem={1.125}>MMK {remaining.toLocaleString()}</ResponsiveAmount></dd>
              </div>
            </dl>

            <div className="mt-5 rounded-lg border border-[#c6c6cd]/40 bg-[#f8f9ff] p-4">
              <div className="flex items-center justify-between gap-4">
                <span className="text-xs font-bold uppercase text-[#45464d]">Monthly Payment</span>
                <ResponsiveAmount className="text-right font-semibold text-[#0b1c30]" maxSizeRem={0.875}>{monthlyPayment ? `MMK ${monthlyPayment}` : "MMK 0"}</ResponsiveAmount>
              </div>
              <div className="mt-4 flex items-center justify-between gap-4">
                <span className="text-xs font-bold uppercase text-[#45464d]">Start</span>
                <span className="text-sm font-semibold text-[#0b1c30]">{startDate || "Not set"}</span>
              </div>
              <div className="mt-4 flex items-center justify-between gap-4">
                <span className="text-xs font-bold uppercase text-[#45464d]">Category</span>
                <span className="max-w-36 truncate text-sm font-semibold text-[#0b1c30]">{debtCategories.find((category) => category.id === selectedCategoryId)?.name ?? "No category"}</span>
              </div>
              <div className="mt-4 flex items-center justify-between gap-4">
                <span className="text-xs font-bold uppercase text-[#45464d]">Status</span>
                <span className="text-sm font-semibold text-[#0b1c30]">{status}</span>
              </div>
              <div className="mt-4 flex items-center justify-between gap-4">
                <span className="text-xs font-bold uppercase text-[#45464d]">Account</span>
                <span className="max-w-36 truncate text-sm font-semibold text-[#0b1c30]">{activeAccounts.find((account) => account.id === paymentAccountId)?.name ?? "No account"}</span>
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
