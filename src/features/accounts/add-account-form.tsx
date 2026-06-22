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
import { getCategoriesForScope } from "@/lib/categories/category-scopes";
import { categories } from "@/lib/categories/mock-data";
import type { AccountFormData, AccountRecord } from "@/lib/accounts/supabase";
import type { AccountStatus, AccountType } from "@/types/finance";

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

export function AddAccountForm({ account }: { account?: AccountRecord }) {
  const router = useRouter();
  const beginLoading = useInteractionLoading();
  const [selectedType, setSelectedType] = useState<AccountType>(account?.type ?? "Bank Account");
  const [accountName, setAccountName] = useState(account?.name ?? "");
  const [institution, setInstitution] = useState(account?.institution ?? "");
  const [accountNumber, setAccountNumber] = useState(account?.accountNumber ?? "");
  const [openingBalance, setOpeningBalance] = useState(account ? String(account.initialBalanceValue) : "");
  const [availableBalance, setAvailableBalance] = useState(account ? String(account.availableBalanceValue) : "");
  const [currency, setCurrency] = useState(account?.currency ?? "MMK");
  const [status, setStatus] = useState<AccountStatus>(account?.status ?? "Active");
  const accountCategories = useMemo(() => getCategoriesForScope(categories, "Accounts").map((category) => category.name), []);
  const accountCategoryOptions = account?.category && !accountCategories.includes(account.category)
    ? [account.category, ...accountCategories]
    : accountCategories.length > 0 ? accountCategories : ["Everyday Banking"];
  const [selectedCategory, setSelectedCategory] = useState(account?.category || accountCategoryOptions[0]);
  const [monthlyBudgetLimit, setMonthlyBudgetLimit] = useState(account?.monthlyBudgetLimit == null ? "" : String(account.monthlyBudgetLimit));
  const [notes, setNotes] = useState(account?.notes ?? "");
  const [showErrors, setShowErrors] = useState(false);
  const [formError, setFormError] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const selectedOption = accountTypes.find((option) => option.type === selectedType) ?? accountTypes[0];
  const accountNameHasError = showErrors && accountName.trim() === "";
  const institutionHasError = showErrors && institution.trim() === "";
  const balanceHasError = showErrors && openingBalance.trim() === "";
  const availableLabel = selectedType === "Credit Card" ? "Available Credit" : "Available Balance";

  async function handleSaveAccount(addAnother = false) {
    const hasErrors = accountName.trim() === "" || institution.trim() === "" || openingBalance.trim() === "";
    setShowErrors(hasErrors);
    setFormError("");
    if (hasErrors) return;

    const input: AccountFormData = {
      accountNumber,
      availableBalance: availableBalance.trim() === "" ? Number(openingBalance) : Number(availableBalance),
      category: selectedCategory,
      currency,
      institution,
      monthlyBudgetLimit: monthlyBudgetLimit.trim() === "" ? null : Number(monthlyBudgetLimit),
      name: accountName,
      notes,
      openingBalance: Number(openingBalance),
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
      setAccountNumber("");
      setOpeningBalance("");
      setAvailableBalance("");
      setMonthlyBudgetLimit("");
      setNotes("");
      setShowErrors(false);
      return;
    }

    beginLoading();
    router.push("/accounts");
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
              <TextInput label="Account Number Label" onChange={setAccountNumber} placeholder="...4582 or Cash" value={accountNumber} />
              <SelectInput label="Currency" onChange={setCurrency} options={currencies} value={currency} />
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
            </div>
          </FormCard>

          <FormCard title="Account Settings">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <SelectInput label="Status" onChange={(value) => setStatus(value as AccountStatus)} options={statuses} value={status} />
              <SelectInput label="Account Category" onChange={setSelectedCategory} options={accountCategoryOptions} value={selectedCategory} />
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
              href="/accounts"
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
            <ResponsiveAmount className={`font-bold ${selectedOption.accent}`}>{openingBalance.trim() === "" ? "MMK 0" : `MMK ${openingBalance}`}</ResponsiveAmount>
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
              <span className="text-xs font-bold uppercase text-[#45464d]">Currency</span>
              <span className="text-sm font-semibold text-[#0b1c30]">{currency}</span>
            </div>
            <div className="flex items-center justify-between gap-4">
              <span className="text-xs font-bold uppercase text-[#45464d]">Status</span>
              <span className="text-sm font-semibold text-[#0b1c30]">{status}</span>
            </div>
            <div className="flex items-center justify-between gap-4">
              <span className="text-xs font-bold uppercase text-[#45464d]">Category</span>
              <span className="max-w-36 truncate text-sm font-semibold text-[#0b1c30]">{selectedCategory}</span>
            </div>
          </div>
        </div>
      </aside>
    </div>
  );
}
