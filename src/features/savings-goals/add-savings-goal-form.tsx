"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import { Icon } from "@/components/ui/icon";
import { FormCard, SelectInput, TextAreaInput, TextInput } from "@/components/ui/form-controls";
import { ProgressCircle } from "@/components/ui/progress-circle";
import { accounts } from "@/lib/accounts/mock-data";
import { getCategoriesForScope } from "@/lib/categories/category-scopes";
import { categories } from "@/lib/categories/mock-data";

function parseAmount(value: string) {
  return Number(value.replace(/[^0-9.-]/g, ""));
}

export function AddSavingsGoalForm() {
  const accountOptions = useMemo(() => accounts.filter((account) => account.status === "Active").map((account) => account.name), []);
  const goalStyleCategories = useMemo(() => getCategoriesForScope(categories, "Savings Goals"), []);
  const [selectedStyleId, setSelectedStyleId] = useState(goalStyleCategories[0]?.id ?? "");
  const [account, setAccount] = useState(accountOptions[0] ?? "High-Yield Savings");
  const [name, setName] = useState("");
  const [targetAmount, setTargetAmount] = useState("");
  const [savedAmount, setSavedAmount] = useState("");
  const [targetDate, setTargetDate] = useState("2026-12-31");
  const [monthlyContribution, setMonthlyContribution] = useState("");
  const [description, setDescription] = useState("");
  const [showErrors, setShowErrors] = useState(false);
  const nameHasError = showErrors && name.trim() === "";
  const targetHasError = showErrors && targetAmount.trim() === "";
  const dateHasError = showErrors && targetDate.trim() === "";
  const target = parseAmount(targetAmount);
  const saved = parseAmount(savedAmount);
  const progressPercent = target > 0 ? Math.round((saved / target) * 100) : 0;
  const selectedStyle = goalStyleCategories.find((category) => category.id === selectedStyleId) ?? goalStyleCategories[0];

  function handleSaveGoal() {
    setShowErrors(name.trim() === "" || targetAmount.trim() === "" || targetDate.trim() === "");
  }

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
      <div className="space-y-6 lg:col-span-8">
        <FormCard title="Goal Details">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div>
              <TextInput error={nameHasError} label="Goal Name" onChange={setName} placeholder="Emergency Fund" value={name} />
              {nameHasError ? <p className="mt-1 text-xs font-medium text-[#ba1a1a]">Goal name is required.</p> : null}
            </div>
            <SelectInput label="Savings Account" onChange={setAccount} options={accountOptions.length > 0 ? accountOptions : ["High-Yield Savings"]} value={account} />
          </div>

          <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-2">
            <div>
              <TextInput
                error={targetHasError}
                label="Target Amount"
                onChange={setTargetAmount}
                placeholder="10000"
                type="number"
                value={targetAmount}
              />
              {targetHasError ? <p className="mt-1 text-xs font-medium text-[#ba1a1a]">Target amount is required.</p> : null}
            </div>
            <TextInput label="Already Saved" onChange={setSavedAmount} placeholder="0" type="number" value={savedAmount} />
          </div>

          <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-2">
            <div>
              <TextInput error={dateHasError} label="Target Date" onChange={setTargetDate} placeholder="2026-12-31" value={targetDate} />
              {dateHasError ? <p className="mt-1 text-xs font-medium text-[#ba1a1a]">Target date is required.</p> : null}
            </div>
            <TextInput label="Monthly Contribution" onChange={setMonthlyContribution} placeholder="500" type="number" value={monthlyContribution} />
          </div>
        </FormCard>

        <FormCard title="Goal Style">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {goalStyleCategories.map((category) => {
              const isActive = selectedStyle.id === category.id;

              return (
                <button
                  aria-pressed={isActive}
                  className={
                    isActive
                      ? "rounded-lg border border-[#2170e4] bg-[#eff6ff] p-4 text-left shadow-sm"
                      : "rounded-lg border border-[#c6c6cd]/70 bg-white p-4 text-left transition hover:bg-[#eff4ff]"
                  }
                  key={category.id}
                  onClick={() => setSelectedStyleId(category.id)}
                  type="button"
                >
                  <span className={`mb-3 grid size-10 place-items-center rounded-lg ${category.bg} ${category.tone}`}>
                    <Icon name={category.icon} />
                  </span>
                  <span className="block text-sm font-semibold text-[#0b1c30]">{category.name}</span>
                  <span className="mt-1 block text-xs font-medium text-[#45464d]">{category.type}</span>
                </button>
              );
            })}
          </div>
        </FormCard>

        <FormCard title="Notes">
          <TextAreaInput label="Description" onChange={setDescription} placeholder="Optional reason or plan for this savings goal..." value={description} />
        </FormCard>

        <div className="flex flex-col-reverse items-stretch justify-end gap-3 pt-2 sm:flex-row sm:items-center">
          <Link
            className="inline-flex h-10 items-center justify-center rounded-md px-4 text-sm font-semibold text-[#45464d] transition hover:bg-[#eff4ff]"
            href="/savings-goals"
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
            onClick={handleSaveGoal}
            type="button"
          >
            Save Goal
          </button>
        </div>
      </div>

      <aside className="hidden lg:col-span-4 lg:block">
        <div className="sticky top-24 rounded-lg border border-[#c6c6cd]/60 bg-[#eff4ff] p-6 shadow-[0_4px_20px_rgba(15,23,42,0.04)]">
          <div className="rounded-lg border border-[#c6c6cd]/60 bg-white p-5">
            <div className="mb-5 flex items-center gap-3 border-b border-[#c6c6cd]/40 pb-4">
              <span className={`grid size-11 place-items-center rounded-lg ${selectedStyle.bg} ${selectedStyle.tone}`}>
                <Icon name={selectedStyle.icon} />
              </span>
              <div>
                <p className="text-xs font-bold uppercase text-[#45464d]">Goal Preview</p>
                <h3 className="text-xl font-semibold text-[#0b1c30]">{name || "New Savings Goal"}</h3>
                <p className="mt-1 text-xs font-semibold text-[#45464d]">{account}</p>
              </div>
            </div>

            <ProgressCircle percent={progressPercent} tone={selectedStyle.tone} />

            <dl className="mt-5 grid grid-cols-2 gap-3 text-center">
              <div>
                <dt className="mb-1 text-xs font-bold uppercase text-[#45464d]">Saved</dt>
                <dd className="text-lg font-semibold text-[#0b1c30]">{savedAmount ? `$${savedAmount}` : "$0"}</dd>
              </div>
              <div>
                <dt className="mb-1 text-xs font-bold uppercase text-[#45464d]">Target</dt>
                <dd className="text-lg font-semibold text-[#0b1c30]">{targetAmount ? `$${targetAmount}` : "$0"}</dd>
              </div>
            </dl>

            <div className="mt-5 border-t border-[#c6c6cd]/40 pt-4 text-center text-sm font-medium text-[#45464d]">
              Target: {targetDate || "Not set"}
            </div>
            <div className="mt-4 rounded-lg border border-[#c6c6cd]/40 bg-[#f8f9ff] p-4 text-sm font-medium text-[#45464d]">
              Monthly: <span className="font-semibold text-[#0b1c30]">{monthlyContribution ? `$${monthlyContribution}` : "$0"}</span>
              <p className="mt-2">{description || "Savings plan note will appear here."}</p>
            </div>
          </div>
        </div>
      </aside>
    </div>
  );
}
