"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { useMemo, useState } from "react";

import { createAccount, updateAccount } from "@/app/accounts/actions";
import { useInteractionLoading } from "@/components/app/interaction-loading-provider";
import { Icon, type IconName } from "@/components/ui/icon";
import { LoadingButton } from "@/components/ui/loading-state";
import { ResponsiveAmount } from "@/components/ui/responsive-amount";
import { formatMmkPreview } from "@/lib/currency";
import { getCategoriesForScope } from "@/lib/categories/category-scopes";
import type { AccountFormData, AccountRecord } from "@/lib/accounts/supabase";
import type { CategoryRecord } from "@/lib/categories/supabase";
import type { AccountStatus, AccountType, FinancialCategory } from "@/types/finance";

type AmountTypeDraft = {
  id: string;
  amount: string;
  type: string;
};

type AccountTypeOption = {
  type: AccountType;
  description: string;
  icon: IconName;
  activeClassName: string;
  previewClassName: string;
  accent: string;
};

const accountTypes: AccountTypeOption[] = [
  {
    type: "Bank Account",
    description: "Checking or everyday bank account",
    icon: "account",
    activeClassName: "border-[#bfdbfe] bg-[#eff6ff] text-[#0058be] shadow-sm",
    previewClassName: "bg-[#eff6ff] text-[#0058be]",
    accent: "text-[#0058be]",
  },
  {
    type: "Savings",
    description: "Goal, emergency, or high-yield savings",
    icon: "savings",
    activeClassName: "border-[#86efac] bg-[#ecfdf5] text-[#166534] shadow-sm",
    previewClassName: "bg-[#ecfdf5] text-[#047857]",
    accent: "text-[#047857]",
  },
  {
    type: "Credit Card",
    description: "Credit card with used and available limit",
    icon: "credit",
    activeClassName: "border-[#fca5a5] bg-[#fff1f0] text-[#991b1b] shadow-sm",
    previewClassName: "bg-[#fff1f0] text-[#b42318]",
    accent: "text-[#b42318]",
  },
  {
    type: "Digital Wallet",
    description: "Online wallet or payment account",
    icon: "credit",
    activeClassName: "border-[#c7d2fe] bg-[#eef2ff] text-[#3730a3] shadow-sm",
    previewClassName: "bg-[#eef2ff] text-[#4f46e5]",
    accent: "text-[#4f46e5]",
  },
  {
    type: "Cash Wallet",
    description: "Cash held outside bank accounts",
    icon: "box",
    activeClassName: "border-[#fde68a] bg-[#fffbeb] text-[#92400e] shadow-sm",
    previewClassName: "bg-[#fffbeb] text-[#92400e]",
    accent: "text-[#92400e]",
  },
];

const currencies = ["MMK"];
const statuses: AccountStatus[] = ["Active", "Needs Review", "Archived"];
const cardTypes = ["No Card", "MPU", "Visa"];
const defaultAmountTypeName = "Operation";

const accountCategoryKeywords: Record<AccountType, string[]> = {
  "Bank Account": ["bank", "checking", "current", "everyday", "account"],
  "Cash Wallet": ["cash"],
  "Credit Card": ["credit", "card"],
  "Digital Wallet": ["digital", "mobile", "wallet"],
  Savings: ["saving", "savings", "emergency", "goal"],
};

function FieldLabel({ children }: { children: string }) {
  return <label className="mb-2 block text-xs font-bold uppercase text-[#45464d]">{children}</label>;
}

function FormCard({ children, title }: { children: ReactNode; title: string }) {
  return (
    <section className="rounded-lg border border-[#c6c6cd]/60 bg-white p-5 shadow-[0_4px_20px_rgba(15,23,42,0.04)]">
      <h2 className="mb-5 text-xl font-semibold text-[#0b1c30]">{title}</h2>
      {children}
    </section>
  );
}

