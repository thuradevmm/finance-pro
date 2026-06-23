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
import type { AccountRecord } from "@/lib/accounts/supabase";
import { getCategoriesForScope } from "@/lib/categories/category-scopes";
import type { CategoryRecord } from "@/lib/categories/supabase";
import type { SubscriptionFormData, SubscriptionRecordWithValues } from "@/lib/subscriptions/supabase";
import type { BillingCycle, SubscriptionStatus } from "@/types/finance";

const billingCycles: BillingCycle[] = ["Monthly", "Yearly", "Weekly"];

function parseAmount(value: string) {
  return Number(value.replace(/[^0-9.-]/g, ""));
}

export function AddSubscriptionForm({ accounts, categories, subscription }: { accounts: AccountRecord[]; categories: CategoryRecord[]; subscription?: SubscriptionRecordWithValues }) {
  const router = useRouter();
  const beginLoading = useInteractionLoading();
  const subscriptionCategories = useMemo(() => getCategoriesForScope(categories, "Subscriptions", "Subscription"), [categories]);
  const paymentAccounts = useMemo(() => accounts.filter((account) => account.status === "Active"), [accounts]);
  const [serviceName, setServiceName] = useState(subscription?.name ?? "");
  const [amount, setAmount] = useState(subscription ? String(subscription.amountValue) : "");
  const [billingCycle, setBillingCycle] = useState<BillingCycle>(subscription?.billingCycle ?? "Monthly");
  const [firstBillingDate, setFirstBillingDate] = useState(subscription?.nextBillingDateValue ?? "2026-11-15");
  const [categoryId, setCategoryId] = useState(subscription?.categoryId ?? subscriptionCategories[0]?.id ?? "");
  const [paymentAccountId, setPaymentAccountId] = useState(subscription?.accountId ?? paymentAccounts[0]?.id ?? "");
  const [status, setStatus] = useState<SubscriptionStatus>(subscription?.status ?? "Active");
  const [reminderEnabled, setReminderEnabled] = useState(subscription?.reminderEnabled ?? true);
  const [showErrors, setShowErrors] = useState(false);
  const [formError, setFormError] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const selectedCategory = subscriptionCategories.find((item) => item.id === categoryId) ?? subscriptionCategories[0];
  const selectedAccount = paymentAccounts.find((item) => item.id === paymentAccountId);
  const nameHasError = showErrors && serviceName.trim() === "";
  const amountHasError = showErrors && amount.trim() === "";
  const billingDateHasError = showErrors && firstBillingDate.trim() === "";
  const parsedAmount = parseAmount(amount);
  const yearlyAmount = billingCycle === "Yearly" ? parsedAmount : billingCycle === "Weekly" ? parsedAmount * 52 : parsedAmount * 12;

  async function handleSaveSubscription(addAnother = false) {
    const hasErrors = serviceName.trim() === "" || amount.trim() === "" || firstBillingDate.trim() === "";
    setShowErrors(hasErrors);
    setFormError("");
    if (hasErrors) return;
    const input: SubscriptionFormData = {
      accountId: paymentAccountId,
      amount: Number(amount),
      billingCycle,
      categoryId,
      name: serviceName,
      nextBillingDate: firstBillingDate,
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
      setAmount("");
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
            <SelectInput label="Subscription Category" onChange={(name) => setCategoryId(subscriptionCategories.find((category) => category.name === name)?.id ?? "")} options={subscriptionCategories.length > 0 ? subscriptionCategories.map((category) => category.name) : ["No subscription categories"]} value={selectedCategory?.name ?? "No subscription categories"} />
            <SelectInput label="Payment Account" onChange={(name) => setPaymentAccountId(paymentAccounts.find((account) => account.name === name)?.id ?? "")} options={paymentAccounts.length > 0 ? paymentAccounts.map((account) => account.name) : ["No accounts"]} value={selectedAccount?.name ?? "No accounts"} />
          </div>
          <div className="mt-5">
            <SelectInput label="Status" onChange={(value) => setStatus(value as SubscriptionStatus)} options={["Active", "Paused", "Expiring"]} value={status} />
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
              <ResponsiveAmount className="mt-2 font-bold text-[#0b1c30]" maxSizeRem={2.25}>{amount ? `MMK ${amount}` : "MMK 0"}</ResponsiveAmount>
              <ResponsiveAmount className="mt-2 font-semibold text-[#45464d]" maxSizeRem={0.875}>Yearly estimate: MMK {yearlyAmount.toLocaleString(undefined, { maximumFractionDigits: 0 })}</ResponsiveAmount>
            </div>

            <dl className="mt-5 space-y-4 rounded-lg border border-[#c6c6cd]/40 bg-white p-4">
              <div className="flex items-center justify-between gap-4">
                <dt className="text-xs font-bold uppercase text-[#45464d]">Category</dt>
                <dd className="max-w-36 truncate text-sm font-semibold text-[#0b1c30]">{selectedCategory?.name ?? "No category"}</dd>
              </div>
              <div className="flex items-center justify-between gap-4">
                <dt className="text-xs font-bold uppercase text-[#45464d]">Account</dt>
                <dd className="max-w-36 truncate text-sm font-semibold text-[#0b1c30]">{selectedAccount?.name ?? "No account"}</dd>
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
