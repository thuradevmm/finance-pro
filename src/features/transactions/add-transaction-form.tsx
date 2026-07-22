"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { useId, useMemo, useState } from "react";

import { createTransaction, updateTransaction } from "@/app/transactions/actions";
import { useInteractionLoading } from "@/components/app/interaction-loading-provider";
import { DateInput } from "@/components/ui/date-input";
import { Icon, type IconName } from "@/components/ui/icon";
import { LoadingButton } from "@/components/ui/loading-state";
import { ResponsiveAmount } from "@/components/ui/responsive-amount";
import { useToast } from "@/components/ui/toast-provider";
import { SYSTEM_CURRENCY, formatCurrencyAmount, formatMmkPreview } from "@/lib/currency";
import { formatDisplayDate } from "@/lib/date-format";
import { getCategoriesForScope } from "@/lib/categories/category-scopes";
import { calculateDebtPayoffSummary } from "@/lib/debts/emi";
import { findAccountByOptionLabel, getAccountOptionDescription, getAccountOptionLabel, getAccountOptionLabels, type AccountRecord } from "@/lib/accounts/supabase";
import type { CategoryRecord } from "@/lib/categories/supabase";
import { hasAdditionalAutomaticCreditCardDebtImpact } from "@/lib/transactions/impact";
import type { TransactionFormData, TransactionRecord, TransactionRelatedEntityType, TransactionRelatedOption } from "@/lib/transactions/supabase";
import { normalizeTransactionStatus, transactionStatusLabel, transactionStatusReservesWorkingBalance } from "@/lib/transactions/status";
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

export type TransactionFormInitialValues = {
  accountId?: string;
  amount?: string;
  date?: string;
  note?: string;
  relatedEntityId?: string;
  relatedEntityType?: TransactionRelatedEntityType;
  type?: TransactionType;
};

function FieldLabel({ children, htmlFor }: { children: string; htmlFor: string }) {
  return <label className="mb-2 block text-xs font-bold uppercase text-[#45464d]" htmlFor={htmlFor}>{children}</label>;
}

function FormCard({ children, title }: { children: ReactNode; title: string }) {
  return (
    <section className="rounded-lg border border-[#c6c6cd]/60 bg-white p-4 shadow-[0_4px_20px_rgba(15,23,42,0.04)] sm:p-5">
      <h2 className="mb-5 text-lg font-semibold text-[#0b1c30] sm:text-xl">{title}</h2>
      {children}
    </section>
  );
}

