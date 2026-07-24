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
import { formatMmk, formatMmkPreview } from "@/lib/currency";
import { formatDisplayDate } from "@/lib/date-format";
import {
  getFutureOccurrenceDates,
  suggestedFutureAmount,
  type FuturePlanLinkOption,
  type FuturePlanRelatedEntityType,
  type FuturePlanStatus,
  type FutureRecurrence,
  type FutureTransactionFormData,
  type FutureTransactionRecord,
} from "@/lib/future-planning/records";

const recurrenceOptions: FutureRecurrence[] = ["Once", "Weekly", "Monthly", "Yearly"];

function accountAmountTypeOptions(account: AccountRecord | undefined, preservedType?: string) {
  if (!account) return preservedType ? [preservedType] : ["General"];
  const options = account.type === "Credit Card"
    ? ["Credit Card"]
    : account.balanceBreakdowns.map((breakdown) => breakdown.type);
  const availableOptions = options.length > 0 ? options : ["General"];
  return preservedType && !availableOptions.includes(preservedType)
    ? [preservedType, ...availableOptions]
    : availableOptions;
}

function categoriesForPlan(categories: CategoryRecord[], type: "Expense" | "Income", preservedCategoryId?: string) {
  const available = getCategoriesForScope(categories, "Transactions", type) as CategoryRecord[];
  const preserved = categories.find((category) => category.id === preservedCategoryId
    && category.type === type
    && category.scopes.includes("Transactions"));
  return preserved && !available.some((category) => category.id === preserved.id)
    ? [preserved, ...available]
    : available;
}

