"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { createBudget, updateBudget } from "@/app/budgets/actions";
import { useInteractionLoading } from "@/components/app/interaction-loading-provider";
import { Icon } from "@/components/ui/icon";
import { FormCard, SelectInput, TextAreaInput, TextInput } from "@/components/ui/form-controls";
import { LoadingButton } from "@/components/ui/loading-state";
import { ProgressMeter } from "@/components/ui/progress-meter";
import { ResponsiveAmount } from "@/components/ui/responsive-amount";
import { useToast } from "@/components/ui/toast-provider";
import { budgetSelectionRange, effectiveBudgetEndDate, inferBudgetEndDate } from "@/lib/budgets/calculations";
import { formatMmkPreview } from "@/lib/currency";
import { isValidCalendarDate } from "@/lib/date-validation";
import type { BudgetFormData, BudgetRecord } from "@/lib/budgets/supabase";
import { getCategoriesForScope } from "@/lib/categories/category-scopes";
import type { CategoryRecord } from "@/lib/categories/supabase";
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

export function AddBudgetForm({ budget, categories }: { budget?: BudgetRecord; categories: CategoryRecord[] }) {
  const { showError, showSuccess } = useToast();
  const router = useRouter();
  const beginLoading = useInteractionLoading();
  const defaultBudgetRange = budgetSelectionRange(new Date(), "Monthly");
  const expenseCategories = getCategoriesForScope(categories, "Transactions", "Expense");
  const [selectedCategoryId, setSelectedCategoryId] = useState(budget?.categoryId ?? expenseCategories[0]?.id ?? "");
  const [period, setPeriod] = useState<BudgetPeriod>(budget?.period ?? "Monthly");
  const [budgetAmount, setBudgetAmount] = useState(budget ? String(budget.amountValue) : "");
  const [startDate, setStartDate] = useState(budget?.startDate ?? defaultBudgetRange.startDate);
  const [endDate, setEndDate] = useState(budget?.endDate ?? defaultBudgetRange.endDate);
  const [alertThreshold, setAlertThreshold] = useState(`${budget?.alertPercentage ?? 80}%`);
  const [status, setStatus] = useState(budget?.planStatus ?? "Active");
  const [description, setDescription] = useState(budget?.description ?? "");
  const [showErrors, setShowErrors] = useState(false);
  const [formError, setFormError] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const selectedCategory = expenseCategories.find((category) => category.id === selectedCategoryId) ?? expenseCategories[0];
  const previewBudgetAmount = Number(budgetAmount);
  const previewMatchesStoredRange = Boolean(budget
    && selectedCategoryId === budget.categoryId
    && period === budget.period
    && startDate === budget.startDate
    && effectiveBudgetEndDate(startDate, endDate, period) === budget.endDate);
  const previewActualAmount = previewMatchesStoredRange ? budget?.actualValue ?? 0 : 0;
  const previewUsagePercent = Number.isFinite(previewBudgetAmount) && previewBudgetAmount > 0
    ? Math.max(0, Math.round((previewActualAmount / previewBudgetAmount) * 100))
    : 0;
  const effectiveEndDate = effectiveBudgetEndDate(startDate, endDate, period);
  const amountHasError = showErrors && budgetAmount.trim() === "";
  const startDateHasError = showErrors && !isValidCalendarDate(startDate);
  const endDateHasError = showErrors && (!isValidCalendarDate(effectiveEndDate) || Boolean(effectiveEndDate && startDate && effectiveEndDate < startDate));

  function handlePeriodChange(nextPeriod: BudgetPeriod) {
    const previousInferredEnd = inferBudgetEndDate(startDate, period);
    setPeriod(nextPeriod);
    if (!endDate || endDate === previousInferredEnd) setEndDate(inferBudgetEndDate(startDate, nextPeriod));
  }

  function handleStartDateChange(nextStartDate: string) {
    const previousInferredEnd = inferBudgetEndDate(startDate, period);
    setStartDate(nextStartDate);
    if (!endDate || endDate === previousInferredEnd) setEndDate(inferBudgetEndDate(nextStartDate, period));
  }

  async function handleSaveBudget(addAnother = false) {
    const nextEffectiveEndDate = effectiveBudgetEndDate(startDate, endDate, period);
    const hasErrors = !selectedCategory
      || budgetAmount.trim() === ""
      || Number(budgetAmount) <= 0
      || !isValidCalendarDate(startDate)
      || !isValidCalendarDate(nextEffectiveEndDate)
      || Boolean(nextEffectiveEndDate && nextEffectiveEndDate < startDate);
    setShowErrors(hasErrors);
    setFormError("");
    if (hasErrors || !selectedCategory) return;

    const input: BudgetFormData = {
      alertPercentage: Number(alertThreshold.replace("%", "")),
      amount: Number(budgetAmount),
      categoryId: selectedCategory.id,
      categoryName: selectedCategory.name,
      description,
      endDate: endDate.trim() || null,
      period,
      startDate,
      status: status as "Active" | "Paused",
    };

    setIsSaving(true);
    const result = budget ? await updateBudget(budget.id, input) : await createBudget(input);
    if (result.error) {
      setIsSaving(false);
      setFormError(result.error);
      showError(result.error);
      return;
    }

    if (addAnother && !budget) {
      setIsSaving(false);
      setBudgetAmount("");
      setEndDate("");
      setDescription("");
      setShowErrors(false);
      showSuccess("Budget saved successfully.");
      return;
    }

    showSuccess(budget ? "Budget updated successfully." : "Budget saved successfully.");
    beginLoading();
    router.push("/budgets");
    router.refresh();
  }

  return (
    <div className="grid min-w-0 grid-cols-1 gap-6 xl:grid-cols-12">
      <div className="min-w-0 space-y-6 xl:col-span-8">
        <FormCard title="Budget Category">
          {expenseCategories.length > 0 ? <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {expenseCategories.map((category) => (
              <CategoryOption
                category={category}
                isActive={category.id === selectedCategoryId}
                key={category.id}
                onSelect={() => setSelectedCategoryId(category.id)}
              />
            ))}
          </div> : <div className="rounded-md border border-dashed border-[#c6c6cd] p-6 text-center text-sm text-[#45464d]">Create an expense category before adding a budget. <Link className="font-semibold text-[#0058be] hover:underline" href="/categories/add">Add Category</Link></div>}
        </FormCard>

        <FormCard title="Budget Details">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div>
              <TextInput
                error={amountHasError}
                label="Budget Amount"
                onChange={setBudgetAmount}
                placeholder="800"
                type="amount"
                value={budgetAmount}
              />
              {amountHasError ? <p className="mt-1 text-xs font-medium text-[#ba1a1a]">Budget amount is required.</p> : null}
            </div>
            <SelectInput label="Budget Period" onChange={(value) => handlePeriodChange(value as BudgetPeriod)} options={periods} value={period} />
          </div>

          <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-2">
            <div>
              <TextInput error={startDateHasError} label="Start Date" onChange={handleStartDateChange} placeholder="YYYY-MM-DD" type="date" value={startDate} />
              {startDateHasError ? <p className="mt-1 text-xs font-medium text-[#ba1a1a]">Start date is required.</p> : null}
            </div>
            <div>
              <TextInput error={endDateHasError} label="End Date" onChange={setEndDate} placeholder="YYYY-MM-DD" type="date" value={endDate} />
              {endDateHasError ? <p className="mt-1 text-xs font-medium text-[#ba1a1a]">End date cannot be before the start date.</p> : null}
            </div>
          </div>

          <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-2">
            <SelectInput label="Alert Threshold" onChange={setAlertThreshold} options={alertThresholds} value={alertThreshold} />
            <SelectInput label="Status" onChange={(value) => setStatus(value as "Active" | "Paused")} options={["Active", "Paused"]} value={status} />
          </div>
        </FormCard>

        <FormCard title="Budget Notes">
          <TextAreaInput label="Description" onChange={setDescription} placeholder="Optional note about this budget target..." value={description} />
        </FormCard>

        <div className="space-y-3 pt-2">
          {formError ? <div className="w-full rounded-md border border-[#fecaca] bg-[#fff1f0] px-4 py-2 text-sm font-medium text-[#991b1b]" role="alert">{formError}</div> : null}
          <div className="flex flex-col-reverse items-stretch justify-end gap-3 sm:flex-row sm:items-center">
            <Link
              className="inline-flex min-h-11 items-center justify-center rounded-md px-4 text-sm font-semibold text-[#45464d] transition hover:bg-[#eff4ff]"
              href="/budgets"
            >
              Cancel
            </Link>
            <button
              className="inline-flex min-h-11 items-center justify-center rounded-md border border-[#c6c6cd]/70 bg-[#eff4ff] px-4 text-sm font-semibold text-[#0058be] transition hover:bg-[#dce9ff]"
              disabled={isSaving || Boolean(budget) || !selectedCategory}
              onClick={() => handleSaveBudget(true)}
              type="button"
            >
              Save & Add Another
            </button>
            <LoadingButton
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md bg-[#0b1c30] px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-[#1f2937] disabled:cursor-not-allowed disabled:opacity-60"
              disabled={!selectedCategory}
              isLoading={isSaving}
              loadingLabel="Saving…"
              onClick={() => handleSaveBudget(false)}
              type="button"
            >
              {budget ? "Save Changes" : "Save Budget"}
            </LoadingButton>
          </div>
        </div>
      </div>

      {selectedCategory ? <aside className="hidden min-w-0 xl:col-span-4 xl:block">
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
              <ResponsiveAmount className="mt-2 font-bold text-[#0b1c30]" maxSizeRem={2.25}>{budgetAmount.trim() === "" ? formatMmkPreview(0) : formatMmkPreview(budgetAmount)}</ResponsiveAmount>
              <ProgressMeter ariaLabel={`${selectedCategory.name} budget preview usage`} className="mt-5 h-3" percent={previewUsagePercent} />
              <div className="mt-2 flex justify-between text-xs font-semibold text-[#45464d]">
                <span>{previewMatchesStoredRange ? `${formatMmkPreview(previewActualAmount)} spent` : "Actual recalculated after save"}</span>
                <span>{previewMatchesStoredRange ? `${previewUsagePercent}%` : "—"}</span>
              </div>
            </div>

            <dl className="mt-5 space-y-4 rounded-lg border border-[#c6c6cd]/40 bg-white p-4">
              <div className="flex items-center justify-between gap-4">
                <dt className="text-xs font-bold uppercase text-[#45464d]">Start</dt>
                <dd className="text-sm font-semibold text-[#0b1c30]">{startDate || "Not set"}</dd>
              </div>
              <div className="flex items-center justify-between gap-4">
                <dt className="text-xs font-bold uppercase text-[#45464d]">Alert</dt>
                <dd className="text-sm font-semibold text-[#0b1c30]">{alertThreshold}</dd>
              </div>
              <div className="flex items-center justify-between gap-4">
                <dt className="text-xs font-bold uppercase text-[#45464d]">Status</dt>
                <dd className="text-sm font-semibold text-[#0b1c30]">{status}</dd>
              </div>
              <div className="flex items-center justify-between gap-4">
                <dt className="text-xs font-bold uppercase text-[#45464d]">End</dt>
                <dd className="text-sm font-semibold text-[#0b1c30]">{effectiveEndDate || "Not set"}</dd>
              </div>
            </dl>
            <p className="mt-5 rounded-lg border border-[#c6c6cd]/40 bg-white p-4 text-sm font-medium text-[#45464d]">
              {description || "Budget note will appear here."}
            </p>
          </div>
        </div>
      </aside> : null}
    </div>
  );
}
