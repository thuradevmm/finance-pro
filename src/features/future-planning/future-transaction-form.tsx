"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

import { createFutureTransactions, updateFutureTransaction } from "@/app/future-planning/actions";
import { useInteractionLoading } from "@/components/app/interaction-loading-provider";
import { FormCard, SelectInput, TextAreaInput, TextInput } from "@/components/ui/form-controls";
import { Icon } from "@/components/ui/icon";
import { LoadingButton } from "@/components/ui/loading-state";
import { ResponsiveAmount } from "@/components/ui/responsive-amount";
import { useToast } from "@/components/ui/toast-provider";
import { findAccountByOptionLabel, getAccountOptionDescription, getAccountOptionLabel, getAccountOptionLabels, type AccountRecord } from "@/lib/accounts/supabase";
import { getCategoriesForScope } from "@/lib/categories/category-scopes";
import type { CategoryRecord } from "@/lib/categories/supabase";
import { formatMmkPreview } from "@/lib/currency";
import { formatDisplayDate } from "@/lib/date-format";
import { getFutureOccurrenceDates, type FuturePlanStatus, type FutureRecurrence, type FutureTransactionFormData, type FutureTransactionRecord } from "@/lib/future-planning/records";

const recurrenceOptions: FutureRecurrence[] = ["Once", "Weekly", "Monthly", "Yearly"];

function accountAmountTypeOptions(account: AccountRecord | undefined) {
  if (!account) return ["General"];
  if (account.type === "Credit Card") return ["Credit Card"];
  const options = account.balanceBreakdowns.map((breakdown) => breakdown.type);
  return options.length > 0 ? options : ["General"];
}

function typeCardClass(type: "Expense" | "Income", selectedType: "Expense" | "Income") {
  if (type !== selectedType) return "rounded-lg border border-[#c6c6cd]/70 bg-[#f8f9ff] p-4 text-left text-[#45464d] transition hover:border-[#2170e4]/50 hover:bg-[#eff4ff]";
  return type === "Income"
    ? "rounded-lg border border-[#86efac] bg-[#ecfdf5] p-4 text-left text-[#166534] shadow-sm"
    : "rounded-lg border border-[#fca5a5] bg-[#fff1f0] p-4 text-left text-[#991b1b] shadow-sm";
}

