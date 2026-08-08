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
import { SYSTEM_CURRENCY, cleanAmountInputValue, formatAmountInputValue, formatCurrencyAmount, formatMmkPreview } from "@/lib/currency";
import { exchangeRateFor, type CurrencySettings } from "@/lib/currency-conversion";
import { formatDisplayDate, localDateInputValue } from "@/lib/date-format";
import { getCategoriesForScope } from "@/lib/categories/category-scopes";
import { calculateDebtPayoffSummary } from "@/lib/debts/emi";
import type { FuturePlanningTransactionOption } from "@/lib/future-planning/supabase";
import { futurePlanningDirectionSupportsTransactionType } from "@/lib/future-planning/transaction-link";
import { findContextualPlanningOption, planningOptionMatchesTransaction } from "@/lib/future-planning/transaction-option";
import { accountCategoryLabel, getAccountCategoryForId, getAccountCategoryOptions, getAccountsForCategory } from "@/lib/accounts/selection";
import { findAccountByOptionLabel, getAccountOptionDescription, getAccountOptionLabel, getAccountOptionLabels, type AccountRecord } from "@/lib/accounts/supabase";
import type { CategoryRecord } from "@/lib/categories/supabase";
import { hasAdditionalAutomaticCreditCardDebtImpact, relatedImpactRecordName, relatedImpactSupportsTransactionType } from "@/lib/transactions/impact";
import type { TransactionFormData, TransactionRecord, TransactionRelatedEntityType, TransactionRelatedOption } from "@/lib/transactions/supabase";
import { calculateTransactionRemainingAmount } from "@/lib/transactions/remaining-amount";
import { normalizeTransactionStatus, transactionStatusLabel, transactionStatusReservesWorkingBalance } from "@/lib/transactions/status";
import { transactionTypeLabel } from "@/lib/transactions/terminology";
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
  { type: "Expense", description: "Money used or paid from an account", icon: "trendingDown", previewIcon: "receipt", accent: "text-[#b42318]", activeClassName: "border-[#fca5a5] bg-[#fff1f0] text-[#991b1b] shadow-sm", previewClassName: "bg-[#b42318] text-white" },
  { type: "Income", description: "Money credited to an account", icon: "trendingUp", previewIcon: "trendingUp", accent: "text-[#047857]", activeClassName: "border-[#86efac] bg-[#ecfdf5] text-[#166534] shadow-sm", previewClassName: "bg-[#047857] text-white" },
  { type: "Transfer", description: "Move money between accounts", icon: "sync", previewIcon: "sync", accent: "text-[#4f46e5]", activeClassName: "border-[#c7d2fe] bg-[#eef2ff] text-[#3730a3] shadow-sm", previewClassName: "bg-[#4f46e5] text-white" },
];

const automaticCreditCardDebtOption: TransactionRelatedOption = {
  label: "Automatic Credit Card Borrowing",
  type: "debt",
  value: "",
};

type ManualImpactType = Exclude<TransactionRelatedEntityType, "none">;

const manualImpactTypes: Array<{
  description: string;
  icon: IconName;
  label: string;
  type: ManualImpactType;
}> = [
  { description: "Add to or use a savings fund", icon: "target", label: "Savings Goal / Fund", type: "savings_goal" },
  { description: "Record a repayment or lending return", icon: "credit", label: "Borrowing & Lending", type: "debt" },
  { description: "Record a recurring payment", icon: "subscriptions", label: "Subscription", type: "subscription" },
  { description: "Record an asset purchase", icon: "box", label: "Asset", type: "asset" },
];