function SelectInput({ disabled = false, label, onChange, options, value }: { disabled?: boolean; label: string; onChange: (value: string) => void; options: string[]; value: string }) {
  const inputId = useId();

  return (
    <div>
      <FieldLabel htmlFor={inputId}>{label}</FieldLabel>
      <div className="relative">
        <select
          className="h-12 w-full appearance-none rounded-lg border border-[#c6c6cd] bg-white px-4 pr-12 text-sm font-medium text-[#0b1c30] outline-none transition focus:border-[#2170e4] focus:ring-2 focus:ring-[#2170e4]/20"
          disabled={disabled}
          id={inputId}
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

function parseAmountInput(value: string) {
  const number = Number(value.replace(/[^0-9.-]/g, ""));
  return Number.isFinite(number) ? number : 0;
}

function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function isCreditCardAccount(account: AccountRecord | undefined) {
  return account?.type === "Credit Card";
}

function accountAmountTypeOptionsFor(account: AccountRecord | undefined) {
  if (!account) return [];
  if (isCreditCardAccount(account)) return ["Credit Card"];
  return account.balanceBreakdowns.map((breakdown) => breakdown.type);
}

function transferFromAmountType(transaction: TransactionRecord) {
  if (transaction.transferDirection === "Credit") return transaction.transferAccountAmountType ?? transaction.accountAmountType;
  return transaction.accountAmountType;
}

function transferToAmountType(transaction: TransactionRecord) {
  if (transaction.transferDirection === "Credit") return transaction.accountAmountType;
  return transaction.transferAccountAmountType ?? transaction.accountAmountType;
}

function editedTransactionBalanceAdjustment(transaction: TransactionRecord | undefined, accountId: string, amountType: string) {
  if (!transaction || !transactionStatusReservesWorkingBalance(transaction.status)) return 0;

  const amountValue = transaction.amountValue ?? 0;
  if (transaction.type === "Income" && transaction.accountId === accountId && transaction.accountAmountType === amountType) return -amountValue;
  if (transaction.type === "Expense" && transaction.accountId === accountId && transaction.accountAmountType === amountType) return amountValue;
  if (transaction.type !== "Transfer") return 0;

  if (transaction.transferFromAccountId === accountId && transferFromAmountType(transaction) === amountType) return amountValue;
  if (transaction.transferToAccountId === accountId && transferToAmountType(transaction) === amountType) return -amountValue;
  return 0;
}

export function AddTransactionForm({
  accounts,
  categories,
  initialValues,
  relatedOptions,
  transaction,
}: {
  accounts: AccountRecord[];
  categories: CategoryRecord[];
  initialValues?: TransactionFormInitialValues;
  relatedOptions: TransactionRelatedOption[];
  transaction?: TransactionRecord;
}) {
  const { showError, showSuccess } = useToast();
  const router = useRouter();
  const beginLoading = useInteractionLoading();
  const amountInputId = useId();
  const dateInputId = useId();
  const noteInputId = useId();
  const subscriptionBilledAmountInputId = useId();
  const subscriptionExchangeRateInputId = useId();
  const [selectedType, setSelectedType] = useState<TransactionType>(transaction?.type ?? initialValues?.type ?? "Expense");
  const [amount, setAmount] = useState(transaction ? String(transaction.amountValue) : initialValues?.amount ?? "");
  const [transactionDate, setTransactionDate] = useState(transaction?.dateValue ?? initialValues?.date ?? new Date().toISOString().slice(0, 10));
  const initialTransferFromAccountId = transaction?.type === "Transfer" ? transaction.transferFromAccountId || transaction.accountId : transaction?.accountId;
  const initialTransferToAccountId = transaction?.type === "Transfer" ? transaction.transferToAccountId || transaction.transferAccountId : transaction?.transferAccountId;
  const initialTransferFromAmountType = transaction?.type === "Transfer" && transaction.transferDirection === "Credit"
    ? transaction.transferAccountAmountType
    : transaction?.accountAmountType;
  const initialTransferToAmountType = transaction?.type === "Transfer" && transaction.transferDirection === "Credit"
    ? transaction.accountAmountType
    : transaction?.transferAccountAmountType;
  const initialAccountId = initialTransferFromAccountId ?? initialValues?.accountId ?? accounts[0]?.id ?? "";
  const initialAccount = accounts.find((account) => account.id === initialAccountId) ?? accounts[0];
  const [accountId, setAccountId] = useState(initialAccountId);
  const [accountAmountType, setAccountAmountType] = useState(initialTransferFromAmountType ?? accountAmountTypeOptionsFor(initialAccount)[0] ?? "Operation");
  const [transferToAccountId, setTransferToAccountId] = useState(initialTransferToAccountId ?? accounts.find((account) => account.id !== accountId)?.id ?? accounts[0]?.id ?? "");
  const [transferAccountAmountType, setTransferAccountAmountType] = useState(initialTransferToAmountType ?? accountAmountTypeOptionsFor(accounts.find((account) => account.id !== accountId) ?? accounts[0])[0] ?? "Operation");
  const transactionCategories = useMemo(() => getCategoriesForScope(categories, "Transactions", selectedType === "Income" ? "Income" : "Expense"), [categories, selectedType]);
  const [categoryId, setCategoryId] = useState(transaction?.categoryId ?? transactionCategories[0]?.id ?? "");
  const [status, setStatus] = useState(transaction?.status ?? "cleared");
  const [note, setNote] = useState(transaction?.note ?? initialValues?.note ?? "");
  const [subscriptionPaymentDraft, setSubscriptionPaymentDraft] = useState({ billedAmount: "", exchangeRate: "", key: "" });
  const [relatedOptionValue, setRelatedOptionValue] = useState(
    transaction?.relatedEntityType && transaction.relatedEntityType !== "none"
      ? `${transaction.relatedEntityType}:${transaction.relatedEntityId}`
      : initialValues?.relatedEntityType && initialValues.relatedEntityType !== "none"
        ? `${initialValues.relatedEntityType}:${initialValues.relatedEntityId ?? ""}`
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
  const selectedRelatedOption = relatedOptions.find((option) => `${option.type}:${option.value}` === relatedOptionValue) ?? relatedOptions[0];
  const isTransfer = selectedType === "Transfer";
  const isCreditCardCharge = isCreditCardAccount(selectedAccount) && (selectedType === "Expense" || selectedType === "Transfer");
  const isCreditCardPayment = isTransfer && isCreditCardAccount(selectedTransferAccount);
  const autoLinksCreditCardDebt = isCreditCardCharge || isCreditCardPayment;
  const usesExplicitPageLink = Boolean(selectedRelatedOption && selectedRelatedOption.type !== "none" && selectedRelatedOption.type !== "debt");
  const impactOptions = useMemo(() => {
    if (!autoLinksCreditCardDebt || usesExplicitPageLink) return relatedOptions;
    return [automaticCreditCardDebtOption, ...relatedOptions];
  }, [autoLinksCreditCardDebt, relatedOptions, usesExplicitPageLink]);
  const effectiveRelatedOption = autoLinksCreditCardDebt && !usesExplicitPageLink && (!selectedRelatedOption || selectedRelatedOption.type !== "debt" || !selectedRelatedOption.value)
    ? impactOptions[0] ?? selectedRelatedOption
    : selectedRelatedOption;
  const linkedBudgetCategoryId = effectiveRelatedOption?.type === "budget" ? effectiveRelatedOption.categoryId ?? "" : "";
  const effectiveCategoryId = linkedBudgetCategoryId || categoryId;
  const selectedCategory = transactionCategories.find((category) => category.id === effectiveCategoryId)
    ?? categories.find((category) => category.id === effectiveCategoryId);
  const debtPayoffSummary = useMemo(() => {
    const payoff = effectiveRelatedOption?.debtPayoff;
    if (!payoff) return null;
    return calculateDebtPayoffSummary({
      interestRate: payoff.interestRate,
      interestRatePeriod: payoff.interestRatePeriod,
      numberOfMonths: payoff.durationMonths,
      openingRepaidAmount: payoff.openingRepaidAmount,
      principal: payoff.totalAmount,
      referenceDate: transactionDate,
      repayments: payoff.repayments,
      settledAt: payoff.settledAt,
      settledEarly: payoff.settledEarly,
      startDate: payoff.startDate,
    });
  }, [effectiveRelatedOption, transactionDate]);
  const debtPayoffQuote = debtPayoffSummary?.currentQuote;
  const subscriptionPayment = effectiveRelatedOption?.subscriptionPayment;
  const subscriptionPaymentKey = subscriptionPayment ? `${effectiveRelatedOption?.type}:${effectiveRelatedOption?.value}` : "";
  const subscriptionBilledAmount = subscriptionPayment && subscriptionPaymentDraft.key === subscriptionPaymentKey
    ? subscriptionPaymentDraft.billedAmount
    : subscriptionPayment ? String(subscriptionPayment.billedAmount || "") : "";
  const subscriptionExchangeRate = subscriptionPayment && subscriptionPaymentDraft.key === subscriptionPaymentKey
    ? subscriptionPaymentDraft.exchangeRate
    : subscriptionPayment && subscriptionPayment.billingCurrency !== SYSTEM_CURRENCY ? String(subscriptionPayment.exchangeRate || "") : "";
  const subscriptionPaymentBilledAmountValue = subscriptionPayment
    ? parseAmountInput(subscriptionBilledAmount) || subscriptionPayment.billedAmount
    : 0;
  const subscriptionPaymentExchangeRateValue = subscriptionPayment
    ? subscriptionPayment.billingCurrency === SYSTEM_CURRENCY
      ? 1
      : parseAmountInput(subscriptionExchangeRate) || subscriptionPayment.exchangeRate
    : 0;
  const subscriptionPaymentAmountValue = subscriptionPayment
    ? roundMoney(subscriptionPaymentBilledAmountValue * subscriptionPaymentExchangeRateValue)
    : 0;
  const isForeignSubscriptionPayment = Boolean(subscriptionPayment && subscriptionPayment.billingCurrency !== SYSTEM_CURRENCY);
  const isCreditCardDebtPayment = selectedType === "Expense"
    && Boolean(effectiveRelatedOption?.creditCardDebt)
    && selectedAccount?.id !== effectiveRelatedOption?.creditCardDebt?.accountId;
  const hasSecondaryCreditCardDebtImpact = hasAdditionalAutomaticCreditCardDebtImpact(isCreditCardCharge, effectiveRelatedOption);
  const amountNumber = Number(amount);
  const amountHasError = showErrors && (!Number.isFinite(amountNumber) || amountNumber <= 0);
  const dateHasError = showErrors && !transactionDate;
  const accountHasError = showErrors && !accountId;
  const transferAmountTypeHasError = showErrors && isTransfer && accountId === effectiveTransferToAccountId && effectiveAccountAmountType === effectiveTransferAccountAmountType;
  const categoryHasError = showErrors && !isTransfer && !effectiveCategoryId;
  const selectedAvailableBreakdown = selectedAccount?.availableBreakdowns.find((breakdown) => breakdown.type === effectiveAccountAmountType);
  const availableAmountValue = (selectedAvailableBreakdown?.amountValue ?? 0) + editedTransactionBalanceAdjustment(transaction, accountId, effectiveAccountAmountType);
  const shouldValidateAvailableAmount = transactionStatusReservesWorkingBalance(status)
    && !isCreditCardAccount(selectedAccount)
    && (selectedType === "Expense" || selectedType === "Transfer");
  const availableAmountHasError = showErrors && shouldValidateAvailableAmount && Number.isFinite(amountNumber) && amountNumber > availableAmountValue;

  function handleTypeChange(type: TransactionType) {
    setSelectedType(type);
    const nextCategories = getCategoriesForScope(categories, "Transactions", type === "Income" ? "Income" : "Expense");
    setCategoryId(nextCategories[0]?.id ?? "");
    if (type !== "Expense" && selectedRelatedOption?.type === "budget") setRelatedOptionValue("none:");
  }

  function handleRelatedOptionChange(label: string) {
    const nextOption = impactOptions.find((option) => option.label === label) ?? impactOptions[0] ?? relatedOptions[0];
    setRelatedOptionValue(`${nextOption.type}:${nextOption.value}`);
    if (nextOption.type === "budget") {
      setSelectedType("Expense");
      setCategoryId(nextOption.categoryId ?? "");
    }
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

  function updateSubscriptionPaymentDraft(field: "billedAmount" | "exchangeRate", value: string) {
    setSubscriptionPaymentDraft((currentDraft) => ({
      billedAmount: field === "billedAmount"
        ? value
        : currentDraft.key === subscriptionPaymentKey ? currentDraft.billedAmount : subscriptionBilledAmount,
      exchangeRate: field === "exchangeRate"
        ? value
        : currentDraft.key === subscriptionPaymentKey ? currentDraft.exchangeRate : subscriptionExchangeRate,
      key: subscriptionPaymentKey,
    }));
  }

  function handleUseDebtPayoffAmount() {
    if (!debtPayoffQuote || debtPayoffQuote.payoffAmount <= 0) return;
    if (selectedType !== "Expense") handleTypeChange("Expense");
    setAmount(String(debtPayoffQuote.payoffAmount));
    if (!note.trim() && effectiveRelatedOption?.label) {
      setNote(`${effectiveRelatedOption.label.replace(/^Debt:\s*/, "")} payoff`);
    }
  }

  function handleUseSubscriptionPaymentAmount() {
    if (!subscriptionPayment || subscriptionPaymentAmountValue <= 0) return;
    if (selectedType !== "Expense") handleTypeChange("Expense");
    setAmount(String(subscriptionPaymentAmountValue));
    if (!note.trim() && effectiveRelatedOption?.label) {
      setNote(`${effectiveRelatedOption.label.replace(/^Subscription:\s*/, "")} payment`);
    }
  }

  async function handleSaveTransaction(addAnother = false) {
    const hasInsufficientAvailableAmount = shouldValidateAvailableAmount && Number.isFinite(amountNumber) && amountNumber > availableAmountValue;
    const hasSameTransferEndpoint = isTransfer && accountId === effectiveTransferToAccountId && effectiveAccountAmountType === effectiveTransferAccountAmountType;
    const hasErrors = !Number.isFinite(amountNumber) || amountNumber <= 0 || !transactionDate || !accountId || hasInsufficientAvailableAmount || hasSameTransferEndpoint || (isTransfer && !effectiveTransferToAccountId) || (!isTransfer && !effectiveCategoryId);
    setShowErrors(hasErrors);
    setFormError("");
    if (hasErrors) return;

    const input: TransactionFormData = {
      accountId,
      accountAmountType: effectiveAccountAmountType,
      amount: amountNumber,
      categoryId: effectiveCategoryId,
      date: transactionDate,
      note,
      relatedEntityId: effectiveRelatedOption?.value ?? "",
      relatedEntityType: effectiveRelatedOption?.type ?? "none",
      status,
      subscriptionPayment: subscriptionPayment && subscriptionPaymentBilledAmountValue > 0 && subscriptionPaymentExchangeRateValue > 0
        ? {
          billedAmount: subscriptionPaymentBilledAmountValue,
          billingCurrency: subscriptionPayment.billingCurrency,
          billingDueDate: subscriptionPayment.nextBillingDate || transactionDate,
          exchangeRate: subscriptionPaymentExchangeRateValue,
        }
        : undefined,
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

    if (result.warning) showError(result.warning);
    else showSuccess(transaction ? "Transaction updated successfully." : "Transaction saved successfully.");
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
                <FieldLabel htmlFor={amountInputId}>Amount</FieldLabel>
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-sm font-semibold text-[#45464d]">MMK</span>
                  <input
                    aria-invalid={amountHasError}
                    className={`h-12 w-full rounded-lg border bg-white pl-16 pr-4 text-xl font-semibold text-[#0b1c30] outline-none transition placeholder:text-[#a1a1aa] focus:border-[#2170e4] focus:ring-2 focus:ring-[#2170e4]/20 ${amountHasError ? "border-[#ba1a1a]" : "border-[#c6c6cd]"}`}
                    id={amountInputId}
                    onChange={(event) => setAmount(event.target.value)}
                    onWheel={(event) => event.currentTarget.blur()}
                    placeholder="0"
                    type="number"
                    value={amount}
                  />
                </div>
                {amountHasError ? <p className="mt-1 text-xs font-medium text-[#ba1a1a]">Enter an amount greater than zero.</p> : null}
              </div>
              <div>
                <FieldLabel htmlFor={dateInputId}>Date</FieldLabel>
                <DateInput error={dateHasError} id={dateInputId} label="Date" onChange={setTransactionDate} value={transactionDate} />
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
                <div>
                  <SelectInput disabled={Boolean(linkedBudgetCategoryId)} label="Category" onChange={(name) => setCategoryId(transactionCategories.find((category) => category.name === name)?.id ?? "")} options={transactionCategories.length > 0 ? transactionCategories.map((category) => category.name) : ["No categories"]} value={selectedCategory?.name ?? "No categories"} />
                  {linkedBudgetCategoryId ? <p className="mt-1 text-xs font-medium text-[#45464d]">The linked budget sets this category.</p> : null}
                </div>
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
                <SelectInput label="Status" onChange={(value) => setStatus(normalizeTransactionStatus(value))} options={["Cleared", "Pending", "Scheduled"]} value={transactionStatusLabel(status)} />
              )}
            </div>
            {isTransfer ? (
              <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-2">
                <SelectInput label="Status" onChange={(value) => setStatus(normalizeTransactionStatus(value))} options={["Cleared", "Pending", "Scheduled"]} value={transactionStatusLabel(status)} />
              </div>
            ) : null}
            {transferAmountTypeHasError ? <p className="mt-2 text-xs font-medium text-[#ba1a1a]">Choose a different amount type when transferring within the same account.</p> : null}
            {availableAmountHasError ? <p className="mt-2 text-xs font-medium text-[#ba1a1a]">This {effectiveAccountAmountType} transaction exceeds the available amount for the selected account.</p> : null}
          </FormCard>

          <FormCard title="Additional Information">
            <FieldLabel htmlFor={noteInputId}>Note / Description</FieldLabel>
            <textarea className="min-h-28 w-full resize-none rounded-lg border border-[#c6c6cd] bg-white px-4 py-3 text-sm font-medium text-[#0b1c30] outline-none transition placeholder:text-[#6b7280] focus:border-[#2170e4] focus:ring-2 focus:ring-[#2170e4]/20" id={noteInputId} onChange={(event) => setNote(event.target.value)} placeholder={isTransfer ? "Transfer purpose or memo..." : "Optional details..."} rows={4} value={note} />
          </FormCard>

          <FormCard title="Transaction Impact">
            <SelectInput
              label={hasSecondaryCreditCardDebtImpact ? "Primary Impact" : autoLinksCreditCardDebt || isCreditCardDebtPayment ? "Credit Card Debt" : "Reflect To Page"}
              onChange={handleRelatedOptionChange}
              options={impactOptions.map((option) => option.label)}
              value={effectiveRelatedOption?.label ?? "No linked record"}
            />
            {isCreditCardDebtPayment ? (
              <div className="mt-4 grid gap-3 rounded-lg border border-[#bfdbfe] bg-[#eff6ff] p-4 sm:grid-cols-[auto_minmax(0,1fr)]">
                <span className="grid size-10 place-items-center rounded-md bg-white text-[#0058be]">
                  <Icon className="size-5" name="credit" />
                </span>
                <div className="min-w-0">
                  <p className="text-xs font-bold uppercase text-[#0058be]">Credit Card Payment</p>
                  <p className="mt-1 text-sm font-semibold text-[#0b1c30]">Restores available credit on {effectiveRelatedOption?.creditCardDebt?.accountName || "the linked card"}</p>
                  <p className="mt-1 text-xs font-semibold text-[#45464d]">This reduces the payment account and card debt. It does not change the configured credit limit or count as new spending.</p>
                </div>
              </div>
            ) : null}
            {hasSecondaryCreditCardDebtImpact ? (
              <div className="mt-4 grid gap-3 rounded-lg border border-[#fecaca] bg-[#fffafa] p-4 sm:grid-cols-[auto_minmax(0,1fr)]">
                <span className="grid size-10 place-items-center rounded-md bg-[#fff1f0] text-[#b42318]">
                  <Icon className="size-5" name="credit" />
                </span>
                <div className="min-w-0">
                  <p className="text-xs font-bold uppercase text-[#b42318]">Additional Impact</p>
                  <p className="mt-1 text-sm font-semibold text-[#0b1c30]">Automatic Credit Card Debt</p>
                  <p className="mt-1 text-xs font-semibold text-[#45464d]">This credit card charge will keep the selected primary impact and increase the card debt balance.</p>
                </div>
              </div>
            ) : null}
            {subscriptionPayment ? (
              <div className="mt-4 rounded-lg border border-[#c6c6cd]/70 bg-[#f8f9ff] p-4">
                <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <p className="text-xs font-bold uppercase text-[#45464d]">Subscription Payment</p>
                    <p className="mt-1 text-sm font-semibold text-[#0b1c30]">{subscriptionPayment.billingCycle} billing · {subscriptionPayment.nextBillingDate ? formatDisplayDate(subscriptionPayment.nextBillingDate) : "No due date"}</p>
                  </div>
                  <button
                    className="inline-flex min-h-11 w-full shrink-0 items-center justify-center gap-2 rounded-md bg-[#0b1c30] px-3 text-xs font-semibold text-white transition hover:bg-[#1f2937] sm:min-h-10 sm:w-auto"
                    onClick={handleUseSubscriptionPaymentAmount}
                    type="button"
                  >
                    <Icon className="size-4" name="check" />
                    Use Amount
                  </button>
                </div>
                <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
                  <div>
                    <FieldLabel htmlFor={subscriptionBilledAmountInputId}>Billed Amount</FieldLabel>
                    <input
                      className="h-11 w-full rounded-md border border-[#c6c6cd] bg-white px-3 text-sm font-semibold text-[#0b1c30] outline-none transition focus:border-[#2170e4] focus:ring-2 focus:ring-[#2170e4]/20"
                      id={subscriptionBilledAmountInputId}
                      onChange={(event) => updateSubscriptionPaymentDraft("billedAmount", event.target.value)}
                      onWheel={(event) => event.currentTarget.blur()}
                      type="number"
                      value={subscriptionBilledAmount}
                    />
                  </div>
                  {isForeignSubscriptionPayment ? (
                    <div>
                      <FieldLabel htmlFor={subscriptionExchangeRateInputId}>Payment Exchange Rate</FieldLabel>
                      <input
                        className="h-11 w-full rounded-md border border-[#c6c6cd] bg-white px-3 text-sm font-semibold text-[#0b1c30] outline-none transition focus:border-[#2170e4] focus:ring-2 focus:ring-[#2170e4]/20"
                        id={subscriptionExchangeRateInputId}
                        onChange={(event) => updateSubscriptionPaymentDraft("exchangeRate", event.target.value)}
                        onWheel={(event) => event.currentTarget.blur()}
                        type="number"
                        value={subscriptionExchangeRate}
                      />
                    </div>
                  ) : (
                    <div>
                      <span className="mb-2 block text-xs font-bold uppercase text-[#45464d]">Payment Exchange Rate</span>
                      <div className="flex h-11 items-center rounded-md border border-[#c6c6cd] bg-white px-3 text-sm font-semibold text-[#45464d]">No conversion</div>
                    </div>
                  )}
                </div>
                <dl className="mt-4 grid grid-cols-1 gap-3 text-sm sm:grid-cols-3">
                  <div className="min-w-0 rounded-md bg-white px-3 py-2">
                    <dt className="text-xs font-bold uppercase text-[#45464d]">Billed</dt>
                    <dd className="mt-1 font-semibold text-[#0b1c30]"><ResponsiveAmount maxSizeRem={0.875}>{formatCurrencyAmount(subscriptionPaymentBilledAmountValue, subscriptionPayment.billingCurrency)}</ResponsiveAmount></dd>
                  </div>
                  <div className="min-w-0 rounded-md bg-white px-3 py-2">
                    <dt className="text-xs font-bold uppercase text-[#45464d]">Rate</dt>
                    <dd className="mt-1 font-semibold text-[#0b1c30]"><ResponsiveAmount maxSizeRem={0.875}>{isForeignSubscriptionPayment ? `1 ${subscriptionPayment.billingCurrency} = ${formatMmkPreview(subscriptionPaymentExchangeRateValue)}` : "No conversion"}</ResponsiveAmount></dd>
                  </div>
                  <div className="min-w-0 rounded-md bg-white px-3 py-2">
                    <dt className="text-xs font-bold uppercase text-[#45464d]">Payment</dt>
                    <dd className="mt-1 font-semibold text-[#0b1c30]"><ResponsiveAmount maxSizeRem={0.875}>{formatMmkPreview(subscriptionPaymentAmountValue)}</ResponsiveAmount></dd>
                  </div>
                </dl>
              </div>
            ) : null}
            {debtPayoffQuote && debtPayoffQuote.payoffAmount > 0 ? (
              <div className="mt-4 rounded-lg border border-[#bfdbfe] bg-[#eff6ff] p-4">
                <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <p className="text-xs font-bold uppercase text-[#0058be]">Debt Payoff</p>
                    <p className="mt-1 text-sm font-semibold text-[#0b1c30]">{formatDisplayDate(debtPayoffQuote.asOfDate)}</p>
                  </div>
                  <button
                    className="inline-flex min-h-11 w-full shrink-0 items-center justify-center gap-2 rounded-md bg-[#0b1c30] px-3 text-xs font-semibold text-white transition hover:bg-[#1f2937] sm:min-h-10 sm:w-auto"
                    onClick={handleUseDebtPayoffAmount}
                    type="button"
                  >
                    <Icon className="size-4" name="check" />
                    Use Payoff
                  </button>
                </div>
                <dl className="mt-4 grid grid-cols-1 gap-3 text-sm sm:grid-cols-3">
                  <div className="min-w-0 rounded-md bg-white px-3 py-2">
                    <dt className="text-xs font-bold uppercase text-[#45464d]">Principal</dt>
                    <dd className="mt-1 font-semibold text-[#0b1c30]"><ResponsiveAmount maxSizeRem={0.875}>{formatMmkPreview(debtPayoffQuote.principalOutstandingAmount)}</ResponsiveAmount></dd>
                  </div>
                  <div className="min-w-0 rounded-md bg-white px-3 py-2">
                    <dt className="text-xs font-bold uppercase text-[#45464d]">Interest</dt>
                    <dd className="mt-1 font-semibold text-[#0b1c30]"><ResponsiveAmount maxSizeRem={0.875}>{formatMmkPreview(debtPayoffQuote.accruedInterestAmount)}</ResponsiveAmount></dd>
                  </div>
                  <div className="min-w-0 rounded-md bg-white px-3 py-2">
                    <dt className="text-xs font-bold uppercase text-[#45464d]">Payoff</dt>
                    <dd className="mt-1 font-semibold text-[#0b1c30]"><ResponsiveAmount maxSizeRem={0.875}>{formatMmkPreview(debtPayoffQuote.payoffAmount)}</ResponsiveAmount></dd>
                  </div>
                </dl>
              </div>
            ) : null}
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