export function FutureTransactionForm({
  accounts,
  categories,
  defaultDate,
  transaction,
}: {
  accounts: AccountRecord[];
  categories: CategoryRecord[];
  defaultDate: string;
  transaction?: FutureTransactionRecord;
}) {
  const router = useRouter();
  const beginLoading = useInteractionLoading();
  const { showError, showSuccess } = useToast();
  const [type, setType] = useState<"Expense" | "Income">(transaction?.type ?? "Expense");
  const planningAccounts = useMemo(
    () => accounts.filter((account) => account.status !== "Archived" && (type === "Expense" || account.type !== "Credit Card")),
    [accounts, type],
  );
  const initialAccount = planningAccounts.find((account) => account.id === transaction?.accountId) ?? planningAccounts[0];
  const [accountId, setAccountId] = useState(initialAccount?.id ?? "");
  const [accountAmountType, setAccountAmountType] = useState(transaction?.accountAmountType ?? accountAmountTypeOptions(initialAccount)[0]);
  const initialCategories = getCategoriesForScope(categories, "Transactions", transaction?.type ?? "Expense");
  const [categoryId, setCategoryId] = useState(transaction?.categoryId ?? initialCategories[0]?.id ?? "");
  const [title, setTitle] = useState(transaction?.title ?? "");
  const [amount, setAmount] = useState(transaction ? String(transaction.amountValue) : "");
  const [startDate, setStartDate] = useState(transaction?.dateValue ?? defaultDate);
  const [recurrence, setRecurrence] = useState<FutureRecurrence>("Once");
  const [endDate, setEndDate] = useState(transaction?.endDate ?? "");
  const [status, setStatus] = useState<FuturePlanStatus>(transaction?.status ?? "Active");
  const [note, setNote] = useState(transaction?.note ?? "");
  const [showErrors, setShowErrors] = useState(false);
  const [formError, setFormError] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  const selectedAccount = planningAccounts.find((account) => account.id === accountId) ?? planningAccounts[0];
  const amountTypeOptions = useMemo(() => accountAmountTypeOptions(selectedAccount), [selectedAccount]);
  const effectiveAmountType = amountTypeOptions.includes(accountAmountType) ? accountAmountType : amountTypeOptions[0] ?? "General";
  const availableCategories = useMemo(() => getCategoriesForScope(categories, "Transactions", type), [categories, type]);
  const selectedCategory = availableCategories.find((category) => category.id === categoryId) ?? availableCategories[0];
  const amountValue = Number(amount);
  const isRepeating = !transaction && recurrence !== "Once";
  const occurrenceCount = getFutureOccurrenceDates({ endDate, recurrence: transaction ? "Once" : recurrence, startDate }, 241).length;
  const titleHasError = showErrors && title.trim() === "";
  const amountHasError = showErrors && (!Number.isFinite(amountValue) || amountValue <= 0);
  const dateHasError = showErrors && startDate.trim() === "";
  const endDateHasError = showErrors && isRepeating && (endDate.trim() === "" || endDate < startDate);
  const accountHasError = showErrors && !selectedAccount;
  const categoryHasError = showErrors && !selectedCategory;

  function handleTypeChange(nextType: "Expense" | "Income") {
    setType(nextType);
    const nextCategories = getCategoriesForScope(categories, "Transactions", nextType);
    setCategoryId(nextCategories[0]?.id ?? "");
  }

  function handleAccountChange(label: string) {
    const account = findAccountByOptionLabel(planningAccounts, label);
    if (!account) return;
    setAccountId(account.id);
    setAccountAmountType(accountAmountTypeOptions(account)[0] ?? "General");
  }

  async function handleSave(addAnother = false) {
    const hasErrors = title.trim() === ""
      || !Number.isFinite(amountValue)
      || amountValue <= 0
      || startDate.trim() === ""
      || !selectedAccount
      || !selectedCategory
      || (isRepeating && (endDate.trim() === "" || endDate < startDate))
      || occurrenceCount > 240;
    setShowErrors(hasErrors);
    setFormError("");
    if (hasErrors || !selectedAccount || !selectedCategory) return;

    const input: FutureTransactionFormData = {
      accountAmountType: effectiveAmountType,
      accountId: selectedAccount.id,
      amount: amountValue,
      categoryId: selectedCategory.id,
      endDate: isRepeating ? endDate : "",
      note,
      recurrence: transaction ? "Once" : recurrence,
      startDate,
      status,
      title,
      type,
    };

    setIsSaving(true);
    const result = transaction
      ? await updateFutureTransaction(transaction.id, input)
      : await createFutureTransactions(input);
    if (result.error) {
      setIsSaving(false);
      setFormError(result.error);
      showError(result.error);
      return;
    }

    const createdLabel = result.createdCount && result.createdCount > 1
      ? `${result.createdCount} planned transactions created.`
      : "Planned transaction created.";
    showSuccess(transaction ? "Planned transaction updated." : createdLabel);

    if (addAnother && !transaction) {
      setIsSaving(false);
      setTitle("");
      setAmount("");
      setNote("");
      setShowErrors(false);
      return;
    }

    beginLoading();
    router.push("/future-planning");
    router.refresh();
  }

  return (
    <div className="grid min-w-0 grid-cols-1 gap-6 xl:grid-cols-12">
      <div className="min-w-0 space-y-6 xl:col-span-8">
        <FormCard title="Planned Transaction Type">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {(["Income", "Expense"] as const).map((option) => (
              <button aria-pressed={type === option} className={typeCardClass(option, type)} key={option} onClick={() => handleTypeChange(option)} type="button">
                <span className="flex items-center gap-2 text-sm font-bold">
                  <Icon className="size-5" name={option === "Income" ? "trendingUp" : "trendingDown"} />
                  {option}
                </span>
                <span className="mt-2 block text-xs font-medium leading-5">
                  {option === "Income" ? "Expected money coming into an account." : "Expected money leaving an account."}
                </span>
              </button>
            ))}
          </div>
        </FormCard>

        <FormCard title="Plan Details">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div>
              <TextInput error={titleHasError} label="Title" onChange={setTitle} placeholder={type === "Income" ? "Monthly salary" : "College fees"} value={title} />
              {titleHasError ? <p className="mt-1 text-xs font-medium text-[#ba1a1a]">Title is required.</p> : null}
            </div>
            <div>
              <TextInput error={amountHasError} label="Amount (MMK)" onChange={setAmount} placeholder="0" type="number" value={amount} />
              {amountHasError ? <p className="mt-1 text-xs font-medium text-[#ba1a1a]">Enter an amount greater than zero.</p> : null}
            </div>
          </div>

          <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-2">
            <div>
              <TextInput error={dateHasError} label={transaction ? "Planned Date" : "First Planned Date"} onChange={setStartDate} placeholder={defaultDate} type="date" value={startDate} />
              {dateHasError ? <p className="mt-1 text-xs font-medium text-[#ba1a1a]">Planned date is required.</p> : null}
            </div>
            <SelectInput label="Repeat" onChange={(value) => setRecurrence(value as FutureRecurrence)} options={transaction ? ["Once"] : recurrenceOptions} value={transaction ? "Once" : recurrence} />
          </div>

          {isRepeating ? (
            <div className="mt-5">
              <TextInput error={endDateHasError} label="Repeat Until" onChange={setEndDate} placeholder={startDate} type="date" value={endDate} />
              {endDateHasError ? <p className="mt-1 text-xs font-medium text-[#ba1a1a]">Choose an end date on or after the first date.</p> : null}
              {occurrenceCount > 240 ? <p className="mt-1 text-xs font-medium text-[#ba1a1a]">Shorten this schedule to 240 occurrences or fewer.</p> : null}
              <p className="mt-2 text-xs font-medium leading-5 text-[#45464d]">This creates {occurrenceCount || 0} individual scheduled transactions, so each occurrence can be adjusted or completed independently.</p>
            </div>
          ) : null}
        </FormCard>

        <FormCard title="Account & Category">
          {planningAccounts.length > 0 ? (
            <>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <SelectInput label="Account" onChange={handleAccountChange} options={getAccountOptionLabels(planningAccounts)} value={selectedAccount ? getAccountOptionLabel(selectedAccount, planningAccounts) : ""} />
                <SelectInput label="Account Amount Type" onChange={setAccountAmountType} options={amountTypeOptions} value={effectiveAmountType} />
              </div>
              <p className="mt-2 text-xs font-semibold text-[#76777d]">{selectedAccount ? getAccountOptionDescription(selectedAccount) : ""}</p>
              {accountHasError ? <p className="mt-2 text-xs font-medium text-[#ba1a1a]">Select an account.</p> : null}
            </>
          ) : (
            <p className="rounded-md border border-dashed border-[#c6c6cd] p-5 text-sm text-[#45464d]">Create an account before planning transactions. <Link className="font-semibold text-[#0058be] hover:underline" href="/accounts/add">Add Account</Link></p>
          )}

          <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-2">
            {availableCategories.length > 0 ? (
              <SelectInput label="Category" onChange={(name) => setCategoryId(availableCategories.find((category) => category.name === name)?.id ?? "")} options={availableCategories.map((category) => category.name)} value={selectedCategory?.name ?? ""} />
            ) : (
              <p className="rounded-md border border-dashed border-[#c6c6cd] p-5 text-sm text-[#45464d]">Create a {type.toLowerCase()} category first. <Link className="font-semibold text-[#0058be] hover:underline" href="/categories/add">Add Category</Link></p>
            )}
            <SelectInput label="Plan Status" onChange={(value) => setStatus(value as FuturePlanStatus)} options={["Active", "Paused"]} value={status} />
          </div>
          {categoryHasError ? <p className="mt-2 text-xs font-medium text-[#ba1a1a]">Select a category.</p> : null}
        </FormCard>

        <FormCard title="Notes">
          <TextAreaInput label="Description" onChange={setNote} placeholder="Optional context, assumptions, or reminder..." value={note} />
        </FormCard>

        {formError ? <div className="rounded-lg border border-[#fecaca] bg-[#fff1f0] px-4 py-3 text-sm font-medium text-[#991b1b]" role="alert">{formError}</div> : null}

        <div className="flex flex-col-reverse items-stretch justify-end gap-3 pt-2 sm:flex-row sm:items-center">
          <Link className="inline-flex min-h-11 items-center justify-center rounded-md px-4 text-sm font-semibold text-[#45464d] transition hover:bg-[#eff4ff]" href="/future-planning">Cancel</Link>
          {!transaction ? <button className="inline-flex min-h-11 items-center justify-center rounded-md border border-[#c6c6cd]/70 bg-[#eff4ff] px-4 text-sm font-semibold text-[#0058be] transition hover:bg-[#dce9ff] disabled:opacity-60" disabled={isSaving || !selectedAccount || !selectedCategory} onClick={() => handleSave(true)} type="button">Save & Add Another</button> : null}
          <LoadingButton className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md bg-[#0b1c30] px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-[#1f2937] disabled:cursor-not-allowed disabled:opacity-60" disabled={!selectedAccount || !selectedCategory} isLoading={isSaving} loadingLabel="Saving…" onClick={() => handleSave(false)} type="button">
            <Icon className="size-4" name="check" />
            {transaction ? "Save Changes" : "Save Plan"}
          </LoadingButton>
        </div>
      </div>

      <aside className="hidden min-w-0 xl:col-span-4 xl:block">
        <div className="sticky top-24 rounded-lg border border-[#c6c6cd]/60 bg-[#eff4ff] p-6 shadow-[0_4px_20px_rgba(15,23,42,0.04)]">
          <div className="rounded-lg border border-[#c6c6cd]/60 bg-white p-5">
            <div className="flex items-center gap-3">
              <span className={`grid size-12 place-items-center rounded-md ${type === "Income" ? "bg-[#ecfdf5] text-[#047857]" : "bg-[#fff1f0] text-[#b42318]"}`}><Icon name={type === "Income" ? "trendingUp" : "trendingDown"} /></span>
              <div className="min-w-0">
                <p className="text-xs font-bold uppercase text-[#45464d]">Plan Preview</p>
                <h3 className="truncate text-lg font-semibold text-[#0b1c30]">{title.trim() || `${type} plan`}</h3>
              </div>
            </div>
            <ResponsiveAmount className={`mt-5 font-bold ${type === "Income" ? "text-[#047857]" : "text-[#b42318]"}`} maxSizeRem={2.1}>{formatMmkPreview(Number.isFinite(amountValue) ? amountValue : 0, type === "Income" ? "positive" : "negative")}</ResponsiveAmount>
            <dl className="mt-5 space-y-4 rounded-lg border border-[#c6c6cd]/40 bg-[#f8f9ff] p-4">
              <div className="flex justify-between gap-4"><dt className="text-xs font-bold uppercase text-[#45464d]">First date</dt><dd className="text-sm font-semibold text-[#0b1c30]">{formatDisplayDate(startDate, "Not set")}</dd></div>
              <div className="flex justify-between gap-4"><dt className="text-xs font-bold uppercase text-[#45464d]">Schedule</dt><dd className="text-sm font-semibold text-[#0b1c30]">{transaction ? "One occurrence" : recurrence}</dd></div>
              <div className="flex justify-between gap-4"><dt className="text-xs font-bold uppercase text-[#45464d]">Occurrences</dt><dd className="text-sm font-semibold text-[#0b1c30]">{occurrenceCount || 0}</dd></div>
              <div className="flex justify-between gap-4"><dt className="text-xs font-bold uppercase text-[#45464d]">Category</dt><dd className="max-w-40 truncate text-sm font-semibold text-[#0b1c30]">{selectedCategory?.name ?? "Not set"}</dd></div>
              <div className="flex justify-between gap-4"><dt className="text-xs font-bold uppercase text-[#45464d]">Status</dt><dd className="text-sm font-semibold text-[#0b1c30]">{status}</dd></div>
            </dl>
            <p className="mt-4 rounded-md border border-[#bfdbfe] bg-[#eff6ff] px-4 py-3 text-xs font-semibold leading-5 text-[#1e3a5f]">Scheduled plans stay out of real balances and actual spending until you complete them from Transactions.</p>
          </div>
        </div>
      </aside>
    </div>
  );
}
