"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

import { createSavingsGoal, updateSavingsGoal } from "@/app/savings-goals/actions";
import { useInteractionLoading } from "@/components/app/interaction-loading-provider";
import { Icon } from "@/components/ui/icon";
import { FormCard, SelectInput, TextAreaInput, TextInput } from "@/components/ui/form-controls";
import { LoadingButton } from "@/components/ui/loading-state";
import { ProgressCircle } from "@/components/ui/progress-circle";
import { ResponsiveAmount } from "@/components/ui/responsive-amount";
import { formatMmkPreview } from "@/lib/currency";
import { getCategoriesForScope } from "@/lib/categories/category-scopes";
import type { AccountRecord } from "@/lib/accounts/supabase";
import type { CategoryRecord } from "@/lib/categories/supabase";
import type { SavingsGoalFormData, SavingsGoalRecord } from "@/lib/savings-goals/supabase";

function parseAmount(value: string) {
  return Number(value.replace(/[^0-9.-]/g, ""));
}

const fallbackStyle = {
  bg: "bg-[#eff6ff]",
  icon: "target" as const,
  id: "",
  name: "Savings Goal",
  tone: "text-[#0058be]",
  type: "Savings Goal",
};

export function AddSavingsGoalForm({
  accounts,
  categories,
  goal,
}: {
  accounts: AccountRecord[];
  categories: CategoryRecord[];
  goal?: SavingsGoalRecord;
}) {
  const router = useRouter();
  const beginLoading = useInteractionLoading();
  const accountOptions = useMemo(
    () => accounts.filter((account) => account.status === "Active" && account.type !== "Credit Card"),
    [accounts],
  );
  const goalStyleCategories = useMemo(() => getCategoriesForScope(categories, "Savings Goals", "Savings Goal"), [categories]);
  const [selectedStyleId, setSelectedStyleId] = useState(goal?.categoryId ?? goalStyleCategories[0]?.id ?? "");
  const [accountId, setAccountId] = useState(goal?.accountId ?? accountOptions[0]?.id ?? "");
  const [name, setName] = useState(goal?.name ?? "");
  const [targetAmount, setTargetAmount] = useState(goal ? String(goal.targetAmountValue) : "");
  const [savedAmount, setSavedAmount] = useState(goal ? String(goal.savedAmountValue) : "");
  const [targetDate, setTargetDate] = useState(goal?.targetDateValue ?? "2026-12-31");
  const [monthlyContribution, setMonthlyContribution] = useState(goal ? String(goal.monthlyContributionValue) : "");
  const [description, setDescription] = useState(goal?.description ?? "");
  const [showErrors, setShowErrors] = useState(false);
  const [formError, setFormError] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const nameHasError = showErrors && name.trim() === "";
  const targetHasError = showErrors && targetAmount.trim() === "";
  const dateHasError = showErrors && targetDate.trim() === "";
  const target = parseAmount(targetAmount);
  const saved = parseAmount(savedAmount);
  const progressPercent = target > 0 ? Math.round((saved / target) * 100) : 0;
  const effectiveStyleId = selectedStyleId || goalStyleCategories[0]?.id || "";
  const effectiveAccountId = accountId || accountOptions[0]?.id || "";
  const selectedStyle = goalStyleCategories.find((category) => category.id === effectiveStyleId) ?? goalStyleCategories[0] ?? fallbackStyle;
  const selectedAccount = accountOptions.find((account) => account.id === effectiveAccountId);
  const selectedAccountName = selectedAccount?.name ?? "";

  async function handleSaveGoal(addAnother = false) {
    const hasErrors = name.trim() === "" || targetAmount.trim() === "" || targetDate.trim() === "";
    setShowErrors(hasErrors);
    setFormError("");
    if (hasErrors) return;

    const input: SavingsGoalFormData = {
      accountId: effectiveAccountId,
      categoryId: effectiveStyleId,
      description,
      monthlyContribution: monthlyContribution.trim() === "" ? 0 : Number(monthlyContribution),
      name,
      savedAmount: savedAmount.trim() === "" ? 0 : Number(savedAmount),
      targetAmount: Number(targetAmount),
      targetDate,
    };

    setIsSaving(true);
    const result = goal ? await updateSavingsGoal(goal.id, input) : await createSavingsGoal(input);
    if (result.error) {
      setIsSaving(false);
      setFormError(result.error);
      return;
    }

    if (addAnother && !goal) {
      setIsSaving(false);
      setName("");
      setTargetAmount("");
      setSavedAmount("");
      setMonthlyContribution("");
      setDescription("");
      setShowErrors(false);
      return;
    }

    beginLoading();
    router.push("/savings-goals");
    router.refresh();
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
            <SelectInput
              label="Savings Account"
              onChange={(accountName) => setAccountId(accountOptions.find((account) => account.name === accountName)?.id ?? "")}
              options={accountOptions.length > 0 ? accountOptions.map((account) => account.name) : ["No accounts available"]}
              value={selectedAccountName || "No accounts available"}
            />
            <p className="text-sm font-semibold text-[#45464d]">{selectedAccount?.name ?? "Create an account before linking a savings goal."}</p>
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
          {goalStyleCategories.length === 0 ? (
            <p className="text-sm font-medium text-[#45464d]">No savings goal categories found. Add a Savings Goal category first.</p>
          ) : null}
        </FormCard>

        <FormCard title="Notes">
          <TextAreaInput label="Description" onChange={setDescription} placeholder="Optional reason or plan for this savings goal..." value={description} />
        </FormCard>

        <div className="flex flex-col-reverse items-stretch justify-end gap-3 pt-2 sm:flex-row sm:items-center">
          {formError ? <div className="w-full rounded-md border border-[#fecaca] bg-[#fff1f0] px-4 py-2 text-sm font-medium text-[#991b1b]" role="alert">{formError}</div> : null}
          <Link
            className="inline-flex h-10 items-center justify-center rounded-md px-4 text-sm font-semibold text-[#45464d] transition hover:bg-[#eff4ff]"
            href="/savings-goals"
          >
            Cancel
          </Link>
          <button
            className="inline-flex h-10 items-center justify-center rounded-md border border-[#c6c6cd]/70 bg-[#eff4ff] px-4 text-sm font-semibold text-[#0058be] transition hover:bg-[#dce9ff]"
            disabled={isSaving || Boolean(goal)}
            onClick={() => handleSaveGoal(true)}
            type="button"
          >
            Save & Add Another
          </button>
          <LoadingButton
            className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-[#0b1c30] px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-[#1f2937]"
            isLoading={isSaving}
            loadingLabel="Saving…"
            onClick={() => handleSaveGoal(false)}
            type="button"
          >
            Save Goal
          </LoadingButton>
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
                <p className="mt-1 text-xs font-semibold text-[#45464d]">{selectedAccount?.name ?? "No account selected"}</p>
              </div>
            </div>

            <ProgressCircle percent={progressPercent} tone={selectedStyle.tone} />

            <dl className="mt-5 grid grid-cols-2 gap-3 text-center">
              <div>
                <dt className="mb-1 text-xs font-bold uppercase text-[#45464d]">Saved</dt>
                <dd><ResponsiveAmount className="font-semibold text-[#0b1c30]" maxSizeRem={1.125}>{savedAmount ? formatMmkPreview(savedAmount) : formatMmkPreview(0)}</ResponsiveAmount></dd>
              </div>
              <div>
                <dt className="mb-1 text-xs font-bold uppercase text-[#45464d]">Target</dt>
                <dd><ResponsiveAmount className="font-semibold text-[#0b1c30]" maxSizeRem={1.125}>{targetAmount ? formatMmkPreview(targetAmount) : formatMmkPreview(0)}</ResponsiveAmount></dd>
              </div>
            </dl>

            <div className="mt-5 border-t border-[#c6c6cd]/40 pt-4 text-center text-sm font-medium text-[#45464d]">
              Target: {targetDate || "Not set"}
            </div>
            <div className="mt-4 rounded-lg border border-[#c6c6cd]/40 bg-[#f8f9ff] p-4 text-sm font-medium text-[#45464d]">
              Monthly: <ResponsiveAmount className="font-semibold text-[#0b1c30]" maxSizeRem={0.875}>{monthlyContribution ? formatMmkPreview(monthlyContribution) : formatMmkPreview(0)}</ResponsiveAmount>
              <p className="mt-2">{description || "Savings plan note will appear here."}</p>
            </div>
          </div>
        </div>
      </aside>
    </div>
  );
}
