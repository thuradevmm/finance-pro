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
import { formatCurrencyAmount, formatMmkPreview, parseAmountInputValue } from "@/lib/currency";
import { accountStatusContributesToCurrentTotals } from "@/lib/accounts/financial-status";
import { nextCreditCardPaymentDate } from "@/lib/accounts/credit-card-dates";
import { accountCategoryLabel, getAccountCategoryForId, getAccountCategoryOptions, getAccountsForCategory } from "@/lib/accounts/selection";
import { findAccountByOptionLabel, getAccountOptionDescription, getAccountOptionLabel, getAccountOptionLabels, type AccountRecord } from "@/lib/accounts/supabase";
import { getCategoriesForScope } from "@/lib/categories/category-scopes";
import type { CategoryRecord } from "@/lib/categories/supabase";
import { buildEmiSchedule, formatDateInput, normalizeDebtRepaymentDate } from "@/lib/debts/emi";
import type { DebtNature, DebtRepaymentFrequency } from "@/lib/debts/nature";
import { calculateDebtProgressPercent } from "@/lib/debts/progress";
import type { DebtFormData, DebtInterestRatePeriod, DebtRecordWithValues } from "@/lib/debts/supabase";
import { calculateDebtStatus } from "@/lib/debts/status";
import { isCreditCardDebtType } from "@/lib/debts/validation";

function parseAmount(value: string) {
  return parseAmountInputValue(value);
}

function accountAmountTypeOptionsFor(account: AccountRecord | undefined) {
  if (!account) return [];
  if (account.type === "Credit Card") return ["Credit Card"];
  return account.amountTypeValues.map((amountType) => amountType.type);
}