function categorySelectLabel(category: CategoryRecord) {
  return category.status === "Hidden" ? `${category.name} (Hidden)` : category.name;
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
  linkOptions,
  transaction,
}: {
  accounts: AccountRecord[];
  categories: CategoryRecord[];
  defaultDate: string;
  linkOptions: FuturePlanLinkOption[];
  transaction?: FutureTransactionRecord;
}) {
  const router = useRouter();
  const beginLoading = useInteractionLoading();
  const { showError, showSuccess } = useToast();
  const [type, setType] = useState<"Expense" | "Income">(transaction?.type ?? "Expense");
  const planningAccounts = useMemo(
    () => accounts.filter((account) => account.id === transaction?.accountId
      || (account.status !== "Archived" && (type === "Expense" || account.type !== "Credit Card"))),
    [accounts, transaction?.accountId, type],
  );
  const initialAccount = planningAccounts.find((account) => account.id === transaction?.accountId) ?? planningAccounts[0];
  const [accountId, setAccountId] = useState(initialAccount?.id ?? "");
  const [accountAmountType, setAccountAmountType] = useState(transaction?.accountAmountType ?? accountAmountTypeOptions(initialAccount)[0]);
  const initialCategories = categoriesForPlan(categories, transaction?.type ?? "Expense", transaction?.categoryId);
  const [categoryId, setCategoryId] = useState(transaction?.categoryId ?? initialCategories[0]?.id ?? "");
  const [title, setTitle] = useState(transaction?.title ?? "");
  const [amount, setAmount] = useState(transaction ? String(transaction.amountValue) : "");
  const [amountWasEdited, setAmountWasEdited] = useState(Boolean(transaction));
  const [startDate, setStartDate] = useState(transaction?.dateValue ?? defaultDate);
  const [recurrence, setRecurrence] = useState<FutureRecurrence>("Once");
  const [endDate, setEndDate] = useState(transaction?.endDate ?? "");
  const [status, setStatus] = useState<FuturePlanStatus>(transaction?.status ?? "Active");
  const [relatedEntityAmountSnapshot, setRelatedEntityAmountSnapshot] = useState<number | null>(transaction?.relatedEntityAmountSnapshot ?? null);
  const [relatedEntityId, setRelatedEntityId] = useState(transaction?.relatedEntityId ?? "");
  const [relatedEntityLabel, setRelatedEntityLabel] = useState(transaction?.relatedEntityLabel ?? "");
  const [relatedEntityType, setRelatedEntityType] = useState<FuturePlanRelatedEntityType>(transaction?.relatedEntityType ?? "none");
  const [note, setNote] = useState(transaction?.note ?? "");
  const [predictionDrafts, setPredictionDrafts] = useState<Record<string, string>>({});
  const [showOccurrenceAmounts, setShowOccurrenceAmounts] = useState(false);
  const [showErrors, setShowErrors] = useState(false);
  const [formError, setFormError] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  const selectedAccount = planningAccounts.find((account) => account.id === accountId) ?? planningAccounts[0];
  const amountTypeOptions = useMemo(
    () => accountAmountTypeOptions(
      selectedAccount,
      selectedAccount?.id === transaction?.accountId ? transaction.accountAmountType : undefined,
    ),
    [selectedAccount, transaction?.accountAmountType, transaction?.accountId],
  );
  const effectiveAmountType = amountTypeOptions.includes(accountAmountType) ? accountAmountType : amountTypeOptions[0] ?? "General";
  const availableCategories = useMemo(
    () => categoriesForPlan(categories, type, transaction?.categoryId),
    [categories, transaction?.categoryId, type],
  );
  const selectedCategory = availableCategories.find((category) => category.id === categoryId) ?? availableCategories[0];
  const selectableLinks = useMemo(() => {
    const links = [...linkOptions];
    if (transaction?.relatedEntityId && transaction.relatedEntityType !== "none"
      && !links.some((option) => option.id === transaction.relatedEntityId && option.type === transaction.relatedEntityType)) {
      links.unshift({
        amount: transaction.relatedEntityAmountSnapshot ?? transaction.amountValue,
        categoryId: transaction.categoryId,
        id: transaction.relatedEntityId,
        label: transaction.relatedEntityLabel || `${transaction.relatedEntityType.replaceAll("_", " ")} · linked record unavailable`,
        type: transaction.relatedEntityType,
      });
    }
    const baseLabels = links.map((option) => `${option.label} · ${formatMmk(option.amount)}`);
    const totals = new Map<string, number>();
    for (const label of baseLabels) totals.set(label, (totals.get(label) ?? 0) + 1);
    const occurrences = new Map<string, number>();
    return links.map((option, index) => {
      const baseLabel = baseLabels[index];
      const occurrence = (occurrences.get(baseLabel) ?? 0) + 1;
      occurrences.set(baseLabel, occurrence);
      return {
        ...option,
        selectLabel: (totals.get(baseLabel) ?? 0) > 1 ? `${baseLabel} (${occurrence})` : baseLabel,
      };
    });
  }, [linkOptions, transaction]);
  const selectedLink = selectableLinks.find((option) => option.id === relatedEntityId && option.type === relatedEntityType);
  const amountValue = Number(amount);
  const isRepeating = !transaction && recurrence !== "Once";
  const occurrenceDates = useMemo(
    () => getFutureOccurrenceDates({ endDate, recurrence: transaction ? "Once" : recurrence, startDate }, 241),
    [endDate, recurrence, startDate, transaction],
  );
  const occurrenceCount = occurrenceDates.length;
  const customizedPredictions = occurrenceDates.flatMap((date) => predictionDrafts[date] === undefined
    ? []
    : [{ amount: Number(predictionDrafts[date]), date }]);
  const predictionsHaveError = customizedPredictions.some((prediction) => !Number.isFinite(prediction.amount) || prediction.amount <= 0);
  const predictedTotal = occurrenceDates.reduce((sum, date) => {
    const value = Number(predictionDrafts[date] ?? amount);
    return sum + (Number.isFinite(value) && value > 0 ? value : 0);
  }, 0);
  const titleHasError = showErrors && title.trim() === "";
  const amountHasError = showErrors && (!Number.isFinite(amountValue) || amountValue <= 0);
  const dateHasError = showErrors && startDate.trim() === "";
  const endDateHasError = showErrors && isRepeating && (endDate.trim() === "" || endDate < startDate);
  const accountHasError = showErrors && !selectedAccount;
  const categoryHasError = showErrors && !selectedCategory;

  function handleTypeChange(nextType: "Expense" | "Income") {
    setType(nextType);
    const nextCategories = categoriesForPlan(categories, nextType, transaction?.categoryId);
    setCategoryId(nextCategories[0]?.id ?? "");
  }

  function handleAccountChange(label: string) {
    const account = findAccountByOptionLabel(planningAccounts, label);
    if (!account) return;
    setAccountId(account.id);
    setAccountAmountType(accountAmountTypeOptions(
      account,
      account.id === transaction?.accountId ? transaction.accountAmountType : undefined,
    )[0] ?? "General");
  }

  function handleAmountChange(value: string) {
    setAmount(value);
    setAmountWasEdited(true);
  }

  function handleLinkChange(label: string) {
    if (label === "No linked record") {
      setRelatedEntityId("");
      setRelatedEntityLabel("");
      setRelatedEntityType("none");
      setRelatedEntityAmountSnapshot(null);
      return;
    }
    const option = selectableLinks.find((item) => item.selectLabel === label);
    if (!option) return;
    setRelatedEntityId(option.id);
    setRelatedEntityLabel(option.label);
    setRelatedEntityType(option.type);
    setRelatedEntityAmountSnapshot(option.amount);
    setAmount((currentAmount) => suggestedFutureAmount(currentAmount, option.amount, amountWasEdited));
    if (type !== "Expense") handleTypeChange("Expense");
    const expenseCategories = getCategoriesForScope(categories, "Transactions", "Expense");
    if (expenseCategories.some((category) => category.id === option.categoryId)) setCategoryId(option.categoryId);
  }

  function useLinkedAmountSuggestion() {
    if (!selectedLink) return;
    setAmount(String(selectedLink.amount));
    setAmountWasEdited(true);
    setRelatedEntityAmountSnapshot(selectedLink.amount);
  }

  async function handleSave(addAnother = false) {
    const hasErrors = title.trim() === ""
      || !Number.isFinite(amountValue)
      || amountValue <= 0
      || startDate.trim() === ""
      || !selectedAccount
      || !selectedCategory
      || (isRepeating && (endDate.trim() === "" || endDate < startDate))
      || predictionsHaveError
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
      predictions: isRepeating ? customizedPredictions : [],
      recurrence: transaction ? "Once" : recurrence,
      relatedEntityAmountSnapshot,
      relatedEntityId,
      relatedEntityLabel,
      relatedEntityType,
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
      setAmountWasEdited(false);
      setNote("");
      setPredictionDrafts({});
      setRelatedEntityId("");
      setRelatedEntityLabel("");
      setRelatedEntityType("none");
      setRelatedEntityAmountSnapshot(null);
      setShowOccurrenceAmounts(false);
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
              <TextInput error={amountHasError} label="Predicted Amount (MMK)" onChange={handleAmountChange} placeholder="0" type="amount" value={amount} />
              {amountHasError ? <p className="mt-1 text-xs font-medium text-[#ba1a1a]">Enter an amount greater than zero.</p> : null}
              {!amountHasError ? <p className="mt-1 text-xs font-medium leading-5 text-[#45464d]">This is your forecast, independent of category history or a linked record&apos;s current value.</p> : null}
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
              {occurrenceCount > 1 && occurrenceCount <= 240 ? (
                <div className="mt-4 rounded-lg border border-[#c6c6cd]/60 bg-[#f8f9ff] p-3 sm:p-4">
                  <button
                    aria-expanded={showOccurrenceAmounts}
                    className="flex min-h-11 w-full items-center justify-between gap-3 text-left text-sm font-semibold text-[#0058be]"
                    onClick={() => setShowOccurrenceAmounts((visible) => !visible)}
                    type="button"
                  >
                    <span>Customize predicted amounts by date</span>
                    <Icon className={`size-4 transition ${showOccurrenceAmounts ? "rotate-180" : ""}`} name="chevronDown" />
                  </button>
                  {showOccurrenceAmounts ? (
                    <div className="mt-3 border-t border-[#c6c6cd]/50 pt-4">
                      <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                        <p className="text-xs font-medium leading-5 text-[#45464d]">Dates without an override use the base predicted amount above.</p>
                        <button
                          className="min-h-9 shrink-0 rounded-md px-3 text-xs font-semibold text-[#0058be] transition hover:bg-[#dce9ff] disabled:opacity-50"
                          disabled={Object.keys(predictionDrafts).length === 0}
                          onClick={() => setPredictionDrafts({})}
                          type="button"
                        >
                          Reset all to base
                        </button>
                      </div>
                      <div className="grid max-h-96 grid-cols-1 gap-3 overflow-y-auto pr-1 sm:grid-cols-2">
                        {occurrenceDates.map((date) => {
                          const predictionValue = predictionDrafts[date] ?? amount;
                          const parsedPrediction = Number(predictionValue);
                          const predictionHasError = showErrors && (!Number.isFinite(parsedPrediction) || parsedPrediction <= 0);
                          return (
                            <TextInput
                              error={predictionHasError}
                              key={date}
                              label={formatDisplayDate(date, date)}
                              onChange={(value) => setPredictionDrafts((current) => ({ ...current, [date]: value }))}
                              placeholder="0"
                              type="amount"
                              value={predictionValue}
                            />
                          );
                        })}
                      </div>
                      {showErrors && predictionsHaveError ? <p className="mt-2 text-xs font-medium text-[#ba1a1a]">Enter an amount greater than zero for every customized date.</p> : null}
                      <p className="mt-4 text-sm font-semibold text-[#0b1c30]">Total predicted across {occurrenceCount} dates: {formatMmk(predictedTotal)}</p>
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>
          ) : null}
        </FormCard>

        <FormCard title="Account & Category">
          <div className="mb-5">
            <SelectInput
              label="Link Existing Record (optional)"
              onChange={handleLinkChange}
              options={["No linked record", ...selectableLinks.map((option) => option.selectLabel)]}
              value={selectedLink?.selectLabel ?? "No linked record"}
            />
            <p className="mt-2 text-xs font-medium leading-5 text-[#45464d]">
              Selecting a record keeps its ID linked and suggests its current category and amount. A linked amount is only a snapshot and never replaces a predicted amount you have entered or changes later with the source.
            </p>
            {selectedLink ? (
              <div className="mt-2 flex flex-col gap-2 rounded-md border border-[#c6c6cd]/50 bg-[#f8f9ff] px-3 py-2 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-xs font-semibold text-[#45464d]">
                  Saved linked suggestion: {relatedEntityAmountSnapshot == null ? "Not saved" : formatMmk(relatedEntityAmountSnapshot)}
                </p>
                <button className="min-h-9 shrink-0 rounded-md px-3 text-xs font-semibold text-[#0058be] transition hover:bg-[#dce9ff]" onClick={useLinkedAmountSuggestion} type="button">
                  Use current suggestion ({formatMmk(selectedLink.amount)})
                </button>
              </div>
            ) : null}
          </div>
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
              <SelectInput label="Category" onChange={(label) => setCategoryId(availableCategories.find((category) => categorySelectLabel(category) === label)?.id ?? "")} options={availableCategories.map(categorySelectLabel)} value={selectedCategory ? categorySelectLabel(selectedCategory) : ""} />
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
              {isRepeating ? <div className="flex justify-between gap-4"><dt className="text-xs font-bold uppercase text-[#45464d]">Predicted total</dt><dd className="text-sm font-semibold text-[#0b1c30]">{formatMmk(predictedTotal)}</dd></div> : null}
              <div className="flex justify-between gap-4"><dt className="text-xs font-bold uppercase text-[#45464d]">Category</dt><dd className="max-w-40 truncate text-sm font-semibold text-[#0b1c30]">{selectedCategory?.name ?? "Not set"}</dd></div>
              <div className="flex justify-between gap-4"><dt className="text-xs font-bold uppercase text-[#45464d]">Linked record</dt><dd className="max-w-40 truncate text-sm font-semibold text-[#0b1c30]">{relatedEntityLabel || selectedLink?.label || "None"}</dd></div>
              <div className="flex justify-between gap-4"><dt className="text-xs font-bold uppercase text-[#45464d]">Status</dt><dd className="text-sm font-semibold text-[#0b1c30]">{status}</dd></div>
            </dl>
            <p className="mt-4 rounded-md border border-[#bfdbfe] bg-[#eff6ff] px-4 py-3 text-xs font-semibold leading-5 text-[#1e3a5f]">Scheduled plans stay out of real balances and actual spending until you complete them from Transactions.</p>
          </div>
        </div>
      </aside>
    </div>
  );
}
