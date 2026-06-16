"use client";

import Link from "next/link";
import { useState } from "react";

import { Icon, type IconName } from "@/components/ui/icon";
import { FieldLabel, FormCard, SelectInput, TextAreaInput, TextInput } from "@/components/ui/form-controls";
import type { CategoryScope, CategoryType } from "@/types/finance";

type CategoryIconOption = {
  label: string;
  icon: IconName;
};

type CategoryColorOption = {
  label: string;
  marker: string;
  bg: string;
  tone: string;
};

const categoryTypes: CategoryType[] = ["Expense", "Income"];
const categoryIcons: CategoryIconOption[] = [
  { label: "Food", icon: "food" },
  { label: "Travel", icon: "travel" },
  { label: "Housing", icon: "home" },
  { label: "Shopping", icon: "shopping" },
  { label: "Savings", icon: "savings" },
  { label: "Income", icon: "trendingUp" },
  { label: "Medical", icon: "medical" },
  { label: "Subscription", icon: "subscriptions" },
];
const categoryColors: CategoryColorOption[] = [
  { label: "Green", marker: "bg-[#047857]", bg: "bg-[#ecfdf5]", tone: "text-[#047857]" },
  { label: "Blue", marker: "bg-[#2170e4]", bg: "bg-[#eff6ff]", tone: "text-[#0058be]" },
  { label: "Indigo", marker: "bg-[#4f46e5]", bg: "bg-[#eef2ff]", tone: "text-[#4f46e5]" },
  { label: "Amber", marker: "bg-[#92400e]", bg: "bg-[#fffbeb]", tone: "text-[#92400e]" },
  { label: "Red", marker: "bg-[#b42318]", bg: "bg-[#fff1f0]", tone: "text-[#b42318]" },
  { label: "Gray", marker: "bg-[#76777d]", bg: "bg-[#f8f9ff]", tone: "text-[#45464d]" },
];
const categoryScopes: CategoryScope[] = ["Transactions", "Accounts", "Budgets", "Savings Goals", "Debts", "Subscriptions", "Assets", "Reports"];

