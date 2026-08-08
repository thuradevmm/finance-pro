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
import { getAccountCategoryForId, getAccountCategoryOptions, getAccountsForCategory } from "@/lib/accounts/selection";
import { findAccountByOptionLabel, getAccountOptionDescription, getAccountOptionLabel, getAccountOptionLabels, type AccountRecord } from "@/lib/accounts/supabase";
import type { CategoryRecord } from "@/lib/categories/supabase";
import type { SavingsGoalFormData, SavingsGoalRecord } from "@/lib/savings-goals/supabase";
import type { SavingsContributionType, SavingsGoalType } from "@/types/finance";

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
  const eligibleAccountOptions = useMemo(
    () => accounts.filter((account) => account.status !== "Archived" && account.type !== "Credit Card"),
    [accounts],
  );
  const goalStyleCategories = useMemo(() => getCategoriesForScope(categories, "Savings Goals", "Savings Goal"), [categories]);
  const [selectedStyleId, setSelectedStyleId] = useState(goal?.categoryId ?? goalStyleCategories[0]?.id ?? "");
  const initialAccountId = goal?.accountId ?? eligibleAccountOptions[0]?.id ?? "";
  const [accountCategory, setAccountCategory] = useState(getAccountCategoryForId(eligibleAccountOptions, initialAccountId));
  const accountCategoryOptions = useMemo(() => getAccountCategoryOptions(eligibleAccountOptions), [eligibleAccountOptions]);
  const accountOptions = useMemo(
    () => getAccountsForCategory(eligibleAccountOptions, accountCategory),
    [accountCategory, eligibleAccountOptions],
  );
  const [accountId, setAccountId] = useState(initialAccountId);
  const [goalType, setGoalType] = useState<SavingsGoalType>(goal?.goalType ?? "Target");
  const [name, setName] = useState(goal?.name ?? "");
  const [targetAmount, setTargetAmount] = useState(goal ? String(goal.targetAmountValue) : "");
  const [targetDate, setTargetDate] = useState(goal?.targetDateValue ?? defaultTargetDate());
  const [monthlyContribution, setMonthlyContribution] = useState(goal ? String(goal.monthlyContributionValue) : "");
  const [contributionType, setContributionType] = useState<SavingsContributionType>(goal?.contributionType ?? "Fixed");
  const [contributionPercentage, setContributionPercentage] = useState(goal?.contributionPercentage ? String(goal.contributionPercentage) : "");
  const [description, setDescription] = useState(goal?.description ?? "");
  const [showErrors, setShowErrors] = useState(false);
  const [formError, setFormError] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const nameHasError = showErrors && name.trim() === "";
  const contributionIsInvalid = contributionType === "Fixed"
    ? monthlyContribution.trim() !== "" && (!Number.isFinite(parseAmount(monthlyContribution)) || parseAmount(monthlyContribution) < 0)
    : contributionPercentage.trim() === "" || !Number.isFinite(Number(contributionPercentage)) || Number(contributionPercentage) <= 0 || Number(contributionPercentage) > 100;
  const targetHasError = showErrors && goalType === "Target" && (targetAmount.trim() === "" || !Number.isFinite(parseAmount(targetAmount)) || parseAmount(targetAmount) <= 0);
  const contributionHasError = showErrors && contributionIsInvalid;
  const dateHasError = showErrors && goalType === "Target" && !isValidCalendarDate(targetDate);
  const target = parseAmount(targetAmount);
  const saved = goal?.savedAmountValue ?? 0;
  const progressPercent = target > 0 ? Math.min(100, Math.round((saved / target) * 100)) : 0;
  const effectiveStyleId = selectedStyleId || goalStyleCategories[0]?.id || "";
  const effectiveAccountId = accountId || accountOptions[0]?.id || "";
  const selectedStyle = goalStyleCategories.find((category) => category.id === effectiveStyleId) ?? goalStyleCategories[0] ?? fallbackStyle;
  const selectedAccount = accountOptions.find((account) => account.id === effectiveAccountId);
  const effectiveAccountAmountType = name.trim() || goal?.accountAmountType || "Goal name";
  const selectedAccountName = selectedAccount ? getAccountOptionLabel(selectedAccount, accountOptions) : "";

  async function handleSaveGoal(addAnother = false) {
    const hasErrors = name.trim() === ""
      || (goalType === "Target" && (targetAmount.trim() === "" || !Number.isFinite(target) || target <= 0))
      || contributionIsInvalid
      || (goalType === "Target" && !isValidCalendarDate(targetDate))
      || !selectedAccount;
    setShowErrors(hasErrors);
    setFormError("");
    if (hasErrors) return;

    const input: SavingsGoalFormData = {
      accountId: effectiveAccountId,
      accountAmountType: effectiveAccountAmountType,
      categoryId: effectiveStyleId,
      contributionPercentage: contributionType === "Percentage" ? Number(contributionPercentage) : 0,
      contributionType,
      description,
      monthlyContribution: monthlyContribution.trim() === "" ? 0 : Number(monthlyContribution),
      name,
      goalType,
      savedAmount: 0,
      targetAmount: goalType === "Target" ? Number(targetAmount) : 0,
      targetDate: goalType === "Target" ? targetDate : "",
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
      setMonthlyContribution("");
      setContributionPercentage("");
      setDescription("");
      setShowErrors(false);
      showSuccess("Savings goal saved successfully.");
      return;
    }

    showSuccess(goal ? "Savings goal updated successfully." : "Savings goal saved successfully.");
    beginLoading();
    router.push("/savings-goals");
  }

  return (
    <div className="grid min-w-0 grid-cols-1 gap-6 xl:grid-cols-12">
      <div className="min-w-0 space-y-6 xl:col-span-8">
        <FormCard title="Savings Type">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {(["Fund", "Target"] as SavingsGoalType[]).map((type) => (
              <button
                aria-pressed={goalType === type}
                className={goalType === type ? "rounded-lg border border-[#2170e4] bg-[#eff6ff] p-4 text-left text-[#0058be] shadow-sm" : "rounded-lg border border-[#c6c6cd]/70 bg-[#f8f9ff] p-4 text-left text-[#45464d]"}
                key={type}
                onClick={() => setGoalType(type)}
                type="button"
              >
                <span className="block text-sm font-bold">{type === "Fund" ? "Reusable fund / capital" : "Target goal"}</span>
                <span className="mt-1 block text-xs leading-5">{type === "Fund" ? "Open-ended money you can add to and use later; no target amount or date." : "Save toward a defined amount by a target date."}</span>
              </button>
            ))}
          </div>
        </FormCard>
        <FormCard title="Goal Details">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div>
              <TextInput error={nameHasError} label="Goal Name" onChange={setName} placeholder="Emergency Fund" value={name} />
              {nameHasError ? <p className="mt-1 text-xs font-medium text-[#ba1a1a]">Goal name is required.</p> : null}
            </div>
            <SelectInput
              label="Account Category"
              onChange={(category) => {
                const nextAccount = getAccountsForCategory(eligibleAccountOptions, category)[0];
                setAccountCategory(category);
                setAccountId(nextAccount?.id ?? "");
              }}
              options={accountCategoryOptions.length > 0 ? accountCategoryOptions : ["No account categories"]}
              value={accountCategory || "No account categories"}
            />
            <SelectInput
              label="Savings Account"
              onChange={(accountName) => {
                const nextAccount = findAccountByOptionLabel(accountOptions, accountName);
                setAccountId(nextAccount?.id ?? "");
              }}
              options={accountOptions.length > 0 ? getAccountOptionLabels(accountOptions) : ["No accounts available"]}
              value={selectedAccountName || "No accounts available"}
            />
            <p className="text-sm font-semibold text-[#45464d] md:col-span-2">{selectedAccount ? getAccountOptionDescription(selectedAccount) : "Create an account before linking a savings goal."}</p>
            <div className="rounded-lg border border-[#bfdbfe] bg-[#eff6ff] p-4 text-sm font-medium leading-6 text-[#45464d] md:col-span-2">
              Finance Pro will create an account amount type named <strong className="text-[#0b1c30]">{effectiveAccountAmountType}</strong>. Fund it with a linked Transfer transaction so capital moves from an existing amount type into this goal.
            </div>
          </div>

          <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-2">
            {goalType === "Target" ? <div>
              <TextInput
                error={targetHasError}
                label="Target Amount"
                onChange={setTargetAmount}
                placeholder="10000"
                type="amount"
                value={targetAmount}
              />
              {targetHasError ? <p className="mt-1 text-xs font-medium text-[#ba1a1a]">Target amount is required.</p> : null}
            </div> : null}
            <div className="rounded-lg border border-[#c6c6cd]/60 bg-[#f8f9ff] p-4">
              <p className="text-xs font-bold uppercase text-[#45464d]">Saved through transactions</p>
              <ResponsiveAmount className="mt-2 font-semibold text-[#0b1c30]" maxSizeRem={1.125}>{formatMmkPreview(saved)}</ResponsiveAmount>
              <p className="mt-2 text-xs font-medium leading-5 text-[#45464d]">Manual opening savings are disabled; every contribution remains reconcilable to a capital transfer.</p>
            </div>
          </div>

          <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-2">
            {goalType === "Target" ? <div>
              <TextInput error={dateHasError} label="Target Date" onChange={setTargetDate} placeholder="YYYY-MM-DD" type="date" value={targetDate} />
              {dateHasError ? <p className="mt-1 text-xs font-medium text-[#ba1a1a]">Target date is required.</p> : null}
            </div> : null}
            <div>
              <SelectInput label="Contribution Rule" onChange={(value) => setContributionType(value === "Percentage of planned surplus" ? "Percentage" : "Fixed")} options={["Fixed amount", "Percentage of planned surplus"]} value={contributionType === "Percentage" ? "Percentage of planned surplus" : "Fixed amount"} />
            </div>
            <div>
              {contributionType === "Percentage"
                ? <TextInput error={contributionHasError} label="Surplus Percentage" onChange={setContributionPercentage} placeholder="10" type="number" value={contributionPercentage} />
                : <TextInput error={contributionHasError} label="Monthly Contribution" onChange={setMonthlyContribution} placeholder="500" type="amount" value={monthlyContribution} />}
              {contributionHasError ? <p className="mt-1 text-xs font-medium text-[#ba1a1a]">{contributionType === "Percentage" ? "Enter a percentage above 0 and up to 100." : "Monthly contribution cannot be negative."}</p> : null}
              {contributionType === "Percentage" ? <p className="mt-1 text-xs font-medium leading-5 text-[#45464d]">Planned surplus is planned Credit minus planned Debit before savings.</p> : null}
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

            {goalType === "Target" ? <ProgressCircle percent={progressPercent} tone={selectedStyle.tone} /> : (
              <div className="rounded-lg bg-[#ecfdf5] p-5 text-center">
                <p className="text-xs font-bold uppercase text-[#166534]">Available fund</p>
                <ResponsiveAmount className="mt-2 font-bold text-[#047857]">{formatMmkPreview(saved)}</ResponsiveAmount>
              </div>
            )}

            <dl className="mt-5 grid grid-cols-2 gap-3 text-center">
              {goalType === "Target" ? <div>
                <dt className="mb-1 text-xs font-bold uppercase text-[#45464d]">Saved</dt>
                <dd><ResponsiveAmount className="font-semibold text-[#0b1c30]" maxSizeRem={1.125}>{formatMmkPreview(saved)}</ResponsiveAmount></dd>
              </div> : null}
              <div>
                <dt className="mb-1 text-xs font-bold uppercase text-[#45464d]">Target</dt>
                <dd><ResponsiveAmount className="font-semibold text-[#0b1c30]" maxSizeRem={1.125}>{targetAmount ? formatMmkPreview(targetAmount) : formatMmkPreview(0)}</ResponsiveAmount></dd>
              </div>
            </dl>

            <div className="mt-5 border-t border-[#c6c6cd]/40 pt-4 text-center text-sm font-medium text-[#45464d]">
              {goalType === "Target" ? `Target: ${targetDate || "Not set"}` : `Open-ended fund · ${effectiveAccountAmountType}`}
            </div>
            <div className="mt-4 rounded-lg border border-[#c6c6cd]/40 bg-[#f8f9ff] p-4 text-sm font-medium text-[#45464d]">
              Monthly: <ResponsiveAmount className="font-semibold text-[#0b1c30]" maxSizeRem={0.875}>{contributionType === "Percentage" ? `${contributionPercentage || 0}% of planned surplus` : monthlyContribution ? formatMmkPreview(monthlyContribution) : formatMmkPreview(0)}</ResponsiveAmount>
              <p className="mt-2">{description || "Savings plan note will appear here."}</p>
            </div>
          </div>
        </div>
      </aside>
    </div>
  );
}
