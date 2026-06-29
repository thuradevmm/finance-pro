"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { useMemo, useState } from "react";

import { createTransaction, updateTransaction } from "@/app/transactions/actions";
import { useInteractionLoading } from "@/components/app/interaction-loading-provider";
import { Icon, type IconName } from "@/components/ui/icon";
import { LoadingButton } from "@/components/ui/loading-state";
import { ResponsiveAmount } from "@/components/ui/responsive-amount";
import { useToast } from "@/components/ui/toast-provider";
import { formatMmkPreview } from "@/lib/currency";
import { formatDisplayDate } from "@/lib/date-format";
import { getCategoriesForScope } from "@/lib/categories/category-scopes";
import { findAccountByOptionLabel, getAccountOptionDescription, getAccountOptionLabel, getAccountOptionLabels, type AccountRecord } from "@/lib/accounts/supabase";
import type { CategoryRecord } from "@/lib/categories/supabase";
import type { TransactionFormData, TransactionRecord, TransactionRelatedOption } from "@/lib/transactions/supabase";
import type { TransactionType } from "@/types/finance";

type TransactionTypeOption = {
  accent: string;
  activeClassName: string;
  description: string;
  icon: IconName;
  previewClassName: string;
  previewIcon: IconName;
  type: TransactionType;
};

const transactionTypes: TransactionTypeOption[] = [
  { type: "Expense", description: "Money paid from an account", icon: "trendingDown", previewIcon: "receipt", accent: "text-[#b42318]", activeClassName: "border-[#fca5a5] bg-[#fff1f0] text-[#991b1b] shadow-sm", previewClassName: "bg-[#b42318] text-white" },
  { type: "Income", description: "Money received into an account", icon: "trendingUp", previewIcon: "trendingUp", accent: "text-[#047857]", activeClassName: "border-[#86efac] bg-[#ecfdf5] text-[#166534] shadow-sm", previewClassName: "bg-[#047857] text-white" },
  { type: "Transfer", description: "Move money between accounts", icon: "sync", previewIcon: "sync", accent: "text-[#4f46e5]", activeClassName: "border-[#c7d2fe] bg-[#eef2ff] text-[#3730a3] shadow-sm", previewClassName: "bg-[#4f46e5] text-white" },
];

const automaticCreditCardDebtOption: TransactionRelatedOption = {
  label: "Automatic Credit Card Debt",
  type: "debt",
  value: "",
};

function FieldLabel({ children }: { children: string }) {
  return <label className="mb-2 block text-xs font-bold uppercase text-[#45464d]">{children}</label>;
}

function FormCard({ children, title }: { children: ReactNode; title: string }) {
  return (
    <section className="rounded-lg border border-[#c6c6cd]/60 bg-white p-4 shadow-[0_4px_20px_rgba(15,23,42,0.04)] sm:p-5">
      <h2 className="mb-5 text-lg font-semibold text-[#0b1c30] sm:text-xl">{title}</h2>
      {children}
    </section>
  );
}

function SelectInput({ label, onChange, options, value }: { label: string; onChange: (value: string) => void; options: string[]; value: string }) {
  return (
    <div>
      <FieldLabel>{label}</FieldLabel>
      <div className="relative">
        <select
          className="h-12 w-full appearance-none rounded-lg border border-[#c6c6cd] bg-white px-4 pr-12 text-sm font-medium text-[#0b1c30] outline-none transition focus:border-[#2170e4] focus:ring-2 focus:ring-[#2170e4]/20"
          onChange={(event) => onChange(event.target.value)}
          value={value}
        >
          {options.map((option) => <option key={option}>{option}</option>)}
        </select>
        <Icon className="pointer-events-none absolute right-4 top-1/2 size-4 -translate-y-1/2 text-[#76777d]" name="chevronDown" />
      </div>
    </div>
  );
}

function formatPreviewAmount(amount: string, type: TransactionType) {
  const value = Number(amount);
  if (!Number.isFinite(value) || value <= 0) return formatMmkPreview(0);
  if (type === "Income") return formatMmkPreview(value, "positive");
  if (type === "Expense") return formatMmkPreview(value, "negative");
  return formatMmkPreview(value);
}