function SelectInput({
  label,
  onChange,
  options,
  value,
}: {
  label: string;
  onChange?: (value: string) => void;
  options: string[];
  value?: string;
}) {
  return (
    <div>
      <FieldLabel>{label}</FieldLabel>
      <div className="relative">
        <select
          className="h-12 w-full appearance-none rounded-lg border border-[#c6c6cd] bg-white px-4 pr-10 text-sm font-medium text-[#0b1c30] outline-none transition focus:border-[#2170e4] focus:ring-2 focus:ring-[#2170e4]/20"
          onChange={(event) => onChange?.(event.target.value)}
          value={value}
        >
          {options.map((option) => (
            <option key={option}>{option}</option>
          ))}
        </select>
        <Icon className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-[#76777d]" name="chevronDown" />
      </div>
    </div>
  );
}

function TextInput({
  label,
  onChange,
  placeholder,
  value,
  type = "text",
}: {
  label: string;
  onChange?: (value: string) => void;
  placeholder: string;
  value?: string;
  type?: "text" | "number";
}) {
  return (
    <div>
      <FieldLabel>{label}</FieldLabel>
      <input
        className="h-12 w-full rounded-lg border border-[#c6c6cd] bg-white px-4 text-sm font-medium text-[#0b1c30] outline-none transition placeholder:text-[#6b7280] focus:border-[#2170e4] focus:ring-2 focus:ring-[#2170e4]/20"
        onChange={(event) => onChange?.(event.target.value)}
        placeholder={placeholder}
        type={type}
        value={value}
      />
    </div>
  );
}

function categoryMatchesAccountType(category: FinancialCategory, accountType: AccountType) {
  const keywords = accountCategoryKeywords[accountType];
  const searchable = `${category.name} ${category.description} ${category.icon}`.toLowerCase();
  return keywords.some((keyword) => searchable.includes(keyword));
}

function createAmountTypeDraft(type = defaultAmountTypeName, amount = ""): AmountTypeDraft {
  return { amount, id: `${Date.now()}-${Math.random().toString(36).slice(2)}`, type };
}

function decimalScale(values: string[]) {
  return Math.max(
    0,
    ...values.map((value) => {
      const [, fraction = ""] = value.trim().split(".");
      return fraction.length;
    }),
  );
}

function decimalToScaledBigInt(value: string, scale: number) {
  const trimmedValue = value.trim();
  if (!/^-?\d+(\.\d+)?$/.test(trimmedValue)) return null;
  const isNegative = trimmedValue.startsWith("-");
  const [wholePart, fractionPart = ""] = trimmedValue.replace("-", "").split(".");
  const scaledText = `${wholePart}${fractionPart.padEnd(scale, "0")}`;
  const scaledValue = BigInt(scaledText || "0");
  return isNegative ? -scaledValue : scaledValue;
}

export function AddAccountForm({ account, categories, returnTo = "/accounts" }: { account?: AccountRecord; categories: CategoryRecord[]; returnTo?: string }) {
  const router = useRouter();
  const beginLoading = useInteractionLoading();
  const [selectedType, setSelectedType] = useState<AccountType>(account?.type ?? "Bank Account");
  const [accountName, setAccountName] = useState(account?.name ?? "");
  const [institution, setInstitution] = useState(account?.institution ?? "");
  const [accountIdentifier, setAccountIdentifier] = useState(account?.bankBookAccountNumber || account?.mobileBankingAccountNumber || "");
  const [phoneNumber, setPhoneNumber] = useState(account?.phoneNumber ?? "");
  const [cardType, setCardType] = useState(account?.cardType || "No Card");
  const [cardNumber, setCardNumber] = useState(account?.cardNumber ?? "");
  const [cardSecurityCode, setCardSecurityCode] = useState(account?.cardSecurityCode ?? "");
  const [cardExpiryCode, setCardExpiryCode] = useState(account?.cardExpiryCode ?? "");
  const [openingBalance, setOpeningBalance] = useState(account ? String(account.initialBalanceValue) : "");
  const [availableBalance, setAvailableBalance] = useState(account ? String(account.availableBalanceValue) : "");
  const [amountTypes, setAmountTypes] = useState<AmountTypeDraft[]>(
    account?.amountTypeValues.length
      ? account.amountTypeValues.map((item) => createAmountTypeDraft(item.type, String(item.amountValue)))
      : [createAmountTypeDraft(defaultAmountTypeName, "")],
  );
  const [currency, setCurrency] = useState(account?.currency ?? "MMK");
  const [status, setStatus] = useState<AccountStatus>(account?.status ?? "Active");
  const accountCategories = useMemo(() => getCategoriesForScope(categories, "Accounts"), [categories]);
  const matchedCategories = accountCategories.filter((category) => categoryMatchesAccountType(category, selectedType));
  const scopedCategories = matchedCategories.length > 0 ? matchedCategories : accountCategories;
  const baseCategoryOptions = scopedCategories.map((category) => category.name);
  const accountCategoryOptions = account?.category && !baseCategoryOptions.includes(account.category)
    ? [account.category, ...baseCategoryOptions]
    : baseCategoryOptions;
  const [selectedCategory, setSelectedCategory] = useState(account?.category ?? accountCategoryOptions[0] ?? "");
  const [monthlyBudgetLimit, setMonthlyBudgetLimit] = useState(account?.monthlyBudgetLimit == null ? "" : String(account.monthlyBudgetLimit));
  const [notes, setNotes] = useState(account?.notes ?? "");
  const [showErrors, setShowErrors] = useState(false);
  const [formError, setFormError] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const selectedOption = accountTypes.find((option) => option.type === selectedType) ?? accountTypes[0];
  const accountNameHasError = showErrors && accountName.trim() === "";
  const institutionHasError = showErrors && institution.trim() === "";
  const balanceHasError = showErrors && openingBalance.trim() === "";
  const amountTypesHaveError = showErrors && amountTypes.some((item) => item.type.trim() === "" || item.amount.trim() === "" || !Number.isFinite(Number(item.amount)));
  const hasCard = cardType !== "No Card";
  const cardHasError = showErrors && hasCard && (cardNumber.trim() === "" || cardSecurityCode.trim() === "" || cardExpiryCode.trim() === "");
  const availableLabel = selectedType === "Credit Card" ? "Available Credit" : "Available Balance";
  const effectiveSelectedCategory = accountCategoryOptions.includes(selectedCategory) ? selectedCategory : accountCategoryOptions[0] ?? "";
  const openingBalanceValue = Number(openingBalance);
  const effectiveAvailableBalanceValue = availableBalance.trim() === "" ? openingBalanceValue : Number(availableBalance);
  const amountTypesTotal = amountTypes.reduce((total, item) => total + (Number.isFinite(Number(item.amount)) ? Number(item.amount) : 0), 0);
  const amountComparisonScale = decimalScale([openingBalance, availableBalance.trim() === "" ? openingBalance : availableBalance, ...amountTypes.map((item) => item.amount)]);
  const openingBalanceScaled = decimalToScaledBigInt(openingBalance, amountComparisonScale);
  const availableBalanceScaled = decimalToScaledBigInt(availableBalance.trim() === "" ? openingBalance : availableBalance, amountComparisonScale);
  const amountTypesTotalScaled = amountTypes.reduce<bigint | null>((total, item) => {
    const amount = decimalToScaledBigInt(item.amount, amountComparisonScale);
    return total == null || amount == null ? null : total + amount;
  }, BigInt(0));
  const balancesMatchAmountTypes =
    openingBalanceScaled != null &&
    availableBalanceScaled != null &&
    amountTypesTotalScaled != null &&
    amountTypesTotalScaled === openingBalanceScaled &&
    (selectedType === "Credit Card" || amountTypesTotalScaled === availableBalanceScaled);
  const amountTotalHasError = showErrors && !balancesMatchAmountTypes;

  function updateAmountType(id: string, field: "amount" | "type", value: string) {
    setAmountTypes((items) => items.map((item) => (item.id === id ? { ...item, [field]: value } : item)));
  }

  function addAmountType() {
    setAmountTypes((items) => [...items, createAmountTypeDraft(`Amount Type ${items.length + 1}`, "0")]);
  }

  function removeAmountType(id: string) {
    setAmountTypes((items) => (items.length === 1 ? items : items.filter((item) => item.id !== id)));
  }

  function formatExpiryCode(value: string) {
    const digits = value.replace(/\D/g, "").slice(0, 4);
    return digits.length > 2 ? `${digits.slice(0, 2)}/${digits.slice(2)}` : digits;
  }

  async function handleSaveAccount(addAnother = false) {
    const normalizedAmountTypes = amountTypes.map((item) => ({ amount: Number(item.amount), type: item.type.trim() }));
    const hasInvalidAmountTypes = normalizedAmountTypes.length === 0 || normalizedAmountTypes.some((item) => item.type === "" || !Number.isFinite(item.amount));
    const hasInvalidCard = hasCard && (cardNumber.trim() === "" || cardSecurityCode.trim() === "" || cardExpiryCode.trim() === "");
    const hasErrors = accountName.trim() === "" || institution.trim() === "" || openingBalance.trim() === "" || hasInvalidAmountTypes || !balancesMatchAmountTypes || hasInvalidCard;
    setShowErrors(hasErrors);
    setFormError("");
    if (hasErrors) return;

    const input: AccountFormData = {
      accountNumber: accountIdentifier,
      amountTypes: normalizedAmountTypes,
      bankBookAccountNumber: accountIdentifier,
      cardNumber,
      cardSecurityCode,
      cardExpiryCode,
      cardType,
      availableBalance: effectiveAvailableBalanceValue,
      category: effectiveSelectedCategory,
      currency,
      institution,
      monthlyBudgetLimit: monthlyBudgetLimit.trim() === "" ? null : Number(monthlyBudgetLimit),
      mobileBankingAccountNumber: accountIdentifier,
      name: accountName,
      notes,
      openingBalance: Number(openingBalance),
      phoneNumber,
      status,
      type: selectedType,
    };

    setIsSaving(true);
    const result = account ? await updateAccount(account.id, input) : await createAccount(input);
    if (result.error) {
      setIsSaving(false);
      setFormError(result.error);
      return;
    }

    if (addAnother && !account) {
      setIsSaving(false);
      setAccountName("");
      setInstitution("");
      setAccountIdentifier("");
      setPhoneNumber("");
      setCardType("No Card");
      setCardNumber("");
      setCardSecurityCode("");
      setCardExpiryCode("");
      setOpeningBalance("");
      setAvailableBalance("");
      setAmountTypes([createAmountTypeDraft(defaultAmountTypeName, "")]);
      setMonthlyBudgetLimit("");
      setNotes("");
      setShowErrors(false);
      return;
    }

    beginLoading();
    router.push(returnTo);
    router.refresh();
  }

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
      <div className="space-y-6 lg:col-span-8">
        <FormCard title="Account Type">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {accountTypes.map((option) => {
              const isActive = option.type === selectedType;

              return (
                <button
                  aria-pressed={isActive}
                  className={
                    isActive
                      ? `rounded-lg border p-4 text-left transition ${option.activeClassName}`
                      : "rounded-lg border border-[#c6c6cd]/70 bg-[#f8f9ff] p-4 text-left text-[#45464d] transition hover:border-[#2170e4]/50 hover:bg-[#eff4ff]"
                  }
                  key={option.type}
                  onClick={() => setSelectedType(option.type)}
                  type="button"
                >
                  <span className="mb-3 flex items-center gap-2 text-sm font-bold">
                    <Icon className="size-5" name={option.icon} />
                    {option.type}
                  </span>
                  <span className="block text-xs font-medium leading-5">{option.description}</span>
                </button>
              );
            })}
          </div>
        </FormCard>

        <form className="space-y-6">
          <FormCard title="Account Details">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div>
                <TextInput label="Account Name" onChange={setAccountName} placeholder="Main Checking" value={accountName} />
                {accountNameHasError ? <p className="mt-1 text-xs font-medium text-[#ba1a1a]">Account name is required.</p> : null}
              </div>
              <div>
                <TextInput label="Institution" onChange={setInstitution} placeholder="Chase Bank" value={institution} />
                {institutionHasError ? <p className="mt-1 text-xs font-medium text-[#ba1a1a]">Institution is required.</p> : null}
              </div>
            </div>

            <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-2">
              <TextInput label="Bank Book / Mobile Banking Account Number" onChange={setAccountIdentifier} placeholder="Shared bank book or mobile banking number" value={accountIdentifier} />
              <TextInput label="Phone Number" onChange={setPhoneNumber} placeholder="Wallet or account phone number" value={phoneNumber} />
            </div>

            <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-2">
              <div>
                <FieldLabel>{selectedType === "Credit Card" ? "Current Used Balance" : "Opening Balance"}</FieldLabel>
                <div className="relative">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-sm font-semibold text-[#45464d]">MMK</span>
                  <input
                    className={`h-12 w-full rounded-lg border bg-white pl-16 pr-4 text-xl font-semibold text-[#0b1c30] outline-none transition placeholder:text-[#a1a1aa] focus:border-[#2170e4] focus:ring-2 focus:ring-[#2170e4]/20 ${
                      balanceHasError ? "border-[#ba1a1a]" : "border-[#c6c6cd]"
                    }`}
                    onChange={(event) => setOpeningBalance(event.target.value)}
                    placeholder="0.00"
                    type="number"
                    value={openingBalance}
                  />
                </div>
                {balanceHasError ? <p className="mt-1 text-xs font-medium text-[#ba1a1a]">Balance is required.</p> : null}
              </div>
              <TextInput label={availableLabel} onChange={setAvailableBalance} placeholder="0.00" type="number" value={availableBalance} />
              <SelectInput label="Currency" onChange={setCurrency} options={currencies} value={currency} />
            </div>
          </FormCard>

          <FormCard title="Card Details">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <SelectInput label="Card Type" onChange={setCardType} options={cardTypes} value={cardType} />
              <TextInput label="Card Number" onChange={setCardNumber} placeholder="Unique number on the card" value={cardNumber} />
              <TextInput label="Security Code" onChange={setCardSecurityCode} placeholder={cardType === "Visa" ? "CVV" : "Security code"} value={cardSecurityCode} />
              <TextInput label="Expired Code" onChange={(value) => setCardExpiryCode(formatExpiryCode(value))} placeholder="MM/YY" value={cardExpiryCode} />
            </div>
            {cardHasError ? <p className="mt-2 text-xs font-medium text-[#ba1a1a]">Card number, security code, and expired code are required when a card type is selected.</p> : null}
          </FormCard>

          <FormCard title="Amount Types">
            <div className="space-y-3">
              {amountTypes.map((amountType, index) => (
                <div className="grid grid-cols-1 gap-3 rounded-lg border border-[#c6c6cd]/60 bg-[#f8f9ff] p-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]" key={amountType.id}>
                  <TextInput label="Type Name" onChange={(value) => updateAmountType(amountType.id, "type", value)} placeholder="Operation, Saving, Emergency..." value={amountType.type} />
                  <TextInput label="Amount" onChange={(value) => updateAmountType(amountType.id, "amount", value)} placeholder={index === 0 ? openingBalance || "0.00" : "0.00"} type="number" value={amountType.amount} />
                  <div className="flex items-end">
                    <button
                      aria-label={`Remove ${amountType.type || "amount type"}`}
                      className="grid h-12 w-full place-items-center rounded-lg border border-[#fecaca] bg-white text-[#b42318] transition hover:bg-[#fff1f0] disabled:cursor-not-allowed disabled:opacity-50 md:w-12"
                      disabled={amountTypes.length === 1}
                      onClick={() => removeAmountType(amountType.id)}
                      type="button"
                    >
                      <Icon className="size-4" name="trash" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
            {amountTypesHaveError ? <p className="mt-2 text-xs font-medium text-[#ba1a1a]">Each amount type needs a name and valid amount.</p> : null}
            <div className={`mt-4 rounded-lg border px-4 py-3 text-sm font-semibold ${amountTotalHasError ? "border-[#fecaca] bg-[#fff1f0] text-[#991b1b]" : "border-[#c6c6cd]/60 bg-white text-[#45464d]"}`}>
              Amount type total: {formatMmkPreview(amountTypesTotal)}. This must match opening balance{selectedType === "Credit Card" ? "." : " and available balance."}
            </div>
            <button
              className="mt-4 inline-flex h-10 items-center gap-2 rounded-md border border-[#c6c6cd]/70 bg-white px-4 text-sm font-semibold text-[#0b1c30] transition hover:bg-[#eff4ff]"
              onClick={addAmountType}
              type="button"
            >
              <Icon className="size-4" name="plus" />
              Add Amount Type
            </button>
          </FormCard>

          <FormCard title="Account Settings">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <SelectInput label="Status" onChange={(value) => setStatus(value as AccountStatus)} options={statuses} value={status} />
              <SelectInput label="Account Category" onChange={setSelectedCategory} options={accountCategoryOptions.length > 0 ? accountCategoryOptions : ["No account categories"]} value={effectiveSelectedCategory || "No account categories"} />
            </div>

            <div className="mt-5">
              <TextInput label="Monthly Budget Limit" onChange={setMonthlyBudgetLimit} placeholder="Optional" type="number" value={monthlyBudgetLimit} />
            </div>

            <div className="mt-5">
              <FieldLabel>Notes</FieldLabel>
              <textarea
                className="min-h-28 w-full resize-none rounded-lg border border-[#c6c6cd] bg-white px-4 py-3 text-sm font-medium text-[#0b1c30] outline-none transition placeholder:text-[#6b7280] focus:border-[#2170e4] focus:ring-2 focus:ring-[#2170e4]/20"
                onChange={(event) => setNotes(event.target.value)}
                placeholder="Optional notes for this account..."
                rows={4}
                value={notes}
              />
            </div>
          </FormCard>

          <div className="flex flex-col-reverse items-stretch justify-end gap-3 pt-2 sm:flex-row sm:items-center">
            {formError ? <div className="w-full rounded-md border border-[#fecaca] bg-[#fff1f0] px-4 py-2 text-sm font-medium text-[#991b1b]" role="alert">{formError}</div> : null}
            <Link
              className="inline-flex h-10 items-center justify-center rounded-md px-4 text-sm font-semibold text-[#45464d] transition hover:bg-[#eff4ff]"
              href={returnTo}
            >
              Cancel
            </Link>
            <button
              className="inline-flex h-10 items-center justify-center rounded-md border border-[#c6c6cd]/70 bg-[#eff4ff] px-4 text-sm font-semibold text-[#0058be] transition hover:bg-[#dce9ff]"
              disabled={isSaving || Boolean(account)}
              onClick={() => handleSaveAccount(true)}
              type="button"
            >
              Save & Add Another
            </button>
            <LoadingButton
              className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-[#0b1c30] px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-[#1f2937]"
              isLoading={isSaving}
              loadingLabel="Saving…"
              onClick={() => handleSaveAccount(false)}
              type="button"
            >
              Save Account
            </LoadingButton>
          </div>
        </form>
      </div>

      <aside className="hidden lg:col-span-4 lg:block">
        <div className="sticky top-24 rounded-lg border border-[#c6c6cd]/60 bg-[#eff4ff] p-6 shadow-[0_4px_20px_rgba(15,23,42,0.04)]">
          <div className={`mx-auto mb-5 grid size-20 place-items-center rounded-full shadow-sm ${selectedOption.previewClassName}`}>
            <Icon className="size-10" name={selectedOption.icon} />
          </div>
          <p className="text-center text-xs font-bold uppercase text-[#45464d]">{selectedType} Preview</p>
          <h3 className="mt-2 text-center">
            <ResponsiveAmount className={`font-bold ${selectedOption.accent}`}>{openingBalance.trim() === "" ? formatMmkPreview(0) : formatMmkPreview(openingBalance)}</ResponsiveAmount>
          </h3>

          <div className="mt-6 space-y-4 rounded-lg border border-[#c6c6cd]/40 bg-white p-4">
            <div className="flex items-center justify-between gap-4">
              <span className="text-xs font-bold uppercase text-[#45464d]">Name</span>
              <span className="max-w-36 truncate text-sm font-semibold text-[#0b1c30]">{accountName || "New Account"}</span>
            </div>
            <div className="flex items-center justify-between gap-4">
              <span className="text-xs font-bold uppercase text-[#45464d]">Institution</span>
              <span className="max-w-36 truncate text-sm font-semibold text-[#0b1c30]">{institution || "Not set"}</span>
            </div>
            <div className="flex items-center justify-between gap-4">
              <span className="text-xs font-bold uppercase text-[#45464d]">Phone</span>
              <span className="max-w-36 truncate text-sm font-semibold text-[#0b1c30]">{phoneNumber || "Not set"}</span>
            </div>
            <div className="flex items-center justify-between gap-4">
              <span className="text-xs font-bold uppercase text-[#45464d]">Card Type</span>
              <span className="max-w-36 truncate text-sm font-semibold text-[#0b1c30]">{cardType}</span>
            </div>
            <div className="flex items-center justify-between gap-4">
              <span className="text-xs font-bold uppercase text-[#45464d]">Card</span>
              <span className="max-w-36 truncate text-sm font-semibold text-[#0b1c30]">{cardNumber || "Not set"}</span>
            </div>
            <div className="flex items-center justify-between gap-4">
              <span className="text-xs font-bold uppercase text-[#45464d]">Currency</span>
              <span className="text-sm font-semibold text-[#0b1c30]">{currency}</span>
            </div>
            {amountTypes.map((amountType) => (
              <div className="flex items-center justify-between gap-4" key={`preview-${amountType.id}`}>
                <span className="max-w-32 truncate text-xs font-bold uppercase text-[#45464d]">{amountType.type || "Amount Type"}</span>
                <ResponsiveAmount className="text-right font-semibold text-[#0b1c30]" maxSizeRem={0.875}>{amountType.amount.trim() === "" ? formatMmkPreview(0) : formatMmkPreview(amountType.amount)}</ResponsiveAmount>
              </div>
            ))}
            <div className="flex items-center justify-between gap-4">
              <span className="text-xs font-bold uppercase text-[#45464d]">Status</span>
              <span className="text-sm font-semibold text-[#0b1c30]">{status}</span>
            </div>
            <div className="flex items-center justify-between gap-4">
              <span className="text-xs font-bold uppercase text-[#45464d]">Category</span>
              <span className="max-w-36 truncate text-sm font-semibold text-[#0b1c30]">{effectiveSelectedCategory}</span>
            </div>
          </div>
        </div>
      </aside>
    </div>
  );
}
