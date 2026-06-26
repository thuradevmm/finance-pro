"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

import { createSubscription, updateSubscription } from "@/app/subscriptions/actions";
import { useInteractionLoading } from "@/components/app/interaction-loading-provider";
import { Icon } from "@/components/ui/icon";
import { FormCard, SelectInput, TextInput } from "@/components/ui/form-controls";
import { LoadingButton } from "@/components/ui/loading-state";
import { ResponsiveAmount } from "@/components/ui/responsive-amount";
import { SYSTEM_CURRENCY, formatCurrencyAmount, formatMmkPreview } from "@/lib/currency";
import { findAccountByOptionLabel, getAccountOptionLabel, getAccountOptionLabels, type AccountRecord } from "@/lib/accounts/supabase";
import { getCategoriesForScope } from "@/lib/categories/category-scopes";
import type { CategoryRecord } from "@/lib/categories/supabase";
import type { SubscriptionFormData, SubscriptionRecordWithValues } from "@/lib/subscriptions/supabase";
import type { BillingCycle, SubscriptionStatus } from "@/types/finance";

const billingCycles: BillingCycle[] = ["Monthly", "Yearly", "Weekly"];
const billingCurrencies = [SYSTEM_CURRENCY, "USD", "SGD", "THB", "EUR"];
const reminderOptions = [
  { label: "On billing date", value: 0 },
  { label: "1 day before", value: 1 },
  { label: "3 days before", value: 3 },
  { label: "7 days before", value: 7 },
  { label: "14 days before", value: 14 },
  { label: "30 days before", value: 30 },
];

function parseAmount(value: string) {
  return Number(value.replace(/[^0-9.-]/g, ""));
}

function defaultNextBillingDate() {
  return new Date().toISOString().slice(0, 10);
}