function isCreditCardAccount(account: AccountRecord | undefined) {
  return account?.type === "Credit Card";
}

function accountAmountTypeOptionsFor(account: AccountRecord | undefined) {
  if (!account) return [];
  if (isCreditCardAccount(account)) return ["Credit Card"];
  return account.balanceBreakdowns.map((breakdown) => breakdown.type);
}

export function AddTransactionForm({
  accounts,
  categories,
  relatedOptions,
  transaction,
}: {
  accounts: AccountRecord[];
  categories: CategoryRecord[];
  relatedOptions: TransactionRelatedOption[];
  transaction?: TransactionRecord;
}) {
  const { showError, showSuccess } = useToast();
  const router = useRouter();
  const beginLoading = useInteractionLoading();
  const [selectedType, setSelectedType] = useState<TransactionType>(transaction?.type ?? "Expense");
  const [amount, setAmount] = useState(transaction ? String(transaction.amountValue) : "");
  const [transactionDate, setTransactionDate] = useState(transaction?.dateValue ?? new Date().toISOString().slice(0, 10));
  const initialTransferFromAccountId = transaction?.type === "Transfer" ? transaction.transferFromAccountId || transaction.accountId : transaction?.accountId;
  const initialTransferToAccountId = transaction?.type === "Transfer" ? transaction.transferToAccountId || transaction.transferAccountId : transaction?.transferAccountId;
  const initialTransferFromAmountType = transaction?.type === "Transfer" && transaction.transferDirection === "Credit"
    ? transaction.transferAccountAmountType
    : transaction?.accountAmountType;
  const initialTransferToAmountType = transaction?.type === "Transfer" && transaction.transferDirection === "Credit"
    ? transaction.accountAmountType
    : transaction?.transferAccountAmountType;
  const [accountId, setAccountId] = useState(initialTransferFromAccountId ?? accounts[0]?.id ?? "");
  const [accountAmountType, setAccountAmountType] = useState(initialTransferFromAmountType ?? accountAmountTypeOptionsFor(accounts[0])[0] ?? "Operation");
  const [transferToAccountId, setTransferToAccountId] = useState(initialTransferToAccountId ?? accounts.find((account) => account.id !== accountId)?.id ?? accounts[0]?.id ?? "");
  const [transferAccountAmountType, setTransferAccountAmountType] = useState(initialTransferToAmountType ?? accountAmountTypeOptionsFor(accounts.find((account) => account.id !== accountId) ?? accounts[0])[0] ?? "Operation");
  const transactionCategories = useMemo(() => getCategoriesForScope(categories, "Transactions", selectedType === "Income" ? "Income" : "Expense"), [categories, selectedType]);
  const [categoryId, setCategoryId] = useState(transaction?.categoryId ?? transactionCategories[0]?.id ?? "");
  const [status, setStatus] = useState(transaction?.status ?? "cleared");
  const [note, setNote] = useState(transaction?.note ?? "");
  const [relatedOptionValue, setRelatedOptionValue] = useState(
    transaction?.relatedEntityType && transaction.relatedEntityType !== "none"
      ? `${transaction.relatedEntityType}:${transaction.relatedEntityId}`
      : "none:",
  );
  const [showErrors, setShowErrors] = useState(false);
  const [formError, setFormError] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const selectedOption = transactionTypes.find((option) => option.type === selectedType) ?? transactionTypes[0];
  const selectedAccount = accounts.find((account) => account.id === accountId);
  const accountAmountTypeOptions = useMemo(() => {
    const optionNames = accountAmountTypeOptionsFor(selectedAccount);
    return accountAmountType && !optionNames.includes(accountAmountType) ? [accountAmountType, ...optionNames] : optionNames;
  }, [accountAmountType, selectedAccount]);
  const effectiveAccountAmountType = accountAmountTypeOptions.includes(accountAmountType) ? accountAmountType : accountAmountTypeOptions[0] ?? "General";
  const transferAccountOptions = accounts;
  const selectedTransferAccount = transferAccountOptions.find((account) => account.id === transferToAccountId) ?? transferAccountOptions[0];
  const effectiveTransferToAccountId = selectedTransferAccount?.id ?? "";
  const transferAccountAmountTypeOptions = useMemo(() => {
    const optionNames = accountAmountTypeOptionsFor(selectedTransferAccount);
    return transferAccountAmountType && !optionNames.includes(transferAccountAmountType) ? [transferAccountAmountType, ...optionNames] : optionNames;
  }, [selectedTransferAccount, transferAccountAmountType]);
  const effectiveTransferAccountAmountType = transferAccountAmountTypeOptions.includes(transferAccountAmountType)
    ? transferAccountAmountType
    : transferAccountAmountTypeOptions[0] ?? "General";
  const selectedCategory = transactionCategories.find((category) => category.id === categoryId);
  const selectedRelatedOption = relatedOptions.find((option) => `${option.type}:${option.value}` === relatedOptionValue) ?? relatedOptions[0];
  const isTransfer = selectedType === "Transfer";
  const isCreditCardCharge = isCreditCardAccount(selectedAccount) && (selectedType === "Expense" || selectedType === "Transfer");
  const isCreditCardPayment = isTransfer && isCreditCardAccount(selectedTransferAccount);
  const autoLinksCreditCardDebt = isCreditCardCharge || isCreditCardPayment;
  const debtRelatedOptions = useMemo(() => relatedOptions.filter((option) => option.type === "debt"), [relatedOptions]);
  const impactOptions = useMemo(() => {
    if (!autoLinksCreditCardDebt) return relatedOptions;
    return [automaticCreditCardDebtOption, ...debtRelatedOptions];
  }, [autoLinksCreditCardDebt, debtRelatedOptions, relatedOptions]);
  const effectiveRelatedOption = autoLinksCreditCardDebt && (!selectedRelatedOption || selectedRelatedOption.type !== "debt" || !selectedRelatedOption.value)
    ? impactOptions[0] ?? selectedRelatedOption
    : selectedRelatedOption;
  const amountNumber = Number(amount);
  const amountHasError = showErrors && (!Number.isFinite(amountNumber) || amountNumber <= 0);
  const dateHasError = showErrors && !transactionDate;
  const accountHasError = showErrors && !accountId;
  const transferAmountTypeHasError = showErrors && isTransfer && accountId === effectiveTransferToAccountId && effectiveAccountAmountType === effectiveTransferAccountAmountType;
  const categoryHasError = showErrors && !isTransfer && !categoryId;
  const selectedAvailableBreakdown = selectedAccount?.availableBreakdowns.find((breakdown) => breakdown.type === effectiveAccountAmountType);
  const availableAmountValue = selectedAvailableBreakdown?.amountValue ?? 0;
  const shouldValidateAvailableAmount = !isCreditCardAccount(selectedAccount) && (selectedType === "Expense" || selectedType === "Transfer");
  const availableAmountHasError = showErrors && shouldValidateAvailableAmount && Number.isFinite(amountNumber) && amountNumber > availableAmountValue;

  function handleTypeChange(type: TransactionType) {
    setSelectedType(type);
    const nextCategories = getCategoriesForScope(categories, "Transactions", type === "Income" ? "Income" : "Expense");
    setCategoryId(nextCategories[0]?.id ?? "");
  }

  function handleRelatedOptionChange(label: string) {
    const nextOption = impactOptions.find((option) => option.label === label) ?? impactOptions[0] ?? relatedOptions[0];
    setRelatedOptionValue(`${nextOption.type}:${nextOption.value}`);
  }

  function handleAccountChange(name: string) {
    const nextAccount = findAccountByOptionLabel(accounts, name);
    setAccountId(nextAccount?.id ?? "");
    setAccountAmountType(accountAmountTypeOptionsFor(nextAccount)[0] ?? "General");
  }

  function handleTransferAccountChange(name: string) {
    const nextAccount = findAccountByOptionLabel(transferAccountOptions, name);
    setTransferToAccountId(nextAccount?.id ?? "");
    setTransferAccountAmountType(accountAmountTypeOptionsFor(nextAccount)[0] ?? "General");
  }

  async function handleSaveTransaction(addAnother = false) {
    const hasInsufficientAvailableAmount = shouldValidateAvailableAmount && Number.isFinite(amountNumber) && amountNumber > availableAmountValue;
    const hasSameTransferEndpoint = isTransfer && accountId === effectiveTransferToAccountId && effectiveAccountAmountType === effectiveTransferAccountAmountType;
    const hasErrors = !Number.isFinite(amountNumber) || amountNumber <= 0 || !transactionDate || !accountId || hasInsufficientAvailableAmount || hasSameTransferEndpoint || (isTransfer && !effectiveTransferToAccountId) || (!isTransfer && !categoryId);
    setShowErrors(hasErrors);
    setFormError("");
    if (hasErrors) return;

    const input: TransactionFormData = {
      accountId,
      accountAmountType: effectiveAccountAmountType,
      amount: amountNumber,
      categoryId,
      date: transactionDate,
      note,
      relatedEntityId: effectiveRelatedOption?.value ?? "",
      relatedEntityType: effectiveRelatedOption?.type ?? "none",
      status,
      title: note.trim() || `${selectedType} transaction`,
      transferAccountId: isTransfer ? effectiveTransferToAccountId : "",
      transferAccountAmountType: isTransfer ? effectiveTransferAccountAmountType : "",
      type: selectedType,
    };

    setIsSaving(true);
    const result = transaction ? await updateTransaction(transaction.id, input) : await createTransaction(input);
    if (result.error) {
      setIsSaving(false);
      setFormError(result.error);
      showError(result.error);
      return;
    }

    if (addAnother && !transaction) {
      setIsSaving(false);
      setAmount("");
      setNote("");
      setShowErrors(false);
      showSuccess("Transaction saved successfully.");
      return;
    }

    showSuccess(transaction ? "Transaction updated successfully." : "Transaction saved successfully.");
    beginLoading();
    router.push("/transactions");
    router.refresh();
  }

  return (
    <div className="grid min-w-0 grid-cols-1 gap-6 xl:grid-cols-12">
      <div className="min-w-0 space-y-6 xl:col-span-8">
        <FormCard title="Transaction Type">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            {transactionTypes.map((option) => {
              const isActive = option.type === selectedType;
              return (
                <button
                  aria-pressed={isActive}
                  className={isActive ? `rounded-lg border p-4 text-left transition ${option.activeClassName}` : "rounded-lg border border-[#c6c6cd]/70 bg-[#f8f9ff] p-4 text-left text-[#45464d] transition hover:border-[#2170e4]/50 hover:bg-[#eff4ff]"}
                  key={option.type}
                  onClick={() => handleTypeChange(option.type)}
                  type="button"
                >
                  <span className="mb-3 flex items-center gap-2 text-sm font-bold"><Icon className="size-5" name={option.icon} />{option.type}</span>
                  <span className="block text-xs font-medium leading-5">{option.description}</span>
                </button>
              );
            })}
          </div>
        </FormCard>

        <form className="space-y-6">
          <FormCard title="Transaction Details">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div>
                <FieldLabel>Amount</FieldLabel>
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-sm font-semibold text-[#45464d]">MMK</span>
                  <input
                    aria-invalid={amountHasError}
                    className={`h-12 w-full rounded-lg border bg-white pl-16 pr-4 text-xl font-semibold text-[#0b1c30] outline-none transition placeholder:text-[#a1a1aa] focus:border-[#2170e4] focus:ring-2 focus:ring-[#2170e4]/20 ${amountHasError ? "border-[#ba1a1a]" : "border-[#c6c6cd]"}`}
                    onChange={(event) => setAmount(event.target.value)}
                    placeholder="0"
                    type="number"
                    value={amount}
                  />
                </div>
                {amountHasError ? <p className="mt-1 text-xs font-medium text-[#ba1a1a]">Enter an amount greater than zero.</p> : null}
              </div>
              <div>
                <FieldLabel>Date</FieldLabel>
                <input className={`h-12 w-full rounded-lg border bg-white px-4 text-sm font-medium text-[#0b1c30] outline-none transition focus:border-[#2170e4] focus:ring-2 focus:ring-[#2170e4]/20 ${dateHasError ? "border-[#ba1a1a]" : "border-[#c6c6cd]"}`} onChange={(event) => setTransactionDate(event.target.value)} type="date" value={transactionDate} />
                {dateHasError ? <p className="mt-1 text-xs font-medium text-[#ba1a1a]">Transaction date is required.</p> : null}
              </div>
            </div>

            <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-2">
              <SelectInput label={isTransfer ? "From Account" : "Account"} onChange={handleAccountChange} options={accounts.length > 0 ? getAccountOptionLabels(accounts) : ["No accounts"]} value={selectedAccount ? getAccountOptionLabel(selectedAccount, accounts) : "No accounts"} />
              {isTransfer ? (
                <SelectInput
                  label="To Account"
                  onChange={handleTransferAccountChange}
                  options={getAccountOptionLabels(transferAccountOptions)}
                  value={selectedTransferAccount ? getAccountOptionLabel(selectedTransferAccount, transferAccountOptions) : ""}
                />
              ) : (
                <SelectInput label="Category" onChange={(name) => setCategoryId(transactionCategories.find((category) => category.name === name)?.id ?? "")} options={transactionCategories.length > 0 ? transactionCategories.map((category) => category.name) : ["No categories"]} value={selectedCategory?.name ?? "No categories"} />
              )}
            </div>
            <div className="mt-2 grid grid-cols-1 gap-2 md:grid-cols-2">
              <p className="text-xs font-semibold text-[#76777d]">{selectedAccount ? getAccountOptionDescription(selectedAccount) : ""}</p>
              {isTransfer ? <p className="text-xs font-semibold text-[#76777d]">{selectedTransferAccount ? getAccountOptionDescription(selectedTransferAccount) : ""}</p> : null}
            </div>
            {accountHasError ? <p className="mt-2 text-xs font-medium text-[#ba1a1a]">Select an account.</p> : null}
            {categoryHasError ? <p className="mt-2 text-xs font-medium text-[#ba1a1a]">Select a category.</p> : null}

            <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-2">
              <SelectInput label="Account Amount Type" onChange={setAccountAmountType} options={accountAmountTypeOptions.length > 0 ? accountAmountTypeOptions : ["General"]} value={effectiveAccountAmountType} />
              {isTransfer ? (
                <SelectInput label="To Account Amount Type" onChange={setTransferAccountAmountType} options={transferAccountAmountTypeOptions.length > 0 ? transferAccountAmountTypeOptions : ["General"]} value={effectiveTransferAccountAmountType} />
              ) : (
                <SelectInput label="Status" onChange={setStatus} options={["cleared", "pending", "scheduled"]} value={status} />
              )}
            </div>
            {isTransfer ? (
              <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-2">
                <SelectInput label="Status" onChange={setStatus} options={["cleared", "pending", "scheduled"]} value={status} />
              </div>
            ) : null}
            {transferAmountTypeHasError ? <p className="mt-2 text-xs font-medium text-[#ba1a1a]">Choose a different amount type when transferring within the same account.</p> : null}
            {availableAmountHasError ? <p className="mt-2 text-xs font-medium text-[#ba1a1a]">This {effectiveAccountAmountType} transaction exceeds the available amount for the selected account.</p> : null}
          </FormCard>

          <FormCard title="Additional Information">
            <FieldLabel>Note / Description</FieldLabel>
            <textarea className="min-h-28 w-full resize-none rounded-lg border border-[#c6c6cd] bg-white px-4 py-3 text-sm font-medium text-[#0b1c30] outline-none transition placeholder:text-[#6b7280] focus:border-[#2170e4] focus:ring-2 focus:ring-[#2170e4]/20" onChange={(event) => setNote(event.target.value)} placeholder={isTransfer ? "Transfer purpose or memo..." : "Optional details..."} rows={4} value={note} />
          </FormCard>

          <FormCard title="Transaction Impact">
            <SelectInput
              label={autoLinksCreditCardDebt ? "Credit Card Debt" : "Reflect To Page"}
              onChange={handleRelatedOptionChange}
              options={impactOptions.map((option) => option.label)}
              value={effectiveRelatedOption?.label ?? "No linked record"}
            />
          </FormCard>

          {formError ? (
            <div className="rounded-lg border border-[#fecaca] bg-[#fff1f0] px-4 py-3 text-sm font-medium leading-6 text-[#991b1b]" role="alert">
              {formError}
            </div>
          ) : null}

          <div className="flex flex-col-reverse items-stretch justify-end gap-3 pt-2 sm:flex-row sm:items-center">
            <Link className="inline-flex min-h-11 items-center justify-center rounded-md px-4 text-sm font-semibold text-[#45464d] transition hover:bg-[#eff4ff]" href="/transactions">Cancel</Link>
            <button className="inline-flex min-h-11 items-center justify-center rounded-md border border-[#c6c6cd]/70 bg-[#eff4ff] px-4 text-sm font-semibold text-[#0058be] transition hover:bg-[#dce9ff] disabled:cursor-not-allowed disabled:opacity-60" disabled={isSaving || Boolean(transaction)} onClick={() => handleSaveTransaction(true)} type="button">Save & Add Another</button>
            <LoadingButton className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md bg-[#0b1c30] px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-[#1f2937]" isLoading={isSaving} loadingLabel="Saving…" onClick={() => handleSaveTransaction(false)} type="button">Save Transaction</LoadingButton>
          </div>
        </form>
      </div>

      <aside className="hidden min-w-0 xl:col-span-4 xl:block">
        <div className="sticky top-24 rounded-lg border border-[#c6c6cd]/60 bg-[#eff4ff] p-6 shadow-[0_4px_20px_rgba(15,23,42,0.04)]">
          <div className={`mx-auto mb-5 grid size-20 place-items-center rounded-full shadow-sm ${selectedOption.previewClassName}`}>
            <Icon className="size-10" name={selectedOption.previewIcon} />
          </div>
          <p className="text-center text-xs font-bold uppercase text-[#45464d]">{selectedType} Preview</p>
          <h3 className="mt-2 text-center"><ResponsiveAmount className={`font-bold ${selectedOption.accent}`}>{formatPreviewAmount(amount, selectedType)}</ResponsiveAmount></h3>
          <div className="mt-6 space-y-4 rounded-lg border border-[#c6c6cd]/40 bg-white p-4">
            <div className="flex items-center justify-between gap-4"><span className="text-xs font-bold uppercase text-[#45464d]">Date</span><span className="text-sm font-semibold text-[#0b1c30]">{formatDisplayDate(transactionDate, "-")}</span></div>
            <div className="flex items-center justify-between gap-4"><span className="text-xs font-bold uppercase text-[#45464d]">Account</span><span className="max-w-36 truncate text-sm font-semibold text-[#0b1c30]">{selectedAccount ? getAccountOptionLabel(selectedAccount, accounts) : "No account"}</span></div>
            <div className="flex items-center justify-between gap-4"><span className="text-xs font-bold uppercase text-[#45464d]">Amount Type</span><span className="max-w-36 truncate text-sm font-semibold text-[#0b1c30]">{effectiveAccountAmountType}</span></div>
            <div className="flex items-center justify-between gap-4"><span className="text-xs font-bold uppercase text-[#45464d]">Category</span><span className="max-w-36 truncate text-sm font-semibold text-[#0b1c30]">{isTransfer ? selectedTransferAccount ? getAccountOptionLabel(selectedTransferAccount, transferAccountOptions) : "No account" : selectedCategory?.name ?? "No category"}</span></div>
            {isTransfer ? <div className="flex items-center justify-between gap-4"><span className="text-xs font-bold uppercase text-[#45464d]">To Amount Type</span><span className="max-w-36 truncate text-sm font-semibold text-[#0b1c30]">{effectiveTransferAccountAmountType}</span></div> : null}
            <div className="flex items-center justify-between gap-4"><span className="text-xs font-bold uppercase text-[#45464d]">Reflects</span><span className="max-w-36 truncate text-sm font-semibold text-[#0b1c30]">{effectiveRelatedOption?.label ?? "No linked record"}</span></div>
            <div className="border-t border-[#c6c6cd]/40 pt-4"><span className="text-xs font-bold uppercase text-[#45464d]">Note</span><p className="mt-1 line-clamp-3 text-sm font-semibold text-[#0b1c30]">{note.trim() || "Add transaction note"}</p></div>
          </div>
        </div>
      </aside>
    </div>
  );
}
