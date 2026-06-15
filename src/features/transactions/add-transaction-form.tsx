"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { useState } from "react";

import { Icon, type IconName } from "@/components/ui/icon";
import type { TransactionType } from "@/types/finance";

type TransactionTypeOption = {
  type: TransactionType;
  description: string;
  icon: IconName;
  previewIcon: IconName;
  accent: string;
  activeClassName: string;
  previewClassName: string;
};

const transactionTypes: TransactionTypeOption[] = [
  {
    type: "Expense",
    description: "Money paid from an account",
    icon: "trendingDown",
    previewIcon: "receipt",
    accent: "text-[#b42318]",
    activeClassName: "border-[#fca5a5] bg-[#fff1f0] text-[#991b1b] shadow-sm",
    previewClassName: "bg-[#b42318] text-white",
  },
  {
    type: "Income",
    description: "Money received into an account",
    icon: "trendingUp",
    previewIcon: "trendingUp",
    accent: "text-[#047857]",
    activeClassName: "border-[#86efac] bg-[#ecfdf5] text-[#166534] shadow-sm",
    previewClassName: "bg-[#047857] text-white",
  },
  {
    type: "Transfer",
    description: "Move money between accounts",
    icon: "sync",
    previewIcon: "sync",
    accent: "text-[#4f46e5]",
    activeClassName: "border-[#c7d2fe] bg-[#eef2ff] text-[#3730a3] shadow-sm",
    previewClassName: "bg-[#4f46e5] text-white",
  },
];

const accountOptions = ["Checking Account (...4582)", "Credit Card (...9921)", "Cash Wallet", "High-Yield Savings"];
const expenseCategories = ["Groceries", "Dining Out", "Utilities", "Transportation", "Subscription"];
const incomeCategories = ["Salary", "Freelance", "Bonus", "Interest", "Other Income"];
const transferAccounts = ["High-Yield Savings", "Main Checking", "Cash Wallet", "Travel Wallet"];

function FieldLabel({ children }: { children: string }) {
  return <label className="mb-2 block text-xs font-bold uppercase text-[#45464d]">{children}</label>;
}