export type TransactionFormInitialValues = {
  accountId?: string;
  amount?: string;
  date?: string;
  note?: string;
  relatedEntityId?: string;
  relatedEntityType?: TransactionRelatedEntityType;
  type?: TransactionType;
  transferAccountAmountType?: string;
  transferAccountId?: string;
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

function accountAvailableAmount(account: AccountRecord | undefined, amountType: string) {
  if (!account) return 0;
  if (isCreditCardAccount(account)) return account.creditAvailableValue;
  return account.availableBreakdowns.find((breakdown) => breakdown.type === amountType)?.amountValue ?? 0;
}

function RemainingAmount({
  amountType,
  currency,
  value,
}: {
  amountType: string;
  currency: string;
  value: number;
}) {
  return (
    <div className="mt-2 flex min-w-0 items-center justify-between gap-3 rounded-md bg-[#f8f9ff] px-3 py-2 text-xs">
      <span className="min-w-0 truncate font-semibold text-[#45464d]">Remaining amount · {amountType}</span>
      <ResponsiveAmount className={`shrink-0 font-bold ${value < 0 ? "text-[#ba1a1a]" : "text-[#0b1c30]"}`} maxSizeRem={0.875}>
        {formatCurrencyAmount(value, currency)}
      </ResponsiveAmount>
    </div>
  );
}

export function AddTransactionForm({
  accounts,
  categories,
  currencySettings,
  initialValues,
  planningOptions,
  relatedOptions,
  transaction,
}: {
  accounts: AccountRecord[];
  categories: CategoryRecord[];
  currencySettings: CurrencySettings;
  initialValues?: TransactionFormInitialValues;
  planningOptions: FuturePlanningTransactionOption[];
  relatedOptions: TransactionRelatedOption[];
  transaction?: TransactionRecord;
}) {
  const { showError, showSuccess } = useToast();
  const router = useRouter();
  const beginLoading = useInteractionLoading();
  const amountInputId = useId();
  const dateInputId = useId();
  const noteInputId = useId();
  const impactRecordInputId = useId();
  const [selectedType, setSelectedType] = useState<TransactionType>(transaction?.type ?? initialValues?.type ?? "Expense");
  const [amount, setAmount] = useState(transaction
    ? String(transaction.type === "Transfer" && transaction.transferDirection === "Credit"
      ? transaction.transferAmount ?? transaction.amountValue
      : transaction.amountValue)
    : initialValues?.amount ?? "");
  const [transactionDate, setTransactionDate] = useState(transaction?.dateValue ?? initialValues?.date ?? localDateInputValue());
  const [futurePlanningAmountId, setFuturePlanningAmountId] = useState(transaction?.futurePlanningAmountId ?? "");
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
  const [accountCategory, setAccountCategory] = useState(getAccountCategoryForId(accounts, initialAccount?.id ?? ""));
  const [accountId, setAccountId] = useState(initialAccountId);
  const [accountAmountType, setAccountAmountType] = useState(initialTransferFromAmountType ?? accountAmountTypeOptionsFor(initialAccount)[0] ?? "Operation");
  const initialDestinationAccountId = initialTransferToAccountId ?? initialValues?.transferAccountId;
  const initialDestinationAccount = accounts.find((account) => account.id === initialDestinationAccountId)
    ?? accounts.find((account) => account.id !== accountId)
    ?? accounts[0];
  const [transferAccountCategory, setTransferAccountCategory] = useState(getAccountCategoryForId(accounts, initialDestinationAccount?.id ?? ""));
  const [transferToAccountId, setTransferToAccountId] = useState(initialDestinationAccount?.id ?? "");
  const [transferAccountAmountType, setTransferAccountAmountType] = useState(initialTransferToAmountType ?? initialValues?.transferAccountAmountType ?? accountAmountTypeOptionsFor(initialDestinationAccount)[0] ?? "Operation");
  const transactionCategories = useMemo(() => getCategoriesForScope(categories, "Transactions", selectedType === "Income" ? "Income" : "Expense"), [categories, selectedType]);
  const [categoryId, setCategoryId] = useState(transaction?.categoryId ?? transactionCategories[0]?.id ?? "");
  const [status, setStatus] = useState(transaction?.status ?? "cleared");
  const [note, setNote] = useState(transaction?.note ?? initialValues?.note ?? "");
  const [relatedOptionValue, setRelatedOptionValue] = useState(
    transaction?.relatedEntityType && transaction.relatedEntityType !== "none"
      ? `${transaction.relatedEntityType}:${transaction.relatedEntityId}`
      : initialValues?.relatedEntityType && initialValues.relatedEntityType !== "none"
        ? `${initialValues.relatedEntityType}:${initialValues.relatedEntityId ?? ""}`
      : "none:",
  );
  const initialRelatedEntityType = transaction?.relatedEntityType ?? initialValues?.relatedEntityType ?? "none";
  const initialRelatedEntityId = transaction?.relatedEntityId ?? initialValues?.relatedEntityId ?? "";
  const [isLinkingRecord, setIsLinkingRecord] = useState(initialRelatedEntityType !== "none" && Boolean(initialRelatedEntityId));
  const [selectedImpactType, setSelectedImpactType] = useState<ManualImpactType | "">(
    initialRelatedEntityType === "none" ? "" : initialRelatedEntityType,
  );
  const [showErrors, setShowErrors] = useState(false);
  const [formError, setFormError] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const selectedOption = transactionTypes.find((option) => option.type === selectedType) ?? transactionTypes[0];
  const selectedPlanningOption = planningOptions.find((option) => option.id === futurePlanningAmountId);
  const accountCategoryOptions = useMemo(() => getAccountCategoryOptions(accounts), [accounts]);
  const accountOptions = useMemo(() => getAccountsForCategory(accounts, accountCategory), [accountCategory, accounts]);
  const selectedAccount = accountOptions.find((account) => account.id === accountId) ?? accountOptions[0];
  const effectiveAccountId = selectedAccount?.id ?? "";
  const accountAmountTypeOptions = useMemo(() => {
    const optionNames = accountAmountTypeOptionsFor(selectedAccount);
    return accountAmountType && !optionNames.includes(accountAmountType) ? [accountAmountType, ...optionNames] : optionNames;
  }, [accountAmountType, selectedAccount]);
  const effectiveAccountAmountType = accountAmountTypeOptions.includes(accountAmountType) ? accountAmountType : accountAmountTypeOptions[0] ?? "General";
  const transferAccountCategoryOptions = accountCategoryOptions;
  const transferAccountOptions = useMemo(
    () => getAccountsForCategory(accounts, transferAccountCategory),
    [accounts, transferAccountCategory],
  );
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
  const isCashAdvance = isTransfer
    && isCreditCardAccount(selectedAccount)
    && Boolean(selectedTransferAccount)
    && !isCreditCardAccount(selectedTransferAccount);
  const isCreditCardCharge = isCreditCardAccount(selectedAccount) && (selectedType === "Expense" || selectedType === "Transfer");
  const isCreditCardPayment = isTransfer && isCreditCardAccount(selectedTransferAccount);
  const autoLinksCreditCardDebt = isCreditCardCharge || isCreditCardPayment;
  const usesExplicitPageLink = Boolean(selectedRelatedOption && selectedRelatedOption.type !== "none" && selectedRelatedOption.type !== "debt");
  const effectiveRelatedOption = autoLinksCreditCardDebt && !usesExplicitPageLink && (!selectedRelatedOption || selectedRelatedOption.type !== "debt" || !selectedRelatedOption.value)
    ? automaticCreditCardDebtOption
    : selectedRelatedOption;
  const compatibleRelatedOptions = useMemo(() => relatedOptions.filter((option) => (
    relatedImpactSupportsTransactionType(option, selectedType)
    || (option.value === selectedRelatedOption?.value && option.type === selectedRelatedOption?.type)
  )), [relatedOptions, selectedRelatedOption, selectedType]);
  const availableImpactTypes = manualImpactTypes.filter((impactType) => (
    compatibleRelatedOptions.some((option) => option.type === impactType.type)
  ));
  const selectedImpactOptions = selectedImpactType
    ? compatibleRelatedOptions.filter((option) => option.type === selectedImpactType)
    : [];
  const selectedImpactOptionValue = selectedRelatedOption?.value && selectedRelatedOption.type === selectedImpactType
    ? `${selectedRelatedOption.type}:${selectedRelatedOption.value}`
    : "";
  const hasManualRelatedLink = Boolean(selectedRelatedOption?.value && selectedRelatedOption.type !== "none");
  const savingsAction: TransactionFormData["savingsAction"] = effectiveRelatedOption?.type !== "savings_goal"
    ? ""
    : selectedType === "Income"
      ? "deposit"
      : selectedType === "Expense"
        ? "withdrawal"
        : effectiveAccountId === effectiveRelatedOption.accountId && effectiveAccountAmountType === effectiveRelatedOption.accountAmountType
          ? "withdrawal"
          : "deposit";
  const selectedImpactTypeDetails = manualImpactTypes.find((impactType) => impactType.type === selectedRelatedOption?.type);
  const effectiveCategoryId = categoryId;
  const selectedCategory = transactionCategories.find((category) => category.id === effectiveCategoryId)
    ?? categories.find((category) => category.id === effectiveCategoryId);
  const relatedSavingsGoalCategoryId = effectiveRelatedOption?.type === "savings_goal"
    ? effectiveRelatedOption.categoryId
    : undefined;
  const planningMatchInput = {
    categoryId: effectiveCategoryId,
    date: transactionDate,
    relatedSavingsGoalCategoryId,
    transactionType: selectedType,
  };
  const contextualPlanningOption = findContextualPlanningOption(
    planningOptions,
    planningMatchInput,
    futurePlanningAmountId,
  );
  const contextualPlanningCategory = contextualPlanningOption
    ? categories.find((category) => category.id === contextualPlanningOption.categoryId)
    : undefined;
  const appliedPlanningOption = selectedPlanningOption
    && planningOptionMatchesTransaction(selectedPlanningOption, planningMatchInput)
    ? selectedPlanningOption
    : undefined;
  const effectiveFuturePlanningAmountId = appliedPlanningOption?.id ?? "";
  const planningMonthLabel = transactionDate
    ? new Intl.DateTimeFormat("en", { month: "long", year: "numeric", timeZone: "UTC" })
      .format(new Date(`${transactionDate.slice(0, 7)}-01T00:00:00Z`))
    : "the selected month";
  const debtPayoffSummary = useMemo(() => {
    const payoff = effectiveRelatedOption?.debtPayoff;
    if (!payoff) return null;
    const repayments = [...payoff.repayments];
    if (transaction?.relatedEntityType === "debt"
      && transaction.relatedEntityId === effectiveRelatedOption.value
      && transaction.status === "cleared") {
      const currentRepaymentIndex = repayments.findIndex((repayment) => (
        repayment.dateValue === transaction.dateValue
        && Math.abs(repayment.amountValue - transaction.amountBaseValue) <= 0.005
      ));
      if (currentRepaymentIndex >= 0) repayments.splice(currentRepaymentIndex, 1);
    }
    return calculateDebtPayoffSummary({
      interestRate: payoff.interestRate,
      interestRatePeriod: payoff.interestRatePeriod,
      numberOfMonths: payoff.durationMonths,
      openingRepaidAmount: payoff.openingRepaidAmount,
      principal: payoff.totalAmount,
      referenceDate: transactionDate,
      repayments,
      settledAt: payoff.settledAt,
      settledEarly: payoff.settledEarly,
      startDate: payoff.startDate,
    });
  }, [effectiveRelatedOption, transaction, transactionDate]);
  const editedOneTimeRepayment = transaction?.relatedEntityType === "debt"
    && transaction.relatedEntityId === effectiveRelatedOption?.value
    && transaction.status === "cleared"
    ? transaction.amountBaseValue
    : 0;
  const debtPayoffQuote = effectiveRelatedOption?.oneTimeDebtPayoff
    ? {
      accruedInterestAmount: 0,
      asOfDate: effectiveRelatedOption.oneTimeDebtPayoff.dueDate || transactionDate,
      payoffAmount: effectiveRelatedOption.oneTimeDebtPayoff.amount + editedOneTimeRepayment,
      principalOutstandingAmount: effectiveRelatedOption.oneTimeDebtPayoff.amount + editedOneTimeRepayment,
    }
    : debtPayoffSummary?.currentQuote;
  const amountNumber = Number(amount);
  const existingSavingsWithdrawalAmount = transaction?.relatedEntityType === "savings_goal"
    && transaction.relatedEntityId === effectiveRelatedOption?.value
    && transaction.status === "cleared"
    && (transaction.ledgerMetadata.savings_action === "withdrawal"
      || transaction.type === "Expense"
      || (transaction.type === "Transfer" && transaction.transferFromAccountId === effectiveRelatedOption?.accountId))
    ? transaction.amountBaseValue
    : 0;
  const effectiveSavingsAvailableAmount = (effectiveRelatedOption?.availableAmount ?? 0) + existingSavingsWithdrawalAmount;
  const savingsWithdrawalRate = savingsAction === "withdrawal"
    ? exchangeRateFor(currencySettings, selectedAccount?.currency, transactionDate)
    : 1;
  const savingsWithdrawalBaseAmount = savingsWithdrawalRate == null ? Number.NaN : roundMoney(amountNumber * savingsWithdrawalRate);
  const savingsExchangeRateMissing = savingsAction === "withdrawal" && !Number.isFinite(savingsWithdrawalBaseAmount);
  const savingsWithdrawalExceedsFund = savingsAction === "withdrawal"
    && Number.isFinite(savingsWithdrawalBaseAmount)
    && savingsWithdrawalBaseAmount > effectiveSavingsAvailableAmount;
  const subscriptionPayment = effectiveRelatedOption?.subscriptionPayment;
  const subscriptionPaymentBilledAmountValue = subscriptionPayment?.billedAmount ?? 0;
  const subscriptionPaymentAccountRate = subscriptionPayment
    ? exchangeRateFor(currencySettings, selectedAccount?.currency, transactionDate)
    : null;
  const subscriptionPaymentBaseAmountValue = subscriptionPayment && amountNumber > 0 && subscriptionPaymentAccountRate != null
    ? roundMoney(amountNumber * subscriptionPaymentAccountRate)
    : 0;
  const subscriptionPaymentExchangeRateValue = subscriptionPayment
    ? subscriptionPayment.billingCurrency === SYSTEM_CURRENCY
      ? 1
      : subscriptionPaymentBaseAmountValue > 0 && subscriptionPaymentBilledAmountValue > 0
        ? roundMoney(subscriptionPaymentBaseAmountValue / subscriptionPaymentBilledAmountValue)
        : 0
    : 0;
  const subscriptionPaymentAmountValue = subscriptionPayment && amountNumber > 0 ? amountNumber : 0;
  const isForeignSubscriptionPayment = Boolean(subscriptionPayment && subscriptionPayment.billingCurrency !== SYSTEM_CURRENCY);
  const isCreditCardDebtPayment = selectedType === "Expense"
    && Boolean(effectiveRelatedOption?.creditCardDebt)
    && selectedAccount?.id !== effectiveRelatedOption?.creditCardDebt?.accountId;
  const hasSecondaryCreditCardDebtImpact = hasAdditionalAutomaticCreditCardDebtImpact(isCreditCardCharge, effectiveRelatedOption);
  const impactPreviewLabel = hasManualRelatedLink
    ? `${relatedImpactRecordName(selectedRelatedOption!)}${autoLinksCreditCardDebt ? " + card" : ""}`
    : autoLinksCreditCardDebt || isCreditCardDebtPayment
      ? "Automatic credit-card update"
      : "None";
  const hasDifferentTransferCurrency = isTransfer
    && Boolean(selectedAccount && selectedTransferAccount)
    && selectedAccount?.currency !== selectedTransferAccount?.currency;
  const transferAmountValue = isTransfer
    ? transaction?.transferAmount && transaction.transferAmount > 0
      && transaction.amountValue === amountNumber
        && transaction.transferFromAccountId === effectiveAccountId
      && transaction.transferToAccountId === effectiveTransferToAccountId
        ? transaction.transferAmount
        : exchangeRateFor(currencySettings, selectedAccount?.currency, transactionDate) != null
          && exchangeRateFor(currencySettings, selectedTransferAccount?.currency, transactionDate) != null
          ? roundMoney(
            amountNumber
            * exchangeRateFor(currencySettings, selectedAccount?.currency, transactionDate)!
            / exchangeRateFor(currencySettings, selectedTransferAccount?.currency, transactionDate)!,
          )
          : Number.NaN
    : amountNumber;
  const transferExchangeRateMissing = hasDifferentTransferCurrency && !Number.isFinite(transferAmountValue);
  const amountHasError = showErrors && (!Number.isFinite(amountNumber) || amountNumber <= 0);
  const dateHasError = showErrors && !transactionDate;
  const accountHasError = showErrors && !effectiveAccountId;
  const impactSelectionMissing = isLinkingRecord && !hasManualRelatedLink;
  const impactHasError = showErrors && impactSelectionMissing;
  const transferAmountTypeHasError = showErrors && isTransfer && effectiveAccountId === effectiveTransferToAccountId && effectiveAccountAmountType === effectiveTransferAccountAmountType;
  const categoryHasError = showErrors && !isTransfer && !effectiveCategoryId;
  const reservesWorkingBalance = transactionStatusReservesWorkingBalance(status);
  const availableAmountValue = accountAvailableAmount(selectedAccount, effectiveAccountAmountType)
    + editedTransactionBalanceAdjustment(transaction, effectiveAccountId, effectiveAccountAmountType);
  const remainingAmountValue = calculateTransactionRemainingAmount({
    amount: amountNumber,
    availableAmount: availableAmountValue,
    direction: selectedType === "Income" ? "inflow" : "outflow",
    maximumAmount: isCreditCardAccount(selectedAccount) ? selectedAccount?.creditLimitValue : undefined,
    reservesBalance: reservesWorkingBalance,
  });
  const transferAvailableAmountValue = accountAvailableAmount(selectedTransferAccount, effectiveTransferAccountAmountType)
    + editedTransactionBalanceAdjustment(transaction, effectiveTransferToAccountId, effectiveTransferAccountAmountType);
  const transferRemainingAmountValue = calculateTransactionRemainingAmount({
    amount: transferAmountValue,
    availableAmount: transferAvailableAmountValue,
    direction: "inflow",
    maximumAmount: isCreditCardAccount(selectedTransferAccount) ? selectedTransferAccount?.creditLimitValue : undefined,
    reservesBalance: reservesWorkingBalance,
  });
  const shouldValidateAvailableAmount = reservesWorkingBalance
    && !isCreditCardAccount(selectedAccount)
    && (selectedType === "Expense" || selectedType === "Transfer");
  const availableAmountHasError = showErrors && shouldValidateAvailableAmount && Number.isFinite(amountNumber) && amountNumber > availableAmountValue;

  function handleTypeChange(type: TransactionType) {
    setSelectedType(type);
    if (selectedPlanningOption && !futurePlanningDirectionSupportsTransactionType(selectedPlanningOption.direction, type)) {
      setFuturePlanningAmountId("");
    }
    if (selectedRelatedOption?.value && !relatedImpactSupportsTransactionType(selectedRelatedOption, type)) {
      setRelatedOptionValue("none:");
      setIsLinkingRecord(false);
      setSelectedImpactType("");
    }
    const nextCategories = getCategoriesForScope(categories, "Transactions", type === "Income" ? "Income" : "Expense");
    setCategoryId(nextCategories[0]?.id ?? "");
    if (selectedRelatedOption?.type === "savings_goal" && selectedRelatedOption.accountId) {
      const goalAccount = accounts.find((account) => account.id === selectedRelatedOption.accountId);
      if (!goalAccount) return;
      if (type === "Transfer") {
        setTransferAccountCategory(accountCategoryLabel(goalAccount));
        setTransferToAccountId(selectedRelatedOption.accountId);
        setTransferAccountAmountType(selectedRelatedOption.accountAmountType ?? accountAmountTypeOptionsFor(goalAccount)[0] ?? "General");
      } else {
        setAccountCategory(accountCategoryLabel(goalAccount));
        setAccountId(selectedRelatedOption.accountId);
        setAccountAmountType(selectedRelatedOption.accountAmountType ?? accountAmountTypeOptionsFor(goalAccount)[0] ?? "General");
      }
    }
  }

  function handleRelatedOptionChange(optionValue: string) {
    const nextOption = relatedOptions.find((option) => `${option.type}:${option.value}` === optionValue) ?? relatedOptions[0];
    if (!nextOption || nextOption.type === "none" || !nextOption.value) {
      setRelatedOptionValue("none:");
      return;
    }
    setRelatedOptionValue(`${nextOption.type}:${nextOption.value}`);
    setSelectedImpactType(nextOption.type);
    if (nextOption.type === "savings_goal" && selectedType !== "Transfer") {
      setSelectedType("Transfer");
      setCategoryId("");
      setFuturePlanningAmountId("");
    }
    if (nextOption.accountId && nextOption.type !== "savings_goal" && !nextOption.creditCardDebt) {
      const linkedAccount = accounts.find((account) => account.id === nextOption.accountId);
      if (linkedAccount) {
        setAccountCategory(accountCategoryLabel(linkedAccount));
        setAccountId(linkedAccount.id);
        setAccountAmountType(accountAmountTypeOptionsFor(linkedAccount)[0] ?? "General");
      }
    }
    if (nextOption.type === "savings_goal" && nextOption.categoryId) {
      if (nextOption.accountId) {
        const goalAccount = accounts.find((account) => account.id === nextOption.accountId);
        if (goalAccount) {
          setTransferToAccountId(goalAccount.id);
          setTransferAccountCategory(accountCategoryLabel(goalAccount));
          setTransferAccountAmountType(nextOption.accountAmountType ?? accountAmountTypeOptionsFor(goalAccount)[0] ?? "General");
          if (effectiveAccountId === goalAccount.id && effectiveAccountAmountType === nextOption.accountAmountType) {
            const otherType = accountAmountTypeOptionsFor(goalAccount).find((type) => type !== nextOption.accountAmountType);
            const otherAccount = accounts.find((account) => account.id !== goalAccount.id && account.type !== "Credit Card");
            if (otherType) setAccountAmountType(otherType);
            else if (otherAccount) {
              setAccountCategory(accountCategoryLabel(otherAccount));
              setAccountId(otherAccount.id);
              setAccountAmountType(accountAmountTypeOptionsFor(otherAccount)[0] ?? "General");
            }
          }
        }
      }
      const matchingPlan = planningOptions.find((option) => option.direction === "saving"
        && option.categoryId === nextOption.categoryId
        && option.periodMonth.slice(0, 7) === transactionDate.slice(0, 7));
      if (matchingPlan) setFuturePlanningAmountId(matchingPlan.id);
    } else if (nextOption.type === "debt" && nextOption.debtRepaymentType && selectedType !== "Transfer") {
      setSelectedType(nextOption.debtRepaymentType);
      const nextCategories = getCategoriesForScope(categories, "Transactions", nextOption.debtRepaymentType);
      setCategoryId(nextCategories[0]?.id ?? "");
    }
  }

  function startLinkingRecord() {
    setIsLinkingRecord(true);
    if (!selectedImpactType) setSelectedImpactType(availableImpactTypes[0]?.type ?? "");
  }

  function clearRelatedImpact() {
    setRelatedOptionValue("none:");
    setIsLinkingRecord(false);
    setSelectedImpactType("");
  }

  function handleImpactTypeChange(type: ManualImpactType) {
    setSelectedImpactType(type);
    if (selectedRelatedOption?.type !== type) setRelatedOptionValue("none:");
  }

  function handleAccountChange(name: string) {
    const nextAccount = findAccountByOptionLabel(accountOptions, name);
    setAccountId(nextAccount?.id ?? "");
    setAccountAmountType(accountAmountTypeOptionsFor(nextAccount)[0] ?? "General");
  }

  function handleAccountCategoryChange(category: string) {
    const nextAccount = getAccountsForCategory(accounts, category)[0];
    setAccountCategory(category);
    setAccountId(nextAccount?.id ?? "");
    setAccountAmountType(accountAmountTypeOptionsFor(nextAccount)[0] ?? "General");
  }

  function handleTransferAccountChange(name: string) {
    const nextAccount = findAccountByOptionLabel(transferAccountOptions, name);
    setTransferToAccountId(nextAccount?.id ?? "");
    setTransferAccountAmountType(accountAmountTypeOptionsFor(nextAccount)[0] ?? "General");
  }

  function handleTransferAccountCategoryChange(category: string) {
    const nextAccount = getAccountsForCategory(accounts, category)[0];
    setTransferAccountCategory(category);
    setTransferToAccountId(nextAccount?.id ?? "");
    setTransferAccountAmountType(accountAmountTypeOptionsFor(nextAccount)[0] ?? "General");
  }

  function handleUseDebtPayoffAmount() {
    if (!debtPayoffQuote || debtPayoffQuote.payoffAmount <= 0) return;
    const accountRate = exchangeRateFor(currencySettings, selectedAccount?.currency, transactionDate);
    if (accountRate == null || accountRate <= 0) {
      setFormError("Add a dated exchange rate for this account before using the payoff amount.");
      return;
    }
    const repaymentType = effectiveRelatedOption?.debtRepaymentType ?? "Expense";
    if (selectedType !== repaymentType) handleTypeChange(repaymentType);
    setAmount(String(roundMoney(debtPayoffQuote.payoffAmount / accountRate)));
    if (!note.trim() && effectiveRelatedOption?.label) {
      setNote(`${effectiveRelatedOption.label.replace(/^(?:Debt|Borrowing|Lending|Credit Card Borrowing):\s*/, "")} ${effectiveRelatedOption.label.startsWith("Lending:") ? "return" : "payoff"}`);
    }
  }

  function handleUseSubscriptionPaymentAmount() {
    if (!subscriptionPayment || subscriptionPayment.amount <= 0) return;
    if (selectedType !== "Expense") handleTypeChange("Expense");
    setAmount(String(subscriptionPayment.amount));
    if (!note.trim() && effectiveRelatedOption?.label) {
      setNote(`${effectiveRelatedOption.label.replace(/^Subscription:\s*/, "")} payment`);
    }
  }

  function applyContextualPlanningAmount() {
    if (!contextualPlanningOption) return;
    setFuturePlanningAmountId(contextualPlanningOption.id);
    setAmount(String(contextualPlanningOption.amount));
  }

  async function handleSaveTransaction(addAnother = false) {
    const hasInsufficientAvailableAmount = shouldValidateAvailableAmount && Number.isFinite(amountNumber) && amountNumber > availableAmountValue;
    const hasSameTransferEndpoint = isTransfer && effectiveAccountId === effectiveTransferToAccountId && effectiveAccountAmountType === effectiveTransferAccountAmountType;
    const hasErrors = !Number.isFinite(amountNumber) || amountNumber <= 0 || !transactionDate || !effectiveAccountId || impactSelectionMissing || hasInsufficientAvailableAmount || savingsWithdrawalExceedsFund || savingsExchangeRateMissing || hasSameTransferEndpoint || transferExchangeRateMissing || (isTransfer && !effectiveTransferToAccountId) || (!isTransfer && !effectiveCategoryId);
    setShowErrors(hasErrors);
    setFormError("");
    if (hasErrors) return;

    const input: TransactionFormData = {
      accountId: effectiveAccountId,
      accountAmountType: effectiveAccountAmountType,
      amount: amountNumber,
      categoryId: effectiveCategoryId,
      date: transactionDate,
      futurePlanningAmountId: isTransfer ? "" : effectiveFuturePlanningAmountId,
      note,
      relatedEntityId: effectiveRelatedOption?.value ?? "",
      relatedEntityType: effectiveRelatedOption?.type ?? "none",
      savingsAction,
      status,
      subscriptionPayment: subscriptionPayment && subscriptionPaymentBilledAmountValue > 0 && subscriptionPaymentExchangeRateValue > 0
        ? {
          billedAmount: subscriptionPaymentBilledAmountValue,
          billingCurrency: subscriptionPayment.billingCurrency,
          billingDueDate: subscriptionPayment.nextBillingDate || transactionDate,
          exchangeRate: subscriptionPaymentExchangeRateValue,
        }
        : undefined,
      title: note.trim() || `${transactionTypeLabel(selectedType)} transaction`,
      transferAccountId: isTransfer ? effectiveTransferToAccountId : "",
      transferAccountAmountType: isTransfer ? effectiveTransferAccountAmountType : "",
      transferAmount: isTransfer ? transferAmountValue : undefined,
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
                  <span className="mb-3 flex items-center gap-2 text-sm font-bold"><Icon className="size-5" name={option.icon} />{transactionTypeLabel(option.type)}</span>
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
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-sm font-semibold text-[#45464d]">{selectedAccount?.currency ?? SYSTEM_CURRENCY}</span>
                  <input
                    aria-invalid={amountHasError}
                    className={`h-12 w-full rounded-lg border bg-white pl-16 pr-4 text-xl font-semibold text-[#0b1c30] outline-none transition placeholder:text-[#a1a1aa] focus:border-[#2170e4] focus:ring-2 focus:ring-[#2170e4]/20 ${amountHasError ? "border-[#ba1a1a]" : "border-[#c6c6cd]"}`}
                    id={amountInputId}
                    inputMode="decimal"
                    onChange={(event) => setAmount(cleanAmountInputValue(event.target.value))}
                    placeholder="0"
                    type="text"
                    value={formatAmountInputValue(amount)}
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
              <SelectInput
                label={isTransfer ? "From Account Category" : "Account Category"}
                onChange={handleAccountCategoryChange}
                options={accountCategoryOptions.length > 0 ? accountCategoryOptions : ["No account categories"]}
                value={accountCategory || "No account categories"}
              />
              {isTransfer ? (
                <SelectInput
                  label="To Account Category"
                  onChange={handleTransferAccountCategoryChange}
                  options={transferAccountCategoryOptions.length > 0 ? transferAccountCategoryOptions : ["No account categories"]}
                  value={transferAccountCategory || "No account categories"}
                />
              ) : (
                <div>
                  <SelectInput label="Transaction Category" onChange={(name) => setCategoryId(transactionCategories.find((category) => category.name === name)?.id ?? "")} options={transactionCategories.length > 0 ? transactionCategories.map((category) => category.name) : ["No transaction categories"]} value={selectedCategory?.name ?? "No transaction categories"} />
                </div>
              )}
            </div>
            <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
              <SelectInput label={isTransfer ? "From Account" : "Account"} onChange={handleAccountChange} options={accountOptions.length > 0 ? getAccountOptionLabels(accountOptions) : ["No accounts in this category"]} value={selectedAccount ? getAccountOptionLabel(selectedAccount, accountOptions) : "No accounts in this category"} />
              {isTransfer ? (
                <SelectInput
                  label="To Account"
                  onChange={handleTransferAccountChange}
                  options={transferAccountOptions.length > 0 ? getAccountOptionLabels(transferAccountOptions) : ["No accounts in this category"]}
                  value={selectedTransferAccount ? getAccountOptionLabel(selectedTransferAccount, transferAccountOptions) : "No accounts in this category"}
                />
              ) : null}
            </div>
            {!isTransfer ? (
              <div className="mt-5 rounded-lg border border-[#bfdbfe] bg-[#eff6ff] p-4" aria-live="polite">
                <div className="flex items-start gap-3">
                  <span className="grid size-10 shrink-0 place-items-center rounded-md bg-white text-[#0058be]">
                    <Icon className="size-5" name="timeline" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-xs font-bold uppercase text-[#0058be]">Future Planning</p>
                      {appliedPlanningOption ? (
                        <span className="rounded-full bg-[#dcfce7] px-2 py-0.5 text-[11px] font-bold text-[#166534]">Applied</span>
                      ) : null}
                    </div>
                    {contextualPlanningOption ? (
                      <>
                        <p className="mt-1 text-sm font-semibold text-[#0b1c30]">
                          {contextualPlanningCategory?.name ?? selectedCategory?.name ?? "Selected category"} · {planningMonthLabel}
                        </p>
                        <p className="mt-1 text-xs font-semibold leading-5 text-[#45464d]">
                          Planned amount: {formatCurrencyAmount(contextualPlanningOption.amount, SYSTEM_CURRENCY)}. You can still edit the transaction amount after applying it.
                        </p>
                      </>
                    ) : (
                      <>
                        <p className="mt-1 text-sm font-semibold text-[#0b1c30]">
                          No matching planned amount for {planningMonthLabel}
                        </p>
                        <p className="mt-1 text-xs font-semibold leading-5 text-[#45464d]">
                          {effectiveRelatedOption?.type === "savings_goal"
                            ? "This Savings Goal has no planned amount for the selected month."
                            : selectedCategory && transactionDate
                              ? `No plan has been set for ${selectedCategory.name} in this month. You can save the transaction without one.`
                              : "Choose a date and category to see the relevant plan. Savings plans appear after you link a Savings Goal below."}
                        </p>
                      </>
                    )}
                  </div>
                </div>
                <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center">
                  {contextualPlanningOption ? (
                    <button
                      className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md bg-[#0058be] px-4 text-sm font-semibold text-white transition hover:bg-[#004da8]"
                      onClick={applyContextualPlanningAmount}
                      type="button"
                    >
                      <Icon className="size-4" name="check" />
                      {appliedPlanningOption ? "Reapply planned amount" : "Apply planned amount"}
                    </button>
                  ) : null}
                  {appliedPlanningOption ? (
                    <button
                      className="inline-flex min-h-11 items-center justify-center rounded-md px-4 text-sm font-semibold text-[#45464d] transition hover:bg-white"
                      onClick={() => setFuturePlanningAmountId("")}
                      type="button"
                    >
                      Remove plan link
                    </button>
                  ) : null}
                  {!contextualPlanningOption ? (
                    <Link className="inline-flex min-h-11 items-center justify-center rounded-md px-4 text-sm font-semibold text-[#0058be] transition hover:bg-white" href="/future-planning">
                      Open Future Planning
                    </Link>
                  ) : null}
                </div>
              </div>
            ) : null}
            <div className="mt-2 grid grid-cols-1 gap-2 md:grid-cols-2">
              <p className="text-xs font-semibold text-[#76777d]">{selectedAccount ? getAccountOptionDescription(selectedAccount) : ""}</p>
              {isTransfer ? <p className="text-xs font-semibold text-[#76777d]">{selectedTransferAccount ? getAccountOptionDescription(selectedTransferAccount) : ""}</p> : null}
            </div>
            {accountHasError ? <p className="mt-2 text-xs font-medium text-[#ba1a1a]">Select an account.</p> : null}
            {categoryHasError ? <p className="mt-2 text-xs font-medium text-[#ba1a1a]">Select a category.</p> : null}

            <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-2">
              <div>
                <SelectInput label="Account Amount Type" onChange={setAccountAmountType} options={accountAmountTypeOptions.length > 0 ? accountAmountTypeOptions : ["General"]} value={effectiveAccountAmountType} />
                <RemainingAmount amountType={effectiveAccountAmountType} currency={selectedAccount?.currency ?? SYSTEM_CURRENCY} value={remainingAmountValue} />
              </div>
              {isTransfer ? (
                <div>
                  <SelectInput label="To Account Amount Type" onChange={setTransferAccountAmountType} options={transferAccountAmountTypeOptions.length > 0 ? transferAccountAmountTypeOptions : ["General"]} value={effectiveTransferAccountAmountType} />
                  <RemainingAmount amountType={effectiveTransferAccountAmountType} currency={selectedTransferAccount?.currency ?? SYSTEM_CURRENCY} value={transferRemainingAmountValue} />
                </div>
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
            {transferExchangeRateMissing ? <p className="mt-2 text-xs font-medium text-[#ba1a1a]">Add dated exchange rates for both account currencies in Settings before saving this transfer.</p> : null}
            {availableAmountHasError ? <p className="mt-2 text-xs font-medium text-[#ba1a1a]">This {effectiveAccountAmountType} transaction exceeds the available amount for the selected account.</p> : null}
            {hasDifferentTransferCurrency && Number.isFinite(transferAmountValue) ? (
              <div className="mt-4 rounded-lg border border-[#bfdbfe] bg-[#eff6ff] p-4">
                <p className="text-xs font-bold uppercase text-[#0058be]">Currency conversion</p>
                <p className="mt-1 text-sm font-semibold text-[#0b1c30]">
                  {formatCurrencyAmount(amountNumber || 0, selectedAccount?.currency ?? SYSTEM_CURRENCY)} converts to {formatCurrencyAmount(transferAmountValue, selectedTransferAccount?.currency ?? SYSTEM_CURRENCY)} using the dated base-currency rates.
                </p>
              </div>
            ) : null}
            {isCashAdvance ? (
              <div className="mt-4 rounded-lg border border-[#fde68a] bg-[#fffbeb] p-4">
                <p className="text-xs font-bold uppercase text-[#92400e]">Credit-card cash advance</p>
                <p className="mt-1 text-sm font-semibold text-[#0b1c30]">
                  This increases the card liability and credits the destination account. It is financing activity, not operating spending.
                </p>
              </div>
            ) : null}
          </FormCard>

          <FormCard title="Additional Information">
            <FieldLabel htmlFor={noteInputId}>Note / Description</FieldLabel>
            <textarea className="min-h-28 w-full resize-none rounded-lg border border-[#c6c6cd] bg-white px-4 py-3 text-sm font-medium text-[#0b1c30] outline-none transition placeholder:text-[#6b7280] focus:border-[#2170e4] focus:ring-2 focus:ring-[#2170e4]/20" id={noteInputId} onChange={(event) => setNote(event.target.value)} placeholder={isTransfer ? "Transfer purpose or memo..." : "Optional details..."} rows={4} value={note} />
          </FormCard>

          <FormCard title="Transaction Impact">
            <p className="text-sm font-medium leading-6 text-[#45464d]">
              Optionally link this transaction to one other record so its progress or payment history updates automatically.
            </p>

            {autoLinksCreditCardDebt || isCreditCardDebtPayment ? (
              <div className="mt-4 grid gap-3 rounded-lg border border-[#bfdbfe] bg-[#eff6ff] p-4 sm:grid-cols-[auto_minmax(0,1fr)]">
                <span className="grid size-10 place-items-center rounded-md bg-white text-[#0058be]">
                  <Icon className="size-5" name="credit" />
                </span>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-xs font-bold uppercase text-[#0058be]">Automatic credit-card impact</p>
                    <span className="rounded-full bg-white px-2 py-0.5 text-[11px] font-bold text-[#166534]">No action needed</span>
                  </div>
                  <p className="mt-1 text-sm font-semibold text-[#0b1c30]">
                    {isCreditCardPayment
                      ? `Pays down ${selectedTransferAccount?.name || "the destination card"} and restores available credit`
                      : isCreditCardDebtPayment
                        ? `Pays down ${effectiveRelatedOption?.creditCardDebt?.accountName || "the linked card"} and restores available credit`
                        : isCashAdvance
                          ? "Increases card borrowing and credits the destination account"
                          : "Increases the selected card's outstanding borrowing"}
                  </p>
                  <p className="mt-1 text-xs font-semibold leading-5 text-[#45464d]">
                    {hasSecondaryCreditCardDebtImpact
                      ? "The linked record selected below will also be updated."
                      : "Finance Pro applies this automatically when the transaction is saved."}
                  </p>
                </div>
              </div>
            ) : null}

            <div className="mt-5 rounded-lg border border-[#c6c6cd]/70 bg-[#f8f9ff] p-4">
              <p className="text-sm font-semibold text-[#0b1c30]">Update another record?</p>
              <p className="mt-1 text-xs font-medium leading-5 text-[#45464d]">Most transactions do not need a link. Choose one only for a payment, contribution, or purchase tracked elsewhere.</p>
              <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2" role="group" aria-label="Link transaction to another record">
                <button
                  aria-pressed={!isLinkingRecord}
                  className={!isLinkingRecord
                    ? "inline-flex min-h-11 items-center justify-center gap-2 rounded-md border border-[#2170e4] bg-white px-4 text-sm font-semibold text-[#0058be] shadow-sm"
                    : "inline-flex min-h-11 items-center justify-center rounded-md border border-[#c6c6cd] bg-white px-4 text-sm font-semibold text-[#45464d] transition hover:border-[#2170e4]/50"}
                  onClick={clearRelatedImpact}
                  type="button"
                >
                  {!isLinkingRecord ? <Icon className="size-4" name="check" /> : null}
                  No additional link
                </button>
                <button
                  aria-pressed={isLinkingRecord}
                  className={isLinkingRecord
                    ? "inline-flex min-h-11 items-center justify-center gap-2 rounded-md border border-[#2170e4] bg-white px-4 text-sm font-semibold text-[#0058be] shadow-sm"
                    : "inline-flex min-h-11 items-center justify-center rounded-md border border-[#c6c6cd] bg-white px-4 text-sm font-semibold text-[#45464d] transition hover:border-[#2170e4]/50 disabled:cursor-not-allowed disabled:opacity-50"}
                  disabled={availableImpactTypes.length === 0}
                  onClick={startLinkingRecord}
                  type="button"
                >
                  {isLinkingRecord ? <Icon className="size-4" name="check" /> : null}
                  Link a record
                </button>
              </div>
            </div>

            {isLinkingRecord ? (
              availableImpactTypes.length > 0 ? (
                <div className="mt-4 rounded-lg border border-[#c6c6cd]/70 bg-white p-4">
                  <p className="text-xs font-bold uppercase text-[#45464d]">1. Choose what to update</p>
                  <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
                    {availableImpactTypes.map((impactType) => {
                      const isActive = selectedImpactType === impactType.type;
                      return (
                        <button
                          aria-pressed={isActive}
                          className={isActive
                            ? "flex min-h-16 items-center gap-3 rounded-md border border-[#2170e4] bg-[#eff6ff] px-3 py-2 text-left text-[#0058be] shadow-sm"
                            : "flex min-h-16 items-center gap-3 rounded-md border border-[#c6c6cd] bg-white px-3 py-2 text-left text-[#45464d] transition hover:border-[#2170e4]/50 hover:bg-[#f8f9ff]"}
                          key={impactType.type}
                          onClick={() => handleImpactTypeChange(impactType.type)}
                          type="button"
                        >
                          <span className="grid size-9 shrink-0 place-items-center rounded-md bg-white">
                            <Icon className="size-4" name={impactType.icon} />
                          </span>
                          <span className="min-w-0">
                            <span className="block text-sm font-bold">{impactType.label}</span>
                            <span className="mt-0.5 block text-xs font-medium">{impactType.description}</span>
                          </span>
                        </button>
                      );
                    })}
                  </div>

                  {selectedImpactType ? (
                    <div className="mt-4">
                      <FieldLabel htmlFor={impactRecordInputId}>{`2. Choose ${manualImpactTypes.find((impactType) => impactType.type === selectedImpactType)?.label ?? "record"}`}</FieldLabel>
                      <div className="relative">
                        <select
                          aria-invalid={impactHasError}
                          className={`h-12 w-full appearance-none rounded-lg border bg-white px-4 pr-12 text-sm font-medium text-[#0b1c30] outline-none transition focus:border-[#2170e4] focus:ring-2 focus:ring-[#2170e4]/20 ${impactHasError ? "border-[#ba1a1a]" : "border-[#c6c6cd]"}`}
                          id={impactRecordInputId}
                          onChange={(event) => handleRelatedOptionChange(event.target.value)}
                          value={selectedImpactOptionValue}
                        >
                          <option value="">Select a record</option>
                          {selectedImpactOptions.map((option) => (
                            <option key={`${option.type}:${option.value}`} value={`${option.type}:${option.value}`}>{relatedImpactRecordName(option)}</option>
                          ))}
                        </select>
                        <Icon className="pointer-events-none absolute right-4 top-1/2 size-4 -translate-y-1/2 text-[#76777d]" name="chevronDown" />
                      </div>
                      {impactHasError ? <p className="mt-1 text-xs font-medium text-[#ba1a1a]">Choose a record or select No additional link.</p> : null}
                    </div>
                  ) : null}
                </div>
              ) : (
                <div className="mt-4 rounded-lg border border-[#c6c6cd]/70 bg-[#f8f9ff] p-4 text-sm font-medium text-[#45464d]">
                  No compatible records are available for this transaction type.
                </div>
              )
            ) : null}

            {hasManualRelatedLink ? (
              <div className="mt-4 flex items-start gap-3 rounded-lg border border-[#bbf7d0] bg-[#f0fdf4] p-4" aria-live="polite">
                <span className="grid size-9 shrink-0 place-items-center rounded-full bg-white text-[#166534]">
                  <Icon className="size-4" name="check" />
                </span>
                <div className="min-w-0">
                  <p className="text-xs font-bold uppercase text-[#166534]">Linked record</p>
                  <p className="mt-1 text-sm font-semibold text-[#0b1c30]">{relatedImpactRecordName(selectedRelatedOption!)}</p>
                  <p className="mt-1 text-xs font-medium text-[#45464d]">{effectiveRelatedOption?.type === "savings_goal" ? `${savingsAction === "withdrawal" ? "Uses money from" : "Adds money to"} this ${effectiveRelatedOption.savingsGoalType === "Fund" ? "fund" : "goal"}.` : `This transaction will update ${selectedImpactTypeDetails?.label ?? "the selected record"} when saved.`}</p>
                  {effectiveRelatedOption?.type === "savings_goal" ? <p className="mt-1 text-xs font-semibold text-[#45464d]">Linked bucket: {effectiveRelatedOption.accountAmountType ?? "General"} · Available {formatMmkPreview(effectiveSavingsAvailableAmount)}</p> : null}
                  {showErrors && savingsExchangeRateMissing ? <p className="mt-2 text-xs font-bold text-[#ba1a1a]">Add a dated exchange rate for this savings account before recording the withdrawal.</p> : null}
                  {showErrors && savingsWithdrawalExceedsFund ? <p className="mt-2 text-xs font-bold text-[#ba1a1a]">The transaction exceeds the amount available in this fund.</p> : null}
                </div>
              </div>
            ) : null}

            {subscriptionPayment ? (
              <div className="mt-4 rounded-lg border border-[#c6c6cd]/70 bg-[#f8f9ff] p-4">
                <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <p className="text-xs font-bold uppercase text-[#45464d]">Subscription Payment</p>
                    <p className="mt-1 text-sm font-semibold text-[#0b1c30]">{subscriptionPayment.billingCycle} billing · {subscriptionPayment.nextBillingDate ? formatDisplayDate(subscriptionPayment.nextBillingDate) : "No due date"}</p>
                    <p className="mt-1 text-xs font-medium leading-5 text-[#45464d]">
                      Enter the amount actually paid under Transaction Details. Finance Pro calculates the realized exchange rate automatically.
                    </p>
                  </div>
                  <button
                    className="inline-flex min-h-11 w-full shrink-0 items-center justify-center gap-2 rounded-md bg-[#0b1c30] px-3 text-xs font-semibold text-white transition hover:bg-[#1f2937] sm:min-h-10 sm:w-auto"
                    disabled={subscriptionPayment.amount <= 0}
                    onClick={handleUseSubscriptionPaymentAmount}
                    type="button"
                  >
                    <Icon className="size-4" name="check" />
                    Use Estimate
                  </button>
                </div>
                <dl className="mt-4 grid grid-cols-1 gap-3 text-sm sm:grid-cols-3">
                  <div className="min-w-0 rounded-md bg-white px-3 py-2">
                    <dt className="text-xs font-bold uppercase text-[#45464d]">Billed</dt>
                    <dd className="mt-1 font-semibold text-[#0b1c30]"><ResponsiveAmount maxSizeRem={0.875}>{formatCurrencyAmount(subscriptionPaymentBilledAmountValue, subscriptionPayment.billingCurrency)}</ResponsiveAmount></dd>
                  </div>
                  <div className="min-w-0 rounded-md bg-white px-3 py-2">
                    <dt className="text-xs font-bold uppercase text-[#45464d]">Paid</dt>
                    <dd className="mt-1 font-semibold text-[#0b1c30]"><ResponsiveAmount maxSizeRem={0.875}>{subscriptionPaymentAmountValue > 0 ? formatCurrencyAmount(subscriptionPaymentAmountValue, selectedAccount?.currency ?? SYSTEM_CURRENCY) : "Enter amount above"}</ResponsiveAmount></dd>
                  </div>
                  <div className="min-w-0 rounded-md bg-white px-3 py-2">
                    <dt className="text-xs font-bold uppercase text-[#45464d]">Calculated Rate</dt>
                    <dd className="mt-1 font-semibold text-[#0b1c30]"><ResponsiveAmount maxSizeRem={0.875}>{isForeignSubscriptionPayment && subscriptionPaymentExchangeRateValue > 0 ? `1 ${subscriptionPayment.billingCurrency} = ${formatMmkPreview(subscriptionPaymentExchangeRateValue)}` : "No conversion"}</ResponsiveAmount></dd>
                  </div>
                </dl>
              </div>
            ) : null}
            {debtPayoffQuote && debtPayoffQuote.payoffAmount > 0 ? (
              <div className="mt-4 rounded-lg border border-[#bfdbfe] bg-[#eff6ff] p-4">
                <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <p className="text-xs font-bold uppercase text-[#0058be]">{effectiveRelatedOption?.label.startsWith("Lending:") ? "Lending Return" : "Borrowing Payoff"}</p>
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
          <p className="text-center text-xs font-bold uppercase text-[#45464d]">{transactionTypeLabel(selectedType)} Preview</p>
          <h3 className="mt-2 text-center"><ResponsiveAmount className={`font-bold ${selectedOption.accent}`}>{formatPreviewAmount(amount, selectedType)}</ResponsiveAmount></h3>
          <div className="mt-6 space-y-4 rounded-lg border border-[#c6c6cd]/40 bg-white p-4">
            <div className="flex items-center justify-between gap-4"><span className="text-xs font-bold uppercase text-[#45464d]">Date</span><span className="text-sm font-semibold text-[#0b1c30]">{formatDisplayDate(transactionDate, "-")}</span></div>
            <div className="flex items-center justify-between gap-4"><span className="text-xs font-bold uppercase text-[#45464d]">Account</span><span className="max-w-36 truncate text-sm font-semibold text-[#0b1c30]">{selectedAccount ? getAccountOptionLabel(selectedAccount, accounts) : "No account"}</span></div>
            <div className="flex items-center justify-between gap-4"><span className="text-xs font-bold uppercase text-[#45464d]">Amount Type</span><span className="max-w-36 truncate text-sm font-semibold text-[#0b1c30]">{effectiveAccountAmountType}</span></div>
            <div className="flex items-center justify-between gap-4"><span className="text-xs font-bold uppercase text-[#45464d]">Category</span><span className="max-w-36 truncate text-sm font-semibold text-[#0b1c30]">{isTransfer ? selectedTransferAccount ? getAccountOptionLabel(selectedTransferAccount, transferAccountOptions) : "No account" : selectedCategory?.name ?? "No category"}</span></div>
            {isTransfer ? <div className="flex items-center justify-between gap-4"><span className="text-xs font-bold uppercase text-[#45464d]">To Amount Type</span><span className="max-w-36 truncate text-sm font-semibold text-[#0b1c30]">{effectiveTransferAccountAmountType}</span></div> : null}
            <div className="flex items-center justify-between gap-4"><span className="text-xs font-bold uppercase text-[#45464d]">Impact</span><span className="max-w-36 truncate text-sm font-semibold text-[#0b1c30]">{impactPreviewLabel}</span></div>
            <div className="border-t border-[#c6c6cd]/40 pt-4"><span className="text-xs font-bold uppercase text-[#45464d]">Note</span><p className="mt-1 line-clamp-3 text-sm font-semibold text-[#0b1c30]">{note.trim() || "Add transaction note"}</p></div>
          </div>
        </div>
      </aside>
    </div>
  );
}
