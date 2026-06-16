"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import { Icon } from "@/components/ui/icon";
import { FormCard, SelectInput, TextAreaInput, TextInput } from "@/components/ui/form-controls";
import { getCategoriesForScope } from "@/lib/categories/category-scopes";
import { categories } from "@/lib/categories/mock-data";
import type { BudgetPeriod, FinancialCategory } from "@/types/finance";

const periods: BudgetPeriod[] = ["Monthly", "Yearly"];
const alertThresholds = ["80%", "90%", "100%"];

function CategoryOption({
  category,
  isActive,
  onSelect,
}: {
  category: FinancialCategory;
  isActive: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      aria-pressed={isActive}
      className={
        isActive
          ? "rounded-lg border border-[#2170e4] bg-[#eff6ff] p-4 text-left shadow-sm"
          : "rounded-lg border border-[#c6c6cd]/70 bg-[#f8f9ff] p-4 text-left transition hover:border-[#2170e4]/50 hover:bg-[#eff4ff]"
      }
      onClick={onSelect}
      type="button"
    >
      <span className="flex items-center gap-3">
        <span className={`grid size-10 place-items-center rounded-md ${category.bg} ${category.tone}`}>
          <Icon className="size-5" name={category.icon} />
        </span>
        <span>
          <span className="block text-sm font-bold text-[#0b1c30]">{category.name}</span>
          <span className="mt-1 block text-xs font-medium text-[#45464d]">{category.description}</span>
        </span>
      </span>
      <span className="mt-4 flex items-center justify-between gap-3 border-t border-[#c6c6cd]/40 pt-3 text-xs font-semibold text-[#45464d]">
        <span>Avg {category.monthlyAverage}</span>
        <span>{category.transactionCount} txns</span>
      </span>
    </button>
  );
}

export function AddBudgetForm() {
  const expenseCategories = useMemo(() => getCategoriesForScope(categories, "Budgets", "Expense"), []);
  const [selectedCategoryId, setSelectedCategoryId] = useState(expenseCategories[0]?.id ?? "");
  const [period, setPeriod] = useState<BudgetPeriod>("Monthly");
  const [budgetAmount, setBudgetAmount] = useState("");
  const [startDate, setStartDate] = useState("2026-06-01");
  const [showErrors, setShowErrors] = useState(false);
  const selectedCategory = expenseCategories.find((category) => category.id === selectedCategoryId) ?? expenseCategories[0];
  const amountHasError = showErrors && budgetAmount.trim() === "";
  const startDateHasError = showErrors && startDate.trim() === "";

  function handleSaveBudget() {
    setShowErrors(budgetAmount.trim() === "" || startDate.trim() === "");
  }

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
      <div className="space-y-6 lg:col-span-8">
        <FormCard title="Budget Category">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {expenseCategories.map((category) => (
              <CategoryOption
                category={category}
                isActive={category.id === selectedCategoryId}
                key={category.id}
                onSelect={() => setSelectedCategoryId(category.id)}
              />
            ))}
          </div>
        </FormCard>

        <FormCard title="Budget Details">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div>
              <TextInput
                error={amountHasError}
                label="Budget Amount"
                onChange={setBudgetAmount}
                placeholder="800"
                type="number"
                value={budgetAmount}
              />
              {amountHasError ? <p className="mt-1 text-xs font-medium text-[#ba1a1a]">Budget amount is required.</p> : null}
            </div>
            <SelectInput label="Budget Period" onChange={(value) => setPeriod(value as BudgetPeriod)} options={periods} value={period} />
          </div>

          <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-2">
            <div>
              <TextInput error={startDateHasError} label="Start Date" onChange={setStartDate} placeholder="2026-06-01" value={startDate} />
              {startDateHasError ? <p className="mt-1 text-xs font-medium text-[#ba1a1a]">Start date is required.</p> : null}
            </div>
            <TextInput label="End Date" placeholder={period === "Monthly" ? "2026-06-30" : "2026-12-31"} />
          </div>

          <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-2">
            <SelectInput label="Alert Threshold" options={alertThresholds} />
            <SelectInput label="Status" options={["Active", "Paused"]} />
          </div>
        </FormCard>

        <FormCard title="Budget Notes">
          <TextAreaInput label="Description" placeholder="Optional note about this budget target..." />
        </FormCard>

        <div className="flex flex-col-reverse items-stretch justify-end gap-3 pt-2 sm:flex-row sm:items-center">
          <Link
            className="inline-flex h-10 items-center justify-center rounded-md px-4 text-sm font-semibold text-[#45464d] transition hover:bg-[#eff4ff]"
            href="/budgets"
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
            onClick={handleSaveBudget}
            type="button"
          >
            Save Budget
          </button>
        </div>
      </div>

      <aside className="hidden lg:col-span-4 lg:block">
        <div className="sticky top-24 rounded-lg border border-[#c6c6cd]/60 bg-[#eff4ff] p-6 shadow-[0_4px_20px_rgba(15,23,42,0.04)]">
          <div className="rounded-lg border border-[#c6c6cd]/60 bg-white p-5">
            <div className="mb-5 flex items-center gap-3">
              <span className={`grid size-12 place-items-center rounded-md ${selectedCategory.bg} ${selectedCategory.tone}`}>
                <Icon name={selectedCategory.icon} />
              </span>
              <div>
                <p className="text-xs font-bold uppercase text-[#45464d]">Budget Preview</p>
                <h3 className="text-xl font-semibold text-[#0b1c30]">{selectedCategory.name}</h3>
              </div>
            </div>

            <div className="rounded-lg border border-[#c6c6cd]/40 bg-[#f8f9ff] p-4">
              <p className="text-xs font-bold uppercase text-[#45464d]">{period} Limit</p>
              <p className="mt-2 text-4xl font-bold text-[#0b1c30]">{budgetAmount.trim() === "" ? "$0" : `$${budgetAmount}`}</p>
              <div className="mt-5 h-3 overflow-hidden rounded-full bg-[#dce9ff]">
                <div className="h-full w-0 rounded-full bg-[#0058be]" />
              </div>
              <div className="mt-2 flex justify-between text-xs font-semibold text-[#45464d]">
                <span>$0 spent</span>
                <span>0%</span>
              </div>
            </div>

            <dl className="mt-5 space-y-4 rounded-lg border border-[#c6c6cd]/40 bg-white p-4">
              <div className="flex items-center justify-between gap-4">
                <dt className="text-xs font-bold uppercase text-[#45464d]">Start</dt>
                <dd className="text-sm font-semibold text-[#0b1c30]">{startDate || "Not set"}</dd>
              </div>
              <div className="flex items-center justify-between gap-4">
                <dt className="text-xs font-bold uppercase text-[#45464d]">Alert</dt>
                <dd className="text-sm font-semibold text-[#0b1c30]">80%</dd>
              </div>
            </dl>
          </div>
        </div>
      </aside>
    </div>
  );
}
