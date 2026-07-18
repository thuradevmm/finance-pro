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
import { useToast } from "@/components/ui/toast-provider";
import { formatMmkPreview } from "@/lib/currency";
import { isValidCalendarDate } from "@/lib/date-validation";
import { getCategoriesForScope } from "@/lib/categories/category-scopes";
import { findAccountByOptionLabel, getAccountOptionDescription, getAccountOptionLabel, getAccountOptionLabels, type AccountRecord } from "@/lib/accounts/supabase";
import type { CategoryRecord } from "@/lib/categories/supabase";
import type { SavingsGoalFormData, SavingsGoalRecord } from "@/lib/savings-goals/supabase";

function parseAmount(value: string) {
  return Number(value.replace(/[^0-9.-]/g, ""));
}

function defaultTargetDate() {
  const today = new Date();
  const target = new Date(today);
  const month = target.getMonth();
  target.setFullYear(target.getFullYear() + 1);
  if (target.getMonth() !== month) target.setDate(0);
  return `${target.getFullYear()}-${String(target.getMonth() + 1).padStart(2, "0")}-${String(target.getDate()).padStart(2, "0")}`;
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
  const { showError, showSuccess } = useToast();
  const router = useRouter();
  const beginLoading = useInteractionLoading();
  const accountOptions = useMemo(
    () => accounts.filter((account) => account.status !== "Archived" && account.type !== "Credit Card"),
    [accounts],
  );
  const goalStyleCategories = useMemo(() => getCategoriesForScope(categories, "Savings Goals", "Savings Goal"), [categories]);
  const [selectedStyleId, setSelectedStyleId] = useState(goal?.categoryId ?? goalStyleCategories[0]?.id ?? "");
  const [accountId, setAccountId] = useState(goal?.accountId ?? accountOptions[0]?.id ?? "");
  const [name, setName] = useState(goal?.name ?? "");
  const [targetAmount, setTargetAmount] = useState(goal ? String(goal.targetAmountValue) : "");
  const [savedAmount, setSavedAmount] = useState(goal ? String(goal.storedSavedAmountValue) : "");
  const [targetDate, setTargetDate] = useState(goal?.targetDateValue ?? defaultTargetDate());
  const [monthlyContribution, setMonthlyContribution] = useState(goal ? String(goal.monthlyContributionValue) : "");
  const [description, setDescription] = useState(goal?.description ?? "");
  const [showErrors, setShowErrors] = useState(false);
  const [formError, setFormError] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const nameHasError = showErrors && name.trim() === "";
  const savedIsInvalid = savedAmount.trim() !== "" && (!Number.isFinite(parseAmount(savedAmount)) || parseAmount(savedAmount) < 0);
  const contributionIsInvalid = monthlyContribution.trim() !== "" && (!Number.isFinite(parseAmount(monthlyContribution)) || parseAmount(monthlyContribution) < 0);
  const targetHasError = showErrors && (targetAmount.trim() === "" || !Number.isFinite(parseAmount(targetAmount)) || parseAmount(targetAmount) <= 0);
  const savedHasError = showErrors && savedIsInvalid;
  const contributionHasError = showErrors && contributionIsInvalid;
  const dateHasError = showErrors && !isValidCalendarDate(targetDate);
  const target = parseAmount(targetAmount);
  const storedSaved = Number.isFinite(parseAmount(savedAmount)) ? parseAmount(savedAmount) : 0;
  const linkedSaved = goal?.linkedSavedAmountValue ?? 0;
  const saved = Math.max(0, storedSaved + linkedSaved);
  const progressPercent = target > 0 ? Math.min(100, Math.round((saved / target) * 100)) : 0;
  const effectiveStyleId = selectedStyleId || goalStyleCategories[0]?.id || "";
  const effectiveAccountId = accountId || accountOptions[0]?.id || "";
  const selectedStyle = goalStyleCategories.find((category) => category.id === effectiveStyleId) ?? goalStyleCategories[0] ?? fallbackStyle;
  const selectedAccount = accountOptions.find((account) => account.id === effectiveAccountId);
  const selectedAccountName = selectedAccount ? getAccountOptionLabel(selectedAccount, accountOptions) : "";

  async function handleSaveGoal(addAnother = false) {
    const hasErrors = name.trim() === ""
      || targetAmount.trim() === ""
      || !Number.isFinite(target)
      || target <= 0
      || savedIsInvalid
      || contributionIsInvalid
      || !isValidCalendarDate(targetDate);
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
      showError(result.error);
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
      showSuccess("Savings goal saved successfully.");
      return;
    }

    showSuccess(goal ? "Savings goal updated successfully." : "Savings goal saved successfully.");
    beginLoading();
    router.push("/savings-goals");
    router.refresh();
  }

  return (
    <div className="grid min-w-0 grid-cols-1 gap-6 xl:grid-cols-12">
      <div className="min-w-0 space-y-6 xl:col-span-8">
        <FormCard title="Goal Details">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div>
              <TextInput error={nameHasError} label="Goal Name" onChange={setName} placeholder="Emergency Fund" value={name} />
              {nameHasError ? <p className="mt-1 text-xs font-medium text-[#ba1a1a]">Goal name is required.</p> : null}
            </div>
            <SelectInput
              label="Savings Account"
              onChange={(accountName) => setAccountId(findAccountByOptionLabel(accountOptions, accountName)?.id ?? "")}
              options={accountOptions.length > 0 ? getAccountOptionLabels(accountOptions) : ["No accounts available"]}
              value={selectedAccountName || "No accounts available"}
            />
            <p className="text-sm font-semibold text-[#45464d]">{selectedAccount ? getAccountOptionDescription(selectedAccount) : "Create an account before linking a savings goal."}</p>
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
            <div>
              <TextInput error={savedHasError} label="Already Saved (Manual)" onChange={setSavedAmount} placeholder="0" type="number" value={savedAmount} />
              {savedHasError ? <p className="mt-1 text-xs font-medium text-[#ba1a1a]">Already saved amount cannot be negative.</p> : null}
              {goal && linkedSaved !== 0 ? <p className="mt-1 text-xs font-semibold text-[#45464d]">Linked activity {linkedSaved > 0 ? "adds" : "subtracts"} {formatMmkPreview(Math.abs(linkedSaved))}; it is preserved separately when you edit.</p> : null}
            </div>
          </div>

          <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-2">
            <div>
              <TextInput error={dateHasError} label="Target Date" onChange={setTargetDate} placeholder="YYYY-MM-DD" type="date" value={targetDate} />
              {dateHasError ? <p className="mt-1 text-xs font-medium text-[#ba1a1a]">Target date is required.</p> : null}
            </div>
            <div>
              <TextInput error={contributionHasError} label="Monthly Contribution" onChange={setMonthlyContribution} placeholder="500" type="number" value={monthlyContribution} />
              {contributionHasError ? <p className="mt-1 text-xs font-medium text-[#ba1a1a]">Monthly contribution cannot be negative.</p> : null}
            </div>
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

        <div className="space-y-3 pt-2">
          {formError ? <div className="w-full rounded-md border border-[#fecaca] bg-[#fff1f0] px-4 py-2 text-sm font-medium text-[#991b1b]" role="alert">{formError}</div> : null}
          <div className="flex flex-col-reverse items-stretch justify-end gap-3 sm:flex-row sm:items-center">
            <Link
              className="inline-flex min-h-11 items-center justify-center rounded-md px-4 text-sm font-semibold text-[#45464d] transition hover:bg-[#eff4ff]"
              href="/savings-goals"
            >
              Cancel
            </Link>
            <button
              className="inline-flex min-h-11 items-center justify-center rounded-md border border-[#c6c6cd]/70 bg-[#eff4ff] px-4 text-sm font-semibold text-[#0058be] transition hover:bg-[#dce9ff]"
              disabled={isSaving || Boolean(goal)}
              onClick={() => handleSaveGoal(true)}
              type="button"
            >
              Save & Add Another
            </button>
            <LoadingButton
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md bg-[#0b1c30] px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-[#1f2937]"
              isLoading={isSaving}
              loadingLabel="Saving…"
              onClick={() => handleSaveGoal(false)}
              type="button"
            >
              Save Goal
            </LoadingButton>
          </div>
        </div>
      </div>

      <aside className="hidden min-w-0 xl:col-span-4 xl:block">
        <div className="sticky top-24 rounded-lg border border-[#c6c6cd]/60 bg-[#eff4ff] p-6 shadow-[0_4px_20px_rgba(15,23,42,0.04)]">
          <div className="rounded-lg border border-[#c6c6cd]/60 bg-white p-5">
            <div className="mb-5 flex items-center gap-3 border-b border-[#c6c6cd]/40 pb-4">
              <span className={`grid size-11 place-items-center rounded-lg ${selectedStyle.bg} ${selectedStyle.tone}`}>
                <Icon name={selectedStyle.icon} />
              </span>
              <div>
                <p className="text-xs font-bold uppercase text-[#45464d]">Goal Preview</p>
                <h3 className="text-xl font-semibold text-[#0b1c30]">{name || "New Savings Goal"}</h3>
                <p className="mt-1 text-xs font-semibold text-[#45464d]">{selectedAccount ? getAccountOptionLabel(selectedAccount, accountOptions) : "No account selected"}</p>
              </div>
            </div>

            <ProgressCircle percent={progressPercent} tone={selectedStyle.tone} />

            <dl className="mt-5 grid grid-cols-2 gap-3 text-center">
              <div>
                <dt className="mb-1 text-xs font-bold uppercase text-[#45464d]">Saved</dt>
                <dd><ResponsiveAmount className="font-semibold text-[#0b1c30]" maxSizeRem={1.125}>{formatMmkPreview(saved)}</ResponsiveAmount></dd>
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