function SelectInput({ label, options }: { label: string; options: string[] }) {
  return (
    <div>
      <FieldLabel>{label}</FieldLabel>
      <div className="relative">
        <select className="h-12 w-full appearance-none rounded-lg border border-[#c6c6cd] bg-white px-4 pr-10 text-sm font-medium text-[#0b1c30] outline-none transition focus:border-[#2170e4] focus:ring-2 focus:ring-[#2170e4]/20">
          {options.map((option) => (
            <option key={option}>{option}</option>
          ))}
        </select>
        <Icon className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-[#76777d]" name="chevronDown" />
      </div>
    </div>
  );
}

function FormCard({ children, title }: { children: ReactNode; title: string }) {
  return (
    <section className="rounded-lg border border-[#c6c6cd]/60 bg-white p-5 shadow-[0_4px_20px_rgba(15,23,42,0.04)]">
      <h2 className="mb-5 text-xl font-semibold text-[#0b1c30]">{title}</h2>
      {children}
    </section>
  );
}

export function AddTransactionForm() {
  const [selectedType, setSelectedType] = useState<TransactionType>("Expense");
  const selectedOption = transactionTypes.find((option) => option.type === selectedType) ?? transactionTypes[0];
  const isTransfer = selectedType === "Transfer";
  const categoryOptions = selectedType === "Income" ? incomeCategories : expenseCategories;

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
      <div className="space-y-6 lg:col-span-8">
        <FormCard title="Transaction Type">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            {transactionTypes.map((option) => {
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
          <FormCard title="Transaction Details">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div>
                <FieldLabel>Amount</FieldLabel>
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-xl font-semibold text-[#45464d]">$</span>
                  <input
                    className="h-12 w-full rounded-lg border border-[#ba1a1a] bg-white pl-9 pr-4 text-xl font-semibold text-[#0b1c30] outline-none transition placeholder:text-[#a1a1aa] focus:border-[#2170e4] focus:ring-2 focus:ring-[#2170e4]/20"
                    placeholder="0.00"
                    type="number"
                  />
                </div>
                <p className="mt-1 text-xs font-medium text-[#ba1a1a]">Amount is required.</p>
              </div>

              <div>
                <FieldLabel>Date</FieldLabel>
                <input
                  className="h-12 w-full rounded-lg border border-[#c6c6cd] bg-white px-4 text-sm font-medium text-[#0b1c30] outline-none transition focus:border-[#2170e4] focus:ring-2 focus:ring-[#2170e4]/20"
                  type="date"
                  defaultValue="2026-06-15"
                />
              </div>
            </div>

            <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-2">
              {isTransfer ? (
                <>
                  <SelectInput label="From Account" options={accountOptions} />
                  <SelectInput label="To Account" options={transferAccounts} />
                </>
              ) : (
                <>
                  <SelectInput label="Account" options={accountOptions} />
                  <SelectInput label="Category" options={categoryOptions} />
                </>
              )}
            </div>

            <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-2">
              <SelectInput
                label="Payment Method"
                options={isTransfer ? ["Internal Transfer", "Bank Transfer", "Wallet Transfer"] : ["Credit Card", "Debit Card", "Cash", "Digital Wallet"]}
              />
              <SelectInput label="Status" options={["Cleared", "Pending", "Scheduled"]} />
            </div>
          </FormCard>

          <FormCard title="Additional Information">
            <div>
              <FieldLabel>Note / Description</FieldLabel>
              <textarea
                className="min-h-28 w-full resize-none rounded-lg border border-[#c6c6cd] bg-white px-4 py-3 text-sm font-medium text-[#0b1c30] outline-none transition placeholder:text-[#6b7280] focus:border-[#2170e4] focus:ring-2 focus:ring-[#2170e4]/20"
                placeholder={isTransfer ? "Transfer purpose or memo..." : "Optional details..."}
                rows={4}
              />
            </div>

            <div className="mt-5">
              <FieldLabel>Receipt Upload</FieldLabel>
              <button
                className="flex w-full flex-col items-center justify-center rounded-lg border-2 border-dashed border-[#c6c6cd] bg-[#f8f9ff] p-6 text-center transition hover:bg-[#eff4ff]"
                type="button"
              >
                <Icon className="mb-2 size-8 text-[#76777d]" name="upload" />
                <span className="text-sm font-semibold text-[#45464d]">Click to upload or drag and drop</span>
                <span className="mt-1 text-xs font-medium text-[#76777d]">JPG, PNG, PDF (max 5MB)</span>
              </button>
            </div>
          </FormCard>

          <div className="flex flex-col-reverse items-stretch justify-end gap-3 pt-2 sm:flex-row sm:items-center">
            <Link
              className="inline-flex h-10 items-center justify-center rounded-md px-4 text-sm font-semibold text-[#45464d] transition hover:bg-[#eff4ff]"
              href="/transactions"
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
              type="button"
            >
              Save Transaction
            </button>
          </div>
        </form>
      </div>

      <aside className="hidden lg:col-span-4 lg:block">
        <div className="sticky top-24 rounded-lg border border-[#c6c6cd]/60 bg-[#eff4ff] p-6 text-center shadow-[0_4px_20px_rgba(15,23,42,0.04)]">
          <div className={`mx-auto mb-5 grid size-20 place-items-center rounded-full shadow-sm ${selectedOption.previewClassName}`}>
            <Icon className="size-10" name={selectedOption.previewIcon} />
          </div>
          <p className="text-xs font-bold uppercase text-[#45464d]">{selectedType} Preview</p>
          <h3 className={`mt-2 text-5xl font-bold ${selectedOption.accent}`}>$0.00</h3>

          <div className="mt-6 space-y-4 rounded-lg border border-[#c6c6cd]/40 bg-white p-4 text-left">
            <div className="flex items-center justify-between gap-4">
              <span className="text-xs font-bold uppercase text-[#45464d]">Date</span>
              <span className="text-sm font-semibold text-[#0b1c30]">Jun 15, 2026</span>
            </div>
            <div className="flex items-center justify-between gap-4">
              <span className="text-xs font-bold uppercase text-[#45464d]">{isTransfer ? "From" : "Account"}</span>
              <span className="text-sm font-semibold text-[#0b1c30]">Checking</span>
            </div>
            <div className="flex items-center justify-between gap-4">
              <span className="text-xs font-bold uppercase text-[#45464d]">{isTransfer ? "To" : "Category"}</span>
              <span className="text-sm font-semibold text-[#0b1c30]">{isTransfer ? "Savings" : selectedType === "Income" ? "Salary" : "Groceries"}</span>
            </div>
          </div>
        </div>
      </aside>
    </div>
  );
}