export function AddSubscriptionForm({ accounts, categories, subscription }: { accounts: AccountRecord[]; categories: CategoryRecord[]; subscription?: SubscriptionRecordWithValues }) {
  const router = useRouter();
  const beginLoading = useInteractionLoading();
  const subscriptionCategories = useMemo(() => getCategoriesForScope(categories, "Subscriptions", "Subscription"), [categories]);
  const paymentAccounts = useMemo(() => accounts.filter((account) => account.status === "Active"), [accounts]);
  const [serviceName, setServiceName] = useState(subscription?.name ?? "");
  const [billingCurrency, setBillingCurrency] = useState(subscription?.billingCurrency ?? SYSTEM_CURRENCY);
  const [billedAmount, setBilledAmount] = useState(subscription ? String(subscription.billedAmountValue) : "");
  const [exchangeRate, setExchangeRate] = useState(subscription && subscription.billingCurrency !== SYSTEM_CURRENCY ? String(subscription.exchangeRate) : "");
  const [billingCycle, setBillingCycle] = useState<BillingCycle>(subscription?.billingCycle ?? "Monthly");
  const [nextBillingDate, setNextBillingDate] = useState(subscription?.nextBillingDateValue ?? defaultNextBillingDate());
  const [categoryId, setCategoryId] = useState(subscription?.categoryId ?? subscriptionCategories[0]?.id ?? "");
  const [paymentAccountId, setPaymentAccountId] = useState(subscription?.accountId ?? paymentAccounts[0]?.id ?? "");
  const [status, setStatus] = useState<SubscriptionStatus>(subscription?.status ?? "Active");
  const [reminderEnabled, setReminderEnabled] = useState(subscription?.reminderEnabled ?? true);
  const [reminderDaysBefore, setReminderDaysBefore] = useState(subscription?.reminderDaysBefore ?? 3);
  const [showErrors, setShowErrors] = useState(false);
  const [formError, setFormError] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const selectedCategory = subscriptionCategories.find((item) => item.id === categoryId) ?? subscriptionCategories[0];
  const selectedAccount = paymentAccounts.find((item) => item.id === paymentAccountId);
  const isForeignCurrency = billingCurrency !== SYSTEM_CURRENCY;
  const nameHasError = showErrors && serviceName.trim() === "";
  const amountHasError = showErrors && (billedAmount.trim() === "" || parseAmount(billedAmount) <= 0);
  const exchangeRateHasError = showErrors && isForeignCurrency && (exchangeRate.trim() === "" || parseAmount(exchangeRate) <= 0);
  const billingDateHasError = showErrors && nextBillingDate.trim() === "";
  const parsedBilledAmount = parseAmount(billedAmount);
  const parsedExchangeRate = isForeignCurrency ? parseAmount(exchangeRate) : 1;
  const convertedAmount = parsedBilledAmount > 0 && parsedExchangeRate > 0 ? parsedBilledAmount * parsedExchangeRate : 0;
  const yearlyAmount = billingCycle === "Yearly" ? convertedAmount : billingCycle === "Weekly" ? convertedAmount * 52 : convertedAmount * 12;

  async function handleSaveSubscription(addAnother = false) {
    const hasErrors = serviceName.trim() === "" || billedAmount.trim() === "" || parsedBilledAmount <= 0 || exchangeRateHasError || nextBillingDate.trim() === "";
    setShowErrors(hasErrors);
    setFormError("");
    if (hasErrors) return;
    const input: SubscriptionFormData = {
      accountId: paymentAccountId,
      amount: convertedAmount,
      billedAmount: parsedBilledAmount,
      billingCycle,
      billingCurrency,
      categoryId,
      exchangeRate: parsedExchangeRate,
      name: serviceName,
      nextBillingDate,
      reminderDaysBefore,
      reminderEnabled,
      status,
    };
    setIsSaving(true);
    const result = subscription ? await updateSubscription(subscription.id, input) : await createSubscription(input);
    if (result.error) {
      setIsSaving(false);
      setFormError(result.error);
      return;
    }
    if (addAnother && !subscription) {
      setIsSaving(false);
      setServiceName("");
      setBilledAmount("");
      return;
    }
    beginLoading();
    router.push("/subscriptions");
    router.refresh();
  }

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
      <div className="space-y-6 lg:col-span-8">
        <FormCard title="Subscription Details">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div>
              <TextInput error={nameHasError} label="Service Name" onChange={setServiceName} placeholder="ChatGPT Plus" value={serviceName} />
              {nameHasError ? <p className="mt-1 text-xs font-medium text-[#ba1a1a]">Service name is required.</p> : null}
            </div>
            <div>
              <TextInput error={amountHasError} label="Billed Amount" onChange={setBilledAmount} placeholder="20.00" type="number" value={billedAmount} />
              {amountHasError ? <p className="mt-1 text-xs font-medium text-[#ba1a1a]">Enter a billed amount greater than zero.</p> : null}
            </div>
          </div>

          <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-2">
            <SelectInput label="Billing Currency" onChange={(value) => setBillingCurrency(value)} options={billingCurrencies} value={billingCurrency} />
            {isForeignCurrency ? (
              <div>
                <TextInput
                  error={exchangeRateHasError}
                  label={`Exchange Rate to ${SYSTEM_CURRENCY}`}
                  onChange={setExchangeRate}
                  placeholder={`1 ${billingCurrency} = ${SYSTEM_CURRENCY}`}
                  type="number"
                  value={exchangeRate}
                />
                {exchangeRateHasError ? <p className="mt-1 text-xs font-medium text-[#ba1a1a]">Exchange rate is required for foreign-currency subscriptions.</p> : null}
              </div>
            ) : (
              <div>
                <span className="mb-2 block text-xs font-bold uppercase text-[#45464d]">Exchange Rate to {SYSTEM_CURRENCY}</span>
                <div className="flex h-12 items-center rounded-lg border border-[#c6c6cd] bg-[#f8f9ff] px-4 text-sm font-semibold text-[#45464d]">No conversion needed</div>
              </div>
            )}
          </div>

          <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-2">
            <SelectInput label="Billing Cycle" onChange={(value) => setBillingCycle(value as BillingCycle)} options={billingCycles} value={billingCycle} />
            <div>
              <TextInput
                error={billingDateHasError}
                label="Next Billing Date"
                onChange={setNextBillingDate}
                placeholder={defaultNextBillingDate()}
                type="date"
                value={nextBillingDate}
              />
              {billingDateHasError ? <p className="mt-1 text-xs font-medium text-[#ba1a1a]">Next billing date is required.</p> : null}
            </div>
          </div>

          <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-2">
            <SelectInput label="Subscription Category" onChange={(name) => setCategoryId(subscriptionCategories.find((category) => category.name === name)?.id ?? "")} options={subscriptionCategories.length > 0 ? subscriptionCategories.map((category) => category.name) : ["No subscription categories"]} value={selectedCategory?.name ?? "No subscription categories"} />
            <SelectInput label="Payment Account" onChange={(name) => setPaymentAccountId(findAccountByOptionLabel(paymentAccounts, name)?.id ?? "")} options={paymentAccounts.length > 0 ? getAccountOptionLabels(paymentAccounts) : ["No accounts"]} value={selectedAccount ? getAccountOptionLabel(selectedAccount, paymentAccounts) : "No accounts"} />
          </div>
          <div className="mt-5">
            <SelectInput label="Status" onChange={(value) => setStatus(value as SubscriptionStatus)} options={["Active", "Paused", "Expiring"]} value={status} />
          </div>
        </FormCard>

        <FormCard title="Reminder Settings">
          <div className="grid gap-4 md:grid-cols-[1fr_220px]">
            <button
              aria-pressed={reminderEnabled}
              className={
                reminderEnabled
                  ? "flex w-full items-center gap-3 rounded-lg border border-[#bfdbfe] bg-[#eff6ff] p-4 text-left"
                  : "flex w-full items-center gap-3 rounded-lg border border-[#c6c6cd]/70 bg-white p-4 text-left transition hover:bg-[#eff4ff]"
              }
              onClick={() => setReminderEnabled((currentValue) => !currentValue)}
              type="button"
            >
              <span
                className={
                  reminderEnabled
                    ? "grid size-5 place-items-center rounded border border-[#0058be] bg-[#0058be] text-white"
                    : "grid size-5 place-items-center rounded border border-[#c6c6cd] bg-white text-transparent"
                }
              >
                <Icon className="size-3" name="close" />
              </span>
              <span>
                <span className="block text-sm font-semibold text-[#0b1c30]">Enable billing reminder</span>
                <span className="mt-1 block text-xs font-medium text-[#45464d]">Show this subscription in upcoming reminder views before renewal.</span>
              </span>
            </button>
            <label
              className={
                reminderEnabled
                  ? "block rounded-lg border border-[#c6c6cd]/70 bg-white p-4"
                  : "block rounded-lg border border-[#c6c6cd]/70 bg-[#f8f9ff] p-4 opacity-60"
              }
            >
              <span className="mb-2 block text-xs font-bold uppercase text-[#45464d]">Reminder Lead Time</span>
              <select
                className="h-10 w-full rounded-md border border-[#c6c6cd] bg-white px-3 text-sm font-semibold text-[#0b1c30] outline-none focus:border-[#2170e4] focus:ring-2 focus:ring-[#2170e4]/20 disabled:cursor-not-allowed"
                disabled={!reminderEnabled}
                onChange={(event) => setReminderDaysBefore(Number(event.target.value))}
                value={reminderDaysBefore}
              >
                {reminderOptions.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </label>
          </div>
        </FormCard>

        <div className="flex flex-col-reverse items-stretch justify-end gap-3 pt-2 sm:flex-row sm:items-center">
          {formError ? <div className="w-full rounded-md border border-[#fecaca] bg-[#fff1f0] px-4 py-2 text-sm font-medium text-[#991b1b]" role="alert">{formError}</div> : null}
          <Link
            className="inline-flex h-10 items-center justify-center rounded-md px-4 text-sm font-semibold text-[#45464d] transition hover:bg-[#eff4ff]"
            href="/subscriptions"
          >
            Cancel
          </Link>
          <button
            className="inline-flex h-10 items-center justify-center rounded-md border border-[#c6c6cd]/70 bg-[#eff4ff] px-4 text-sm font-semibold text-[#0058be] transition hover:bg-[#dce9ff]"
            disabled={isSaving || Boolean(subscription)}
            onClick={() => handleSaveSubscription(true)}
            type="button"
          >
            Save & Add Another
          </button>
          <LoadingButton
            className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-[#0b1c30] px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-[#1f2937]"
            isLoading={isSaving}
            loadingLabel="Saving…"
            onClick={() => handleSaveSubscription(false)}
            type="button"
          >
            Save Subscription
          </LoadingButton>
        </div>
      </div>

      <aside className="hidden lg:col-span-4 lg:block">
        <div className="sticky top-24 rounded-lg border border-[#c6c6cd]/60 bg-[#eff4ff] p-6 shadow-[0_4px_20px_rgba(15,23,42,0.04)]">
          <div className="rounded-lg border border-[#c6c6cd]/60 bg-white p-5">
            <div className="mb-5 flex items-center gap-3 border-b border-[#c6c6cd]/40 pb-4">
              <span className={`grid size-11 place-items-center rounded-lg ${selectedCategory?.bg ?? "bg-[#eff6ff]"} ${selectedCategory?.tone ?? "text-[#0058be]"}`}>
                <Icon name={selectedCategory?.icon ?? "subscriptions"} />
              </span>
              <div>
                <p className="text-xs font-bold uppercase text-[#45464d]">Subscription Preview</p>
                <h3 className="text-xl font-semibold text-[#0b1c30]">{serviceName || "New Subscription"}</h3>
              </div>
            </div>

            <div className="rounded-lg border border-[#c6c6cd]/40 bg-[#f8f9ff] p-4">
              <p className="text-xs font-bold uppercase text-[#45464d]">{billingCycle} Cost</p>
              <ResponsiveAmount className="mt-2 font-bold text-[#0b1c30]" maxSizeRem={2.25}>{formatMmkPreview(convertedAmount)}</ResponsiveAmount>
              <ResponsiveAmount className="mt-2 font-semibold text-[#0058be]" maxSizeRem={0.875}>
                Billed: {formatCurrencyAmount(parsedBilledAmount || 0, billingCurrency)}
              </ResponsiveAmount>
              <p className="mt-2 text-xs font-semibold text-[#45464d]">
                {isForeignCurrency ? `Rate: 1 ${billingCurrency} = ${formatMmkPreview(parsedExchangeRate || 0)}` : "No exchange rate needed"}
              </p>
              <ResponsiveAmount className="mt-2 font-semibold text-[#45464d]" maxSizeRem={0.875}>Yearly estimate: {formatMmkPreview(yearlyAmount)}</ResponsiveAmount>
            </div>

            <dl className="mt-5 space-y-4 rounded-lg border border-[#c6c6cd]/40 bg-white p-4">
              <div className="flex items-center justify-between gap-4">
                <dt className="text-xs font-bold uppercase text-[#45464d]">Category</dt>
                <dd className="max-w-36 truncate text-sm font-semibold text-[#0b1c30]">{selectedCategory?.name ?? "No category"}</dd>
              </div>
              <div className="flex items-center justify-between gap-4">
                <dt className="text-xs font-bold uppercase text-[#45464d]">Account</dt>
                <dd className="max-w-36 truncate text-sm font-semibold text-[#0b1c30]">{selectedAccount ? getAccountOptionLabel(selectedAccount, paymentAccounts) : "No account"}</dd>
              </div>
              <div className="flex items-center justify-between gap-4">
                <dt className="text-xs font-bold uppercase text-[#45464d]">Billing Currency</dt>
                <dd className="text-sm font-semibold text-[#0b1c30]">{billingCurrency}</dd>
              </div>
              <div className="flex items-center justify-between gap-4">
                <dt className="text-xs font-bold uppercase text-[#45464d]">MMK Equivalent</dt>
                <dd className="text-sm font-semibold text-[#0b1c30]">{formatMmkPreview(convertedAmount)}</dd>
              </div>
              <div className="flex items-center justify-between gap-4">
                <dt className="text-xs font-bold uppercase text-[#45464d]">Next Billing</dt>
                <dd className="text-sm font-semibold text-[#0b1c30]">{nextBillingDate || "Not set"}</dd>
              </div>
              <div className="flex items-center justify-between gap-4">
                <dt className="text-xs font-bold uppercase text-[#45464d]">Reminder</dt>
                <dd className="text-sm font-semibold text-[#0b1c30]">{reminderEnabled ? `${reminderDaysBefore} day${reminderDaysBefore === 1 ? "" : "s"} before` : "Disabled"}</dd>
              </div>
            </dl>
          </div>
        </div>
      </aside>
    </div>
  );
}