export function AddDebtForm({ accounts, categories, debt }: { accounts: AccountRecord[]; categories: CategoryRecord[]; debt?: DebtRecordWithValues }) {
  const { showError, showSuccess } = useToast();
  const router = useRouter();
  const beginLoading = useInteractionLoading();
  const nextPaymentDateInputId = useId();
  const [name, setName] = useState(debt?.name ?? "");
  const [nature, setNature] = useState<DebtNature>(debt?.nature ?? "Borrowing");
  const [lender, setLender] = useState(debt?.lender ?? "");
  const [totalAmount, setTotalAmount] = useState(debt ? String(debt.totalAmountValue) : "");
  const [repaidAmount, setRepaidAmount] = useState(debt ? String(debt.grossRepaidAmountValue) : "");
  const [interestRate, setInterestRate] = useState(debt ? String(debt.interestRateValue) : "");
  const [interestRatePeriod, setInterestRatePeriod] = useState<DebtInterestRatePeriod>(debt?.interestRatePeriod ?? "Yearly");
  const [startDate, setStartDate] = useState(debt?.startDate || formatDateInput(new Date()));
  const [durationMonths, setDurationMonths] = useState(debt?.durationMonths ? String(debt.durationMonths) : "12");
  const [repaymentFrequency, setRepaymentFrequency] = useState<DebtRepaymentFrequency>(debt?.repaymentFrequency ?? "Monthly");
  const [oneTimeRepaymentDate, setOneTimeRepaymentDate] = useState(
    debt?.repaymentFrequency === "One-time"
      ? debt.nextPaymentDateValue || debt.payoffDate
      : "",
  );
  const debtCategories = useMemo(() => getCategoriesForScope(categories, "Debts", "Debt"), [categories]);
  const [selectedCategoryId, setSelectedCategoryId] = useState(debt?.categoryId ?? (!debt ? debtCategories[0]?.id ?? "" : ""));
  const selectedCategory = debtCategories.find((category) => category.id === selectedCategoryId)
    ?? (!debt ? debtCategories[0] : undefined);
  const debtCategoryOptions = debt && !selectedCategory
    ? ["Uncategorized Borrowing & Lending", ...debtCategories.map((category) => category.name)]
    : debtCategories.length > 0 ? debtCategories.map((category) => category.name) : ["Uncategorized Borrowing & Lending"];
  const availableAccounts = useMemo(() => accounts.filter((account) => (
    accountStatusContributesToCurrentTotals(account.status) || account.id === debt?.paymentAccountId
  )), [accounts, debt?.paymentAccountId]);
  const semanticIsCreditCard = debt?.isCreditCardDebt ?? isCreditCardDebtType(selectedCategory?.name);
  const effectiveNature: DebtNature = semanticIsCreditCard ? "Borrowing" : nature;
  const effectiveRepaymentFrequency: DebtRepaymentFrequency = semanticIsCreditCard ? "Monthly" : repaymentFrequency;
  const isOneTime = effectiveRepaymentFrequency === "One-time";
  const eligiblePaymentAccounts = useMemo(
    () => semanticIsCreditCard
      ? availableAccounts.filter((account) => account.type === "Credit Card")
      : availableAccounts,
    [availableAccounts, semanticIsCreditCard],
  );
  const initialPaymentAccountId = debt?.paymentAccountId ?? eligiblePaymentAccounts[0]?.id ?? "";
  const [accountCategory, setAccountCategory] = useState(getAccountCategoryForId(eligiblePaymentAccounts, initialPaymentAccountId));
  const accountCategoryOptions = useMemo(() => getAccountCategoryOptions(eligiblePaymentAccounts), [eligiblePaymentAccounts]);
  const paymentAccounts = useMemo(
    () => getAccountsForCategory(eligiblePaymentAccounts, accountCategory),
    [accountCategory, eligiblePaymentAccounts],
  );
  const [paymentAccountId, setPaymentAccountId] = useState(initialPaymentAccountId);
  const selectedPaymentAccount = paymentAccounts.find((account) => account.id === paymentAccountId);
  const paymentAccountOptions = paymentAccounts.length > 0
    ? getAccountOptionLabels(paymentAccounts)
    : ["No accounts available"];
  const paymentAccountValue = selectedPaymentAccount
    ? getAccountOptionLabel(selectedPaymentAccount, paymentAccounts)
    : "No accounts available";
  const accountAmountTypeOptions = accountAmountTypeOptionsFor(selectedPaymentAccount);
  const [accountAmountType, setAccountAmountType] = useState(
    debt?.accountAmountType || accountAmountTypeOptions[0] || "",
  );
  const [notes, setNotes] = useState(debt?.notes ?? "");
  const [showErrors, setShowErrors] = useState(false);
  const [formError, setFormError] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const nameHasError = showErrors && name.trim() === "";
  const lenderHasError = showErrors && lender.trim() === "";
  const totalHasError = showErrors && totalAmount.trim() === "";
  const durationValue = Number(durationMonths);
  const normalizedDurationMonths = Number.isFinite(durationValue) ? Math.trunc(durationValue) : 0;
  const durationHasError = showErrors && !isOneTime && (durationMonths.trim() === "" || normalizedDurationMonths <= 0);
  const oneTimeDateHasError = showErrors && isOneTime && (!oneTimeRepaymentDate || oneTimeRepaymentDate < startDate);
  const categoryHasError = showErrors && !debt && !selectedCategory;
  const total = parseAmount(totalAmount);
  const repaid = parseAmount(repaidAmount);
  const paymentAccountHasError = showErrors && !selectedPaymentAccount;
  const accountAmountTypeHasError = showErrors
    && Boolean(selectedPaymentAccount)
    && !accountAmountTypeOptions.includes(accountAmountType);
  const parsedInterestRateValue = interestRate.trim() ? Number(interestRate) : 0;
  const parsedInterestRate = Number.isFinite(parsedInterestRateValue) ? parsedInterestRateValue : 0;
  const repaymentSchedule = buildEmiSchedule({
    interestRate: parsedInterestRate,
    interestRatePeriod,
    numberOfMonths: isOneTime ? 1 : normalizedDurationMonths,
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
  const oneTimeAppliedRepayment = Math.min(Math.max(repaid, 0), Math.max(total, 0));
  const progressBasis = semanticIsCreditCard ? creditCardAppliedRepayment : isOneTime ? oneTimeAppliedRepayment : repaymentSchedule.principalPaid;
  const progressPercent = calculateDebtProgressPercent(progressBasis, total);
  const remaining = semanticIsCreditCard ? creditCardRemaining : isOneTime ? Math.max(total - repaid, 0) : repaymentSchedule.remainingPrincipal;
  const nextPaymentDate = semanticIsCreditCard
    ? creditCardDueDate
    : isOneTime
      ? remaining > 0 ? oneTimeRepaymentDate : ""
      : normalizeDebtRepaymentDate(startDate, repaymentSchedule.nextPaymentDate);
  const status = calculateDebtStatus({ dueDate: nextPaymentDate, remainingAmount: remaining, storedStatus: debt?.status });
  const payoffDate = semanticIsCreditCard ? creditCardDueDate : isOneTime ? oneTimeRepaymentDate : repaymentSchedule.payoffDate;
  const monthlyPaymentValue = semanticIsCreditCard ? creditCardMinimumPayment : isOneTime ? remaining : repaymentSchedule.monthlyPayment;
  const totalRepaymentValue = semanticIsCreditCard || isOneTime ? total : repaymentSchedule.totalRepayment;
  const totalInterestValue = semanticIsCreditCard || isOneTime ? 0 : repaymentSchedule.totalInterest;
  const recordLabel = semanticIsCreditCard ? "Credit Card Borrowing" : effectiveNature;
  const recordNameLabel = semanticIsCreditCard ? "Credit Card Borrowing Name" : `${effectiveNature} Name`;
  const originationTransactionType = effectiveNature === "Lending" ? "Debit" : "Credit";
  const selectedAmountTypeBalance = selectedPaymentAccount?.amountTypeValues
    .find((amountType) => amountType.type === accountAmountType)?.amountValue ?? 0;
  const existingOriginationAmountType = debt?.accountAmountType
    || accountAmountTypeOptionsFor(accounts.find((account) => account.id === debt?.paymentAccountId))[0]
    || "";
  const reversesExistingOrigination = Boolean(
    debt
    && !debt.isCreditCardDebt
    && debt.paymentAccountId === selectedPaymentAccount?.id
    && existingOriginationAmountType === accountAmountType,
  );
  const existingOriginationReversal = reversesExistingOrigination && debt
    ? debt.nature === "Lending" ? debt.totalAmountValue : -debt.totalAmountValue
    : 0;
  const amountTypeBalanceBeforeSave = selectedAmountTypeBalance
    + existingOriginationReversal;
  const projectedAmountTypeBalance = amountTypeBalanceBeforeSave
    + (effectiveNature === "Lending" ? -total : total);
  const selectedAccountCurrency = selectedPaymentAccount?.currency ?? "MMK";

  async function handleSaveDebt(addAnother = false) {
    const hasErrors = name.trim() === "" || lender.trim() === "" || !Number.isFinite(total) || total <= 0 || !Number.isFinite(repaid) || repaid < 0 || parsedInterestRate < 0 || (!isOneTime && (durationMonths.trim() === "" || normalizedDurationMonths <= 0)) || (isOneTime && (!oneTimeRepaymentDate || oneTimeRepaymentDate < startDate)) || (!debt && !selectedCategory) || !selectedPaymentAccount || !accountAmountTypeOptions.includes(accountAmountType);
    setShowErrors(hasErrors);
    setFormError("");
    if (hasErrors) return;
    const input: DebtFormData = {
      accountAmountType,
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
      nature: effectiveNature,
      paymentAccountId,
      payoffDate,
      repaymentFrequency: effectiveRepaymentFrequency,
      repaidAmount: repaidAmount.trim() ? parseAmountInputValue(repaidAmount) : 0,
      startDate,
      status,
      totalAmount: parseAmountInputValue(totalAmount),
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
      setStartDate(formatDateInput(new Date()));
      setNotes("");
      showSuccess(`${recordLabel} saved successfully.`);
      return;
    }
    showSuccess(`${recordLabel} ${debt ? "updated" : "saved"} successfully.`);
    beginLoading();
    router.push("/debts");
    router.refresh();
  }

  return (
    <div className="grid min-w-0 grid-cols-1 gap-6 xl:grid-cols-12">
      <div className="min-w-0 space-y-6 xl:col-span-8">
        <FormCard title={`${recordLabel} Details`}>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div>
              <TextInput error={nameHasError} label={recordNameLabel} onChange={setName} placeholder={effectiveNature === "Lending" ? "Family loan" : "Home loan"} value={name} />
              {nameHasError ? <p className="mt-1 text-xs font-medium text-[#ba1a1a]">{recordNameLabel} is required.</p> : null}
            </div>
            <div>
              <TextInput error={lenderHasError} label={effectiveNature === "Lending" ? "Borrower / Recipient" : "Lender"} onChange={setLender} placeholder={effectiveNature === "Lending" ? "Dad" : "Chase Bank"} value={lender} />
              {lenderHasError ? <p className="mt-1 text-xs font-medium text-[#ba1a1a]">{effectiveNature === "Lending" ? "Borrower / recipient" : "Lender"} is required.</p> : null}
            </div>
          </div>

          {!semanticIsCreditCard ? (
            <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-2">
              <SelectInput label="Financial Nature" onChange={(value) => setNature(value as DebtNature)} options={["Borrowing", "Lending"]} value={effectiveNature} />
              <SelectInput label={effectiveNature === "Lending" ? "Return Plan" : "Repayment Plan"} onChange={(value) => setRepaymentFrequency(value as DebtRepaymentFrequency)} options={["Monthly", "One-time"]} value={effectiveRepaymentFrequency} />
            </div>
          ) : null}

          <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-2">
            <div>
              <TextInput error={totalHasError} label={effectiveNature === "Lending" ? "Amount Lent" : "Amount Borrowed"} onChange={setTotalAmount} placeholder="350000" type="amount" value={totalAmount} />
              {totalHasError ? <p className="mt-1 text-xs font-medium text-[#ba1a1a]">{effectiveNature === "Lending" ? "Amount lent" : "Amount borrowed"} is required.</p> : null}
            </div>
            <TextInput label={semanticIsCreditCard ? "Payments / Credits" : effectiveNature === "Lending" ? "Money Returned" : isOneTime ? "Amount Repaid" : "Payments Made (Including Interest)"} onChange={setRepaidAmount} placeholder="0" type="amount" value={repaidAmount} />
          </div>

          <div className={`mt-5 grid grid-cols-1 gap-4 ${semanticIsCreditCard || isOneTime ? "" : "md:grid-cols-2"}`}>
            <div className="rounded-lg border border-[#c6c6cd]/60 bg-[#f8f9ff] px-4 py-3">
              <span className="block text-xs font-bold uppercase text-[#45464d]">{semanticIsCreditCard ? "Configured Minimum Payment" : isOneTime ? `One-time Amount ${effectiveNature === "Lending" ? "Expected" : "Due"}` : `Calculated Monthly ${effectiveNature === "Lending" ? "Return" : "Payment"}`}</span>
              <ResponsiveAmount className="mt-1 font-semibold text-[#0b1c30]" maxSizeRem={1.125}>{formatMmkPreview(monthlyPaymentValue)}</ResponsiveAmount>
              <span className="mt-1 block text-xs font-semibold text-[#45464d]">{semanticIsCreditCard ? "From the linked card account" : isOneTime ? `${effectiveNature === "Lending" ? "Expected back" : "Due in full"} on the selected ${effectiveNature === "Lending" ? "return" : "repayment"} date` : normalizedDurationMonths > 0 ? `${normalizedDurationMonths} months` : "Set a valid duration"}</span>
            </div>
            {!semanticIsCreditCard && !isOneTime ? <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-[minmax(0,1fr)_8rem]">
              <TextInput label="Interest Rate" onChange={setInterestRate} placeholder="5.85" type="number" value={interestRate} />
              <SelectInput label="Rate Type" onChange={(value) => setInterestRatePeriod(value as DebtInterestRatePeriod)} options={["Yearly", "Monthly"]} value={interestRatePeriod} />
            </div> : null}
          </div>

          <div className={`mt-5 grid grid-cols-1 gap-4 ${semanticIsCreditCard ? "" : "md:grid-cols-2"}`}>
            <TextInput label={effectiveNature === "Lending" ? "Lending Date" : "Borrowing Start Date"} onChange={setStartDate} placeholder="2026-06-01" type="date" value={startDate} />
            {!semanticIsCreditCard && isOneTime ? <div>
              <TextInput error={oneTimeDateHasError} label={effectiveNature === "Lending" ? "Expected Full Return Date" : "Full Repayment Date"} onChange={setOneTimeRepaymentDate} placeholder="2026-08-30" type="date" value={oneTimeRepaymentDate} />
              {oneTimeDateHasError ? <p className="mt-1 text-xs font-medium text-[#ba1a1a]">Choose a {effectiveNature === "Lending" ? "return" : "repayment"} date on or after the {effectiveNature === "Lending" ? "lending" : "borrowing"} date.</p> : null}
            </div> : null}
            {!semanticIsCreditCard && !isOneTime ? <div>
              <TextInput error={durationHasError} label="Duration (Months)" onChange={setDurationMonths} placeholder="24" type="number" value={durationMonths} />
              {durationHasError ? <p className="mt-1 text-xs font-medium text-[#ba1a1a]">Duration must be greater than 0 months.</p> : null}
            </div> : null}
          </div>

          <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-2">
            <div>
              <FieldLabel htmlFor={nextPaymentDateInputId}>{`Next ${effectiveNature === "Lending" ? "Return" : "Payment"} Date`}</FieldLabel>
              <DateInput id={nextPaymentDateInputId} label={`Next ${effectiveNature === "Lending" ? "Return" : "Payment"} Date`} readOnly showIcon={false} tone="muted" value={nextPaymentDate} />
            </div>
            <div className="rounded-lg border border-[#c6c6cd]/60 bg-[#f8f9ff] px-4 py-3">
              <span className="block text-xs font-bold uppercase text-[#45464d]">{semanticIsCreditCard ? "Payment Due Date" : effectiveNature === "Lending" ? "Expected Final Return" : "Payoff Date"}</span>
              <span className="mt-1 block text-sm font-semibold text-[#0b1c30]">{payoffDate || (semanticIsCreditCard ? "Configure statement and due days on the card account" : isOneTime ? `Choose a ${effectiveNature === "Lending" ? "return" : "repayment"} date` : "Set start date and duration")}</span>
            </div>
          </div>
        </FormCard>

        <FormCard title={`${effectiveNature === "Lending" ? "Return" : "Repayment"} & Account Settings`}>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="rounded-lg border border-[#c6c6cd]/60 bg-[#f8f9ff] px-4 py-3">
              <span className="block text-xs font-bold uppercase text-[#45464d]">Calculated Status</span>
              <span className="mt-1 block text-sm font-semibold text-[#0b1c30]">{status}</span>
              <span className="mt-1 block text-xs font-medium text-[#45464d]">Based on remaining balance and the {isOneTime ? `one-time ${effectiveNature === "Lending" ? "return" : "repayment"}` : `next ${effectiveNature === "Lending" ? "return" : "payment"}`} date.</span>
            </div>
            <div>
              <SelectInput label="Borrowing & Lending Category" onChange={(name) => {
                const nextCategory = debtCategories.find((category) => category.name === name);
                setSelectedCategoryId(nextCategory?.id ?? "");
                if (isCreditCardDebtType(nextCategory?.name) && accounts.find((account) => account.id === paymentAccountId)?.type !== "Credit Card") {
                  const nextAccount = availableAccounts.find((account) => account.type === "Credit Card");
                  if (nextAccount) setAccountCategory(accountCategoryLabel(nextAccount));
                  setPaymentAccountId(nextAccount?.id ?? "");
                  setAccountAmountType(nextAccount ? "Credit Card" : "");
                }
              }} options={debtCategoryOptions} value={selectedCategory?.name ?? "Uncategorized Borrowing & Lending"} />
              {categoryHasError ? <p className="mt-1 text-xs font-medium text-[#ba1a1a]">Borrowing & Lending category is required.</p> : null}
            </div>
          </div>
          <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-3">
            <SelectInput
              label="Account Category"
              onChange={(category) => {
                const nextAccount = getAccountsForCategory(eligiblePaymentAccounts, category)[0];
                setAccountCategory(category);
                setPaymentAccountId(nextAccount?.id ?? "");
                setAccountAmountType(accountAmountTypeOptionsFor(nextAccount)[0] ?? "");
              }}
              options={accountCategoryOptions.length > 0 ? accountCategoryOptions : ["No account categories"]}
              value={accountCategory || "No account categories"}
            />
            <div>
              <SelectInput label={semanticIsCreditCard ? "Credit Card Account" : effectiveNature === "Lending" ? "Funding / Return Account" : "Receiving / Payment Account"} onChange={(name) => {
                const nextAccount = findAccountByOptionLabel(paymentAccounts, name);
                setPaymentAccountId(nextAccount?.id ?? "");
                setAccountAmountType(accountAmountTypeOptionsFor(nextAccount)[0] ?? "");
              }} options={paymentAccountOptions} value={paymentAccountValue} />
              {paymentAccountHasError ? <p className="mt-1 text-xs font-medium text-[#ba1a1a]">{semanticIsCreditCard ? "Select the credit card account for this credit card borrowing." : effectiveNature === "Lending" ? "Select the account that funds this lending record." : "Select the account that receives the borrowed money."}</p> : null}
            </div>
            <div>
              <SelectInput
                label={semanticIsCreditCard ? "Card Amount Type" : effectiveNature === "Lending" ? "Funding Amount Type" : "Receiving Amount Type"}
                onChange={setAccountAmountType}
                options={accountAmountTypeOptions.length > 0 ? accountAmountTypeOptions : ["Select an account first"]}
                value={accountAmountTypeOptions.includes(accountAmountType) ? accountAmountType : accountAmountTypeOptions[0] ?? "Select an account first"}
              />
              {accountAmountTypeHasError ? <p className="mt-1 text-xs font-medium text-[#ba1a1a]">Select an amount type from the chosen account.</p> : null}
            </div>
          </div>
          {selectedPaymentAccount ? <p className="mt-2 text-xs font-semibold text-[#76777d]">{getAccountOptionDescription(selectedPaymentAccount)}</p> : null}
          {!semanticIsCreditCard ? (
            <div className="mt-5 rounded-lg border border-[#c6c6cd]/60 bg-[#f8f9ff] p-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <p className="text-xs font-bold uppercase text-[#45464d]">Current Linked Transaction</p>
                  <p className="mt-1 text-sm font-semibold text-[#0b1c30]">
                    Saving creates a cleared {originationTransactionType} on {startDate || `the ${effectiveNature.toLowerCase()} date`}.
                  </p>
                </div>
                <ResponsiveAmount className={effectiveNature === "Lending" ? "font-semibold text-[#b42318]" : "font-semibold text-[#047857]"} maxSizeRem={1.125}>
                  {selectedPaymentAccount
                    ? formatCurrencyAmount(effectiveNature === "Lending" ? -total : total, selectedAccountCurrency)
                    : formatMmkPreview(total, effectiveNature === "Lending" ? "negative" : "positive")}
                </ResponsiveAmount>
              </div>
              <dl className="mt-4 grid grid-cols-1 gap-3 text-sm sm:grid-cols-3">
                <div>
                  <dt className="text-xs font-bold uppercase text-[#45464d]">Transaction Direction</dt>
                  <dd className="mt-1 font-semibold text-[#0b1c30]">{originationTransactionType}</dd>
                </div>
                <div>
                  <dt className="text-xs font-bold uppercase text-[#45464d]">Current {accountAmountType || "Amount Type"} Amount</dt>
                  <dd className="mt-1 font-semibold text-[#0b1c30]">{selectedPaymentAccount ? formatCurrencyAmount(selectedAmountTypeBalance, selectedAccountCurrency) : "Select an account"}</dd>
                </div>
                <div>
                  <dt className="text-xs font-bold uppercase text-[#45464d]">Projected After Save</dt>
                  <dd className="mt-1 font-semibold text-[#0b1c30]">{selectedPaymentAccount ? formatCurrencyAmount(projectedAmountTypeBalance, selectedAccountCurrency) : "Select an account"}</dd>
                </div>
              </dl>
              <p className="mt-3 text-xs font-medium leading-5 text-[#45464d]">
                {effectiveNature === "Lending"
                  ? "The lending amount is debited from the selected amount type. Returned money is credited when you record a linked return."
                  : "The borrowed amount is credited to the selected amount type. Repayments are debited when you record linked payments."}
              </p>
            </div>
          ) : (
            <p className="mt-5 rounded-lg border border-[#c6c6cd]/60 bg-[#f8f9ff] p-4 text-sm font-medium text-[#45464d]">
              Credit card borrowing is created from card activity, so this form does not create a separate origination transaction.
            </p>
          )}
          <div className="mt-5">
            <TextAreaInput label="Notes" onChange={setNotes} placeholder={`Optional ${effectiveNature === "Lending" ? "return" : "repayment"} notes...`} value={notes} />
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
              Save {recordLabel}
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
                <p className="text-xs font-bold uppercase text-[#45464d]">{recordLabel} Preview</p>
                <h3 className="text-xl font-semibold text-[#0b1c30]">{name || selectedCategory?.name || `New ${recordLabel}`}</h3>
              </div>
            </div>

            <ProgressCircle percent={progressPercent} tone={selectedCategory?.tone ?? "text-[#92400e]"} />

            <dl className="mt-5 grid grid-cols-2 gap-3 text-center">
              <div>
                <dt className="mb-1 text-xs font-bold uppercase text-[#45464d]">{semanticIsCreditCard ? "Applied Payment" : effectiveNature === "Lending" ? "Money Returned" : "Principal Repaid"}</dt>
                <dd><ResponsiveAmount className="font-semibold text-[#047857]" maxSizeRem={1.125}>{formatMmkPreview(progressBasis)}</ResponsiveAmount></dd>
              </div>
              <div>
                <dt className="mb-1 text-xs font-bold uppercase text-[#45464d]">Remaining</dt>
                <dd><ResponsiveAmount className="font-semibold text-[#0b1c30]" maxSizeRem={1.125}>{formatMmkPreview(remaining)}</ResponsiveAmount></dd>
              </div>
            </dl>

            <div className="mt-5 rounded-lg border border-[#c6c6cd]/40 bg-[#f8f9ff] p-4">
              <div className="flex items-center justify-between gap-4">
                <span className="text-xs font-bold uppercase text-[#45464d]">{semanticIsCreditCard ? "Minimum Payment" : effectiveNature === "Lending" ? "Monthly Return" : "Monthly Payment"}</span>
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
                <span className="text-xs font-bold uppercase text-[#45464d]">{semanticIsCreditCard ? "Payment Due" : effectiveNature === "Lending" ? "Final Return" : "Payoff"}</span>
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
                <span className="max-w-36 truncate text-sm font-semibold text-[#0b1c30]">{selectedPaymentAccount ? getAccountOptionLabel(selectedPaymentAccount, paymentAccounts) : "Account required"}</span>
              </div>
              <div className="mt-4 flex items-center justify-between gap-4">
                <span className="text-xs font-bold uppercase text-[#45464d]">Amount Type</span>
                <span className="max-w-36 truncate text-sm font-semibold text-[#0b1c30]">{accountAmountType || "Required"}</span>
              </div>
            </div>
            <p className="mt-5 rounded-lg border border-[#c6c6cd]/40 bg-white p-4 text-sm font-medium text-[#45464d]">
              {notes || `${effectiveNature === "Lending" ? "Return" : "Repayment"} notes will appear here.`}
            </p>
          </div>
        </div>
      </aside>
    </div>
  );
}