export function AddCategoryForm() {
  const [selectedType, setSelectedType] = useState<CategoryType>("Expense");
  const [selectedIcon, setSelectedIcon] = useState<CategoryIconOption>(categoryIcons[0]);
  const [selectedColor, setSelectedColor] = useState<CategoryColorOption>(categoryColors[0]);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [monthlyAverage, setMonthlyAverage] = useState("");
  const [selectedScopes, setSelectedScopes] = useState<CategoryScope[]>(["Transactions"]);
  const [showErrors, setShowErrors] = useState(false);
  const nameHasError = showErrors && name.trim() === "";
  const averageHasError = showErrors && monthlyAverage.trim() === "";
  const scopesHaveError = showErrors && selectedScopes.length === 0;

  function handleSaveCategory() {
    setShowErrors(name.trim() === "" || monthlyAverage.trim() === "" || selectedScopes.length === 0);
  }

  function toggleScope(scope: CategoryScope) {
    setSelectedScopes((currentScopes) =>
      currentScopes.includes(scope) ? currentScopes.filter((currentScope) => currentScope !== scope) : [...currentScopes, scope],
    );
  }

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
      <div className="space-y-6 lg:col-span-8">
        <FormCard title="Category Type">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {categoryTypes.map((type) => {
              const isActive = selectedType === type;

              return (
                <button
                  aria-pressed={isActive}
                  className={
                    isActive
                      ? "rounded-lg border border-[#bfdbfe] bg-[#eff6ff] p-4 text-left text-[#0058be] shadow-sm"
                      : "rounded-lg border border-[#c6c6cd]/70 bg-[#f8f9ff] p-4 text-left text-[#45464d] transition hover:border-[#2170e4]/50 hover:bg-[#eff4ff]"
                  }
                  key={type}
                  onClick={() => setSelectedType(type)}
                  type="button"
                >
                  <span className="mb-2 flex items-center gap-2 text-sm font-bold">
                    <Icon className="size-5" name={type === "Expense" ? "trendingDown" : "trendingUp"} />
                    {type}
                  </span>
                  <span className="block text-xs font-medium leading-5">
                    {type === "Expense" ? "Classify money spent from accounts." : "Classify money received into accounts."}
                  </span>
                </button>
              );
            })}
          </div>
        </FormCard>

        <FormCard title="Category Details">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div>
              <TextInput error={nameHasError} label="Category Name" onChange={setName} placeholder="Food" value={name} />
              {nameHasError ? <p className="mt-1 text-xs font-medium text-[#ba1a1a]">Category name is required.</p> : null}
            </div>
            <div>
              <TextInput
                error={averageHasError}
                label="Monthly Average"
                onChange={setMonthlyAverage}
                placeholder="850"
                type="number"
                value={monthlyAverage}
              />
              {averageHasError ? <p className="mt-1 text-xs font-medium text-[#ba1a1a]">Monthly average is required.</p> : null}
            </div>
          </div>

          <div className="mt-5">
            <TextAreaInput label="Description" onChange={setDescription} placeholder="Groceries and dining out..." value={description} />
          </div>

          <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-2">
            <SelectInput label="Status" options={["Active", "Hidden"]} />
            <SelectInput label="Budget Tracking" options={["Included in budgets", "Excluded from budgets"]} />
          </div>
        </FormCard>

        <FormCard title="Category Usage">
          <FieldLabel>Create this category for</FieldLabel>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {categoryScopes.map((scope) => {
              const isActive = selectedScopes.includes(scope);

              return (
                <button
                  aria-pressed={isActive}
                  className={
                    isActive
                      ? "rounded-lg border border-[#2170e4] bg-[#eff6ff] p-4 text-left text-[#0058be] shadow-sm"
                      : "rounded-lg border border-[#c6c6cd]/70 bg-white p-4 text-left text-[#45464d] transition hover:bg-[#eff4ff]"
                  }
                  key={scope}
                  onClick={() => toggleScope(scope)}
                  type="button"
                >
                  <span className="text-sm font-bold">{scope}</span>
                </button>
              );
            })}
          </div>
          {scopesHaveError ? <p className="mt-2 text-xs font-medium text-[#ba1a1a]">Select at least one usage.</p> : null}
        </FormCard>

        <FormCard title="Icon and Color">
          <div>
            <FieldLabel>Icon</FieldLabel>
            <div className="grid grid-cols-4 gap-2 sm:grid-cols-8">
              {categoryIcons.map((option) => {
                const isActive = selectedIcon.icon === option.icon;

                return (
                  <button
                    aria-label={option.label}
                    aria-pressed={isActive}
                    className={
                      isActive
                        ? "grid size-11 place-items-center rounded-lg border border-[#2170e4] bg-[#eff6ff] text-[#0058be]"
                        : "grid size-11 place-items-center rounded-lg border border-[#c6c6cd]/70 bg-white text-[#45464d] transition hover:bg-[#eff4ff]"
                    }
                    key={option.label}
                    onClick={() => setSelectedIcon(option)}
                    title={option.label}
                    type="button"
                  >
                    <Icon name={option.icon} />
                  </button>
                );
              })}
            </div>
          </div>

          <div className="mt-5">
            <FieldLabel>Color</FieldLabel>
            <div className="flex flex-wrap gap-2">
              {categoryColors.map((option) => {
                const isActive = selectedColor.label === option.label;

                return (
                  <button
                    aria-label={option.label}
                    aria-pressed={isActive}
                    className={
                      isActive
                        ? "grid size-10 place-items-center rounded-lg border border-[#0b1c30] bg-white"
                        : "grid size-10 place-items-center rounded-lg border border-[#c6c6cd]/70 bg-white transition hover:bg-[#eff4ff]"
                    }
                    key={option.label}
                    onClick={() => setSelectedColor(option)}
                    title={option.label}
                    type="button"
                  >
                    <span className={`size-5 rounded-full ${option.marker}`} />
                  </button>
                );
              })}
            </div>
          </div>
        </FormCard>

        <div className="flex flex-col-reverse items-stretch justify-end gap-3 pt-2 sm:flex-row sm:items-center">
          <Link
            className="inline-flex h-10 items-center justify-center rounded-md px-4 text-sm font-semibold text-[#45464d] transition hover:bg-[#eff4ff]"
            href="/categories"
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
            onClick={handleSaveCategory}
            type="button"
          >
            Save Category
          </button>
        </div>
      </div>

      <aside className="hidden lg:col-span-4 lg:block">
        <div className="sticky top-24 rounded-lg border border-[#c6c6cd]/60 bg-[#eff4ff] p-6 shadow-[0_4px_20px_rgba(15,23,42,0.04)]">
          <div className="rounded-lg border border-[#c6c6cd]/60 bg-white p-5">
            <div className="mb-6 flex items-start justify-between gap-4">
              <span className={`grid size-12 place-items-center rounded-full ${selectedColor.bg} ${selectedColor.tone}`}>
                <Icon name={selectedIcon.icon} />
              </span>
              <span className={`size-3 rounded-full ${selectedColor.marker}`} />
            </div>
            <div className="mb-1 flex items-center gap-2">
              <h3 className="text-xl font-semibold text-[#0b1c30]">{name || "New Category"}</h3>
              <span className="rounded border border-[#c6c6cd]/40 bg-[#eff4ff] px-2 py-0.5 text-xs font-semibold text-[#45464d]">
                {selectedType}
              </span>
            </div>
            <p className="mb-4 text-sm text-[#45464d]">{description || "Category description preview"}</p>
            <div className="mb-4 flex flex-wrap gap-1.5">
              {selectedScopes.map((scope) => (
                <span className="rounded bg-[#f8f9ff] px-2 py-1 text-xs font-semibold text-[#45464d]" key={scope}>
                  {scope}
                </span>
              ))}
            </div>
            <div className="flex items-end justify-between gap-4 border-t border-[#c6c6cd]/40 pt-4">
              <div>
                <span className="mb-1 block text-xs font-bold uppercase text-[#45464d]">Monthly Avg</span>
                <span className="text-2xl font-semibold text-[#0b1c30]">{monthlyAverage ? `$${monthlyAverage}` : "$0"}</span>
              </div>
              <span className="text-right text-xs font-semibold text-[#45464d]">0 Transactions</span>
            </div>
          </div>
        </div>
      </aside>
    </div>
  );
}
