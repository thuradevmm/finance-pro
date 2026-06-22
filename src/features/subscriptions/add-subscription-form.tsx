"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import { Icon } from "@/components/ui/icon";
import { FormCard, SelectInput, TextInput } from "@/components/ui/form-controls";
import { ResponsiveAmount } from "@/components/ui/responsive-amount";
import { accounts } from "@/lib/accounts/mock-data";
import { getCategoriesForScope } from "@/lib/categories/category-scopes";
import { categories } from "@/lib/categories/mock-data";
import type { BillingCycle } from "@/types/finance";

const billingCycles: BillingCycle[] = ["Monthly", "Yearly", "Weekly"];

function parseAmount(value: string) {
  return Number(value.replace(/[^0-9.-]/g, ""));
}

export function AddSubscriptionForm() {
  const subscriptionCategories = useMemo(() => getCategoriesForScope(categories, "Subscriptions", "Expense"), []);
  const categoryOptions = subscriptionCategories.length > 0 ? subscriptionCategories.map((category) => category.name) : ["Software Tools"];
  const paymentAccounts = useMemo(() => accounts.filter((account) => account.status === "Active").map((account) => account.name), []);
  const paymentOptions = paymentAccounts.length > 0 ? paymentAccounts : ["Main Checking"];
  const [serviceName, setServiceName] = useState("");
  const [amount, setAmount] = useState("");
  const [billingCycle, setBillingCycle] = useState<BillingCycle>("Monthly");
  const [firstBillingDate, setFirstBillingDate] = useState("2026-11-15");
  const [category, setCategory] = useState(categoryOptions[0]);
  const [paymentAccount, setPaymentAccount] = useState(paymentOptions[0]);
  const [reminderEnabled, setReminderEnabled] = useState(true);
  const [showErrors, setShowErrors] = useState(false);
  const selectedCategory = subscriptionCategories.find((item) => item.name === category) ?? subscriptionCategories[0];
  const nameHasError = showErrors && serviceName.trim() === "";
  const amountHasError = showErrors && amount.trim() === "";
  const billingDateHasError = showErrors && firstBillingDate.trim() === "";
  const parsedAmount = parseAmount(amount);
  const yearlyAmount = billingCycle === "Yearly" ? parsedAmount : billingCycle === "Weekly" ? parsedAmount * 52 : parsedAmount * 12;

  function handleSaveSubscription() {
    setShowErrors(serviceName.trim() === "" || amount.trim() === "" || firstBillingDate.trim() === "");
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
              <TextInput error={amountHasError} label="Amount" onChange={setAmount} placeholder="20.00" type="number" value={amount} />
              {amountHasError ? <p className="mt-1 text-xs font-medium text-[#ba1a1a]">Amount is required.</p> : null}
            </div>
          </div>

          <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-2">
            <SelectInput label="Billing Cycle" onChange={(value) => setBillingCycle(value as BillingCycle)} options={billingCycles} value={billingCycle} />
            <div>
              <TextInput
                error={billingDateHasError}
                label="First Billing Date"
                onChange={setFirstBillingDate}
                placeholder="2026-11-15"
                value={firstBillingDate}
              />
              {billingDateHasError ? <p className="mt-1 text-xs font-medium text-[#ba1a1a]">First billing date is required.</p> : null}
            </div>
          </div>

          <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-2">
            <SelectInput label="Subscription Category" onChange={setCategory} options={categoryOptions} value={category} />
            <SelectInput label="Payment Account" onChange={setPaymentAccount} options={paymentOptions} value={paymentAccount} />
          </div>
        </FormCard>

        <FormCard title="Reminder Settings">
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
              <span className="block text-sm font-semibold text-[#0b1c30]">Send reminder 3 days before billing</span>
              <span className="mt-1 block text-xs font-medium text-[#45464d]">Useful for upcoming renewals and annual subscriptions.</span>
            </span>
          </button>
        </FormCard>

        <div className="flex flex-col-reverse items-stretch justify-end gap-3 pt-2 sm:flex-row sm:items-center">
          <Link
            className="inline-flex h-10 items-center justify-center rounded-md px-4 text-sm font-semibold text-[#45464d] transition hover:bg-[#eff4ff]"
            href="/subscriptions"
          >
            Cancel
          </Link>
          <button
            className="inline-flex h-10 items-center justify-center rounded-md border border-[#c6c6cd]/70 bg-[#eff4ff] px-4 text-sm font-semibold text-[#0058be] transition hover:bg-[#dce9ff]"
            type="button"
          >
            Save & Add Another
          </button>
          <button
            className="inline-flex h-10 items-center justify-center rounded-md bg-[#0b1c30] px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-[#1f2937]"
            onClick={handleSaveSubscription}
            type="button"
          >
            Save Subscription
          </button>
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
              <ResponsiveAmount className="mt-2 font-bold text-[#0b1c30]" maxSizeRem={2.25}>{amount ? `MMK ${amount}` : "MMK 0"}</ResponsiveAmount>
              <ResponsiveAmount className="mt-2 font-semibold text-[#45464d]" maxSizeRem={0.875}>Yearly estimate: MMK {yearlyAmount.toLocaleString(undefined, { maximumFractionDigits: 0 })}</ResponsiveAmount>
            </div>

            <dl className="mt-5 space-y-4 rounded-lg border border-[#c6c6cd]/40 bg-white p-4">
              <div className="flex items-center justify-between gap-4">
                <dt className="text-xs font-bold uppercase text-[#45464d]">Category</dt>
                <dd className="max-w-36 truncate text-sm font-semibold text-[#0b1c30]">{category}</dd>
              </div>
              <div className="flex items-center justify-between gap-4">
                <dt className="text-xs font-bold uppercase text-[#45464d]">Account</dt>
                <dd className="max-w-36 truncate text-sm font-semibold text-[#0b1c30]">{paymentAccount}</dd>
              </div>
              <div className="flex items-center justify-between gap-4">
                <dt className="text-xs font-bold uppercase text-[#45464d]">Next Billing</dt>
                <dd className="text-sm font-semibold text-[#0b1c30]">{firstBillingDate || "Not set"}</dd>
              </div>
              <div className="flex items-center justify-between gap-4">
                <dt className="text-xs font-bold uppercase text-[#45464d]">Reminder</dt>
                <dd className="text-sm font-semibold text-[#0b1c30]">{reminderEnabled ? "Enabled" : "Disabled"}</dd>
              </div>
            </dl>
          </div>
        </div>
      </aside>
    </div>
  );
}
