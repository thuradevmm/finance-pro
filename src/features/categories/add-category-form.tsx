"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { createCategory, updateCategory } from "@/app/categories/actions";
import { useInteractionLoading } from "@/components/app/interaction-loading-provider";
import { Icon } from "@/components/ui/icon";
import { LoadingButton } from "@/components/ui/loading-state";
import { useToast } from "@/components/ui/toast-provider";
import { FormCard, SelectInput, TextAreaInput, TextInput } from "@/components/ui/form-controls";
import { ResponsiveAmount } from "@/components/ui/responsive-amount";
import { formatMmkPreview } from "@/lib/currency";
import { financialPurposeFieldLabel, financialPurposeLabel, financialPurposeOptionsFor } from "@/lib/categories/financial-purpose";
import { getCategoryTypeStyle } from "@/lib/categories/category-style";
import { getScopesForCategoryType } from "@/lib/categories/category-scopes";
import type { CategoryFormData, CategoryRecord } from "@/lib/categories/supabase";
import type { CategoryFinancialRole, CategoryLevel, CategoryType } from "@/types/finance";
import { categoryTypeLabel } from "@/lib/transactions/terminology";

const categoryTypes: CategoryType[] = ["Expense", "Income", "Account", "Savings Goal", "Debt", "Subscription", "Asset"];

export function AddCategoryForm({ categories, category }: { categories: CategoryRecord[]; category?: CategoryRecord }) {
  const { showError, showSuccess } = useToast();
  const router = useRouter();
  const beginLoading = useInteractionLoading();
  const [selectedType, setSelectedType] = useState<CategoryType>(category?.type ?? "Expense");
  const [level, setLevel] = useState<CategoryLevel>(category?.level ?? "Subcategory");
  const [parentId, setParentId] = useState(category?.parentId ?? "");
  const [selectedChildCategoryIds, setSelectedChildCategoryIds] = useState<string[]>(
    category?.level === "Super"
      ? categories.filter((item) => item.parentId === category.id && !item.mergedIntoCategoryId).map((item) => item.id)
      : [],
  );
  const [financialRole, setFinancialRole] = useState<CategoryFinancialRole>(category?.financialRole ?? "other");
  const [name, setName] = useState(category?.name ?? "");
  const [description, setDescription] = useState(category?.description ?? "");
  const [status, setStatus] = useState(category?.status ?? "Active");
  const [showErrors, setShowErrors] = useState(false);
  const [formError, setFormError] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const nameHasError = showErrors && name.trim() === "";
  const selectedScopes = getScopesForCategoryType(selectedType);
  const selectedStyle = getCategoryTypeStyle(selectedType);
  const financialRoleOptions = financialPurposeOptionsFor(selectedType);
  const parentOptions = categories.filter((item) => item.id !== category?.id
    && item.level === "Super"
    && item.type === selectedType
    && !item.mergedIntoCategoryId
    && (item.status === "Active" || item.id === category?.parentId));
  const selectedParent = parentOptions.find((item) => item.id === parentId);
  const childCategoryOptions = categories.filter((item) => item.id !== category?.id
    && item.level === "Subcategory"
    && item.type === selectedType
    && !item.mergedIntoCategoryId
    && (!item.parentId || item.parentId === category?.id)
    && (item.status === "Active" || item.parentId === category?.id));
  const selectedChildCategories = childCategoryOptions.filter((item) => selectedChildCategoryIds.includes(item.id));
  const selectedRoleLabel = financialRoleOptions.find((option) => option.value === financialRole)?.label ?? "General / no indicator";
  const selectedParentRoleLabel = selectedParent?.financialRole ? financialPurposeLabel(selectedParent.financialRole) : "No dashboard classification";
  const monthlyAverage = category && category.type === selectedType ? category.monthlyAverage : formatMmkPreview(0);
  const transactionCount = category && category.type === selectedType ? category.transactionCount : 0;
  const activityLabel = category && category.type === selectedType ? category.activityLabel : selectedType === "Expense" || selectedType === "Income" ? "Monthly Avg" : "Tracked Value";
  const countLabel = category && category.type === selectedType ? category.countLabel : selectedType === "Savings Goal" ? "Goals" : `${selectedType}s`;

  async function handleSaveCategory(addAnother = false) {
    const hasErrors = name.trim() === "";
    setShowErrors(hasErrors);
    setFormError("");
    if (hasErrors) return;

    const input: CategoryFormData = {
      childCategoryIds: level === "Super" ? selectedChildCategoryIds : [],
      description: description.trim(),
      financialRole: level === "Super" ? financialRole || "other" : "",
      isActive: status === "Active",
      isDefault: false,
      level,
      name: name.trim(),
      parentId: level === "Subcategory" ? parentId : "",
      reportingRole: "",
      scopes: selectedScopes,
      type: selectedType,
    };

    setIsSaving(true);
    const result = category
      ? await updateCategory(category.id, input)
      : await createCategory(input);
    if (result.error) {
      setIsSaving(false);
      setFormError(result.error);
      showError(result.error);
      return;
    }

    if (addAnother && !category) {
      setIsSaving(false);
      setName("");
      setDescription("");
      setSelectedType("Expense");
      setLevel("Subcategory");
      setParentId("");
      setSelectedChildCategoryIds([]);
      setFinancialRole("other");
      setShowErrors(false);
      showSuccess("Category saved successfully.");
      return;
    }

    showSuccess(category ? "Category updated successfully." : "Category saved successfully.");
    beginLoading();
    router.push("/categories");
    router.refresh();
  }

  return (
    <div className="grid min-w-0 grid-cols-1 gap-6 xl:grid-cols-12">
      <div className="min-w-0 space-y-6 xl:col-span-8">
        <FormCard title="Category Type">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
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
                  onClick={() => {
                    setSelectedType(type);
                    setParentId("");
                    setSelectedChildCategoryIds([]);
                    setFinancialRole((current) => financialPurposeOptionsFor(type).some((option) => option.value === current) ? current : "other");
                  }}
                  type="button"
                >
                  <span className="mb-2 flex items-center gap-2 text-sm font-bold">
                    <Icon className="size-5" name={type === "Expense" ? "trendingDown" : type === "Income" ? "trendingUp" : "category"} />
                    {categoryTypeLabel(type)}
                  </span>
                  <span className="block text-xs font-medium leading-5">
                    {type === "Expense"
                      ? "Classify Debit activity in transactions."
                      : type === "Income"
                        ? "Classify Credit activity in transactions."
                        : `Create categories only for ${getScopesForCategoryType(type)[0].toLowerCase()}.`}
                  </span>
                </button>
              );
            })}
          </div>
        </FormCard>

        <FormCard title="Category Hierarchy">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {(["Subcategory", "Super"] as CategoryLevel[]).map((option) => {
              const isActive = level === option;
              return (
                <button
                  aria-pressed={isActive}
                  className={isActive
                    ? "rounded-lg border border-[#2170e4] bg-[#eff6ff] p-4 text-left text-[#0058be] shadow-sm"
                    : "rounded-lg border border-[#c6c6cd]/70 bg-[#f8f9ff] p-4 text-left text-[#45464d]"}
                  key={option}
                  onClick={() => {
                    setLevel(option);
                    if (option === "Super") setParentId("");
                    else setSelectedChildCategoryIds([]);
                  }}
                  type="button"
                >
                  <span className="block text-sm font-bold">{option === "Super" ? "Super category" : "Subcategory"}</span>
                  <span className="mt-1 block text-xs leading-5">{option === "Super" ? "Reporting group used for analysis; it cannot be posted directly." : "Selectable category with no more than one super-category parent."}</span>
                </button>
              );
            })}
          </div>
          {level === "Subcategory" ? <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
            {level === "Subcategory" ? (
              <SelectInput
                label="Super Category (Optional)"
                onChange={(value) => setParentId(parentOptions.find((item) => item.name === value)?.id ?? "")}
                options={["Ungrouped", ...parentOptions.map((item) => item.name)]}
                value={selectedParent?.name ?? "Ungrouped"}
              />
            ) : null}
            <div className="rounded-lg border border-[#c6c6cd]/60 bg-[#f8f9ff] px-4 py-3">
              <span className="block text-xs font-bold uppercase text-[#45464d]">System behavior</span>
              <span className="mt-1 block text-sm font-semibold text-[#0b1c30]">{selectedParent ? `Grouped under ${selectedParent.name}` : "Selectable and currently ungrouped"}</span>
              <span className="mt-1 block text-xs leading-5 text-[#45464d]">{selectedParent ? `Automatically inherits: ${selectedParentRoleLabel}.` : "It will inherit a dashboard classification when linked to a super category."}</span>
            </div>
          </div> : (
            <fieldset className="mt-5 rounded-lg border border-[#c6c6cd]/60 bg-[#f8f9ff] p-4">
              <legend className="px-1 text-sm font-bold text-[#0b1c30]">{financialPurposeFieldLabel(selectedType)}</legend>
              <p className="text-xs leading-5 text-[#45464d]">Optional: choose how this super category should participate in dashboard analysis. Every linked subcategory inherits this selection automatically.</p>
              <div className="mt-4 grid grid-cols-1 gap-2 md:grid-cols-2">
                {financialRoleOptions.map((option) => {
                  const isSelected = financialRole === option.value;
                  return (
                    <button
                      aria-pressed={isSelected}
                      className={isSelected
                        ? "rounded-lg border border-[#2170e4] bg-white p-3 text-left shadow-sm"
                        : "rounded-lg border border-[#d4d4d8] bg-white/70 p-3 text-left transition hover:border-[#93c5fd] hover:bg-white"}
                      key={option.value}
                      onClick={() => setFinancialRole(option.value)}
                      type="button"
                    >
                      <span className={isSelected ? "block text-sm font-bold text-[#0058be]" : "block text-sm font-bold text-[#0b1c30]"}>{option.label}</span>
                      <span className="mt-1 block text-xs leading-5 text-[#45464d]">{option.description}</span>
                    </button>
                  );
                })}
              </div>
              <div className="mt-3 rounded-md bg-[#eff6ff] px-3 py-2 text-xs font-semibold text-[#0058be]">Selected: {selectedRoleLabel}. This classification applies to all linked subcategories.</div>
            </fieldset>
          )}
          {level === "Super" ? (
            <div className="mt-5 rounded-lg border border-[#c6c6cd]/60 bg-[#f8f9ff] p-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h3 className="text-sm font-bold text-[#0b1c30]">Link subcategories</h3>
                  <p className="mt-1 text-xs leading-5 text-[#45464d]">Only ungrouped {categoryTypeLabel(selectedType).toLowerCase()} subcategories are available to link. Subcategories already linked here remain visible so you can manage them.</p>
                </div>
                <span className="w-fit rounded-full bg-[#e0f2fe] px-3 py-1 text-xs font-bold text-[#075985]">{selectedChildCategoryIds.length} selected</span>
              </div>
              {childCategoryOptions.length > 0 ? (
                <div className="mt-4 max-h-72 space-y-2 overflow-y-auto pr-1">
                  {childCategoryOptions.map((item) => {
                    const isChecked = selectedChildCategoryIds.includes(item.id);
                    return (
                      <label
                        className={isChecked
                          ? "flex min-h-12 cursor-pointer items-start gap-3 rounded-lg border border-[#93c5fd] bg-white px-3 py-2.5 shadow-sm"
                          : "flex min-h-12 cursor-pointer items-start gap-3 rounded-lg border border-[#d4d4d8] bg-white px-3 py-2.5 transition hover:border-[#93c5fd]"}
                        key={item.id}
                      >
                        <input
                          checked={isChecked}
                          className="mt-0.5 size-4 shrink-0 accent-[#0058be]"
                          onChange={(event) => setSelectedChildCategoryIds((current) => event.target.checked
                            ? [...current, item.id]
                            : current.filter((id) => id !== item.id))}
                          type="checkbox"
                        />
                        <span className="min-w-0 flex-1">
                          <span className="block break-words text-sm font-semibold text-[#0b1c30]">{item.name}</span>
                          <span className="mt-0.5 block text-xs font-medium text-[#45464d]">
                            {item.status === "Hidden" ? "Hidden subcategory currently linked here." : item.parentId === category?.id ? "Currently linked here." : "Available to link."}
                          </span>
                        </span>
                      </label>
                    );
                  })}
                </div>
              ) : (
                <div className="mt-4 rounded-md border border-dashed border-[#c6c6cd] bg-white px-4 py-5 text-center text-sm font-medium text-[#45464d]">
                  No available subcategories match this category type. Create an ungrouped subcategory first or manage an existing child from its current super category.
                </div>
              )}
              {childCategoryOptions.length > 0 ? (
                <div className="mt-3 flex flex-wrap gap-2">
                  <button className="min-h-9 rounded-md px-3 text-xs font-bold text-[#0058be] hover:bg-[#eff4ff]" onClick={() => setSelectedChildCategoryIds(childCategoryOptions.map((item) => item.id))} type="button">Select all</button>
                  <button className="min-h-9 rounded-md px-3 text-xs font-bold text-[#45464d] hover:bg-white" onClick={() => setSelectedChildCategoryIds([])} type="button">Clear selection</button>
                </div>
              ) : null}
            </div>
          ) : null}
        </FormCard>

        <FormCard title="Category Details">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div>
              <TextInput error={nameHasError} label="Category Name" onChange={setName} placeholder="Food" value={name} />
              {nameHasError ? <p className="mt-1 text-xs font-medium text-[#ba1a1a]">Category name is required.</p> : null}
            </div>
            <div className="rounded-lg border border-[#c6c6cd]/60 bg-[#f8f9ff] px-4 py-3">
              <span className="block text-xs font-bold uppercase text-[#45464d]">Calculated {activityLabel}</span>
              <ResponsiveAmount className="mt-1 font-semibold text-[#0b1c30]" maxSizeRem={1.125}>{monthlyAverage}</ResponsiveAmount>
            </div>
          </div>

          <div className="mt-5">
            <TextAreaInput label="Description" onChange={setDescription} placeholder="Groceries and dining out..." value={description} />
          </div>

          <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-2">
            <SelectInput label="Status" onChange={(value) => setStatus(value === "Hidden" ? "Hidden" : "Active")} options={["Active", "Hidden"]} value={status} />
            <div className="rounded-lg border border-[#c6c6cd]/60 bg-[#f8f9ff] px-4 py-3">
              <span className="block text-xs font-bold uppercase text-[#45464d]">Used By</span>
              <span className="mt-1 block text-sm font-semibold text-[#0b1c30]">{selectedScopes.join(", ")}</span>
            </div>
          </div>

        </FormCard>

        <FormCard title="Category Usage">
          <p className="text-sm leading-6 text-[#45464d]">
            {level === "Super"
              ? "Super categories organize and roll up subcategories for analysis. Dashboard classification is optional and inherited by every linked child; super categories are never offered in transaction or linked-record selectors."
              : "Subcategory usage is controlled by category type. Credit and Debit categories are used by transaction-related pages; page categories stay scoped to their related feature."}
          </p>
          <p className="mt-3 text-sm leading-6 text-[#45464d]">
            Credit and Debit monthly averages use the full calendar span between the first and latest posted transaction, including zero-activity months. Page categories show the related module&apos;s tracked value and record count.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            {selectedScopes.map((scope) => (
              <span className="rounded bg-[#eff6ff] px-3 py-1 text-xs font-semibold text-[#0058be]" key={scope}>
                {scope}
              </span>
            ))}
          </div>
        </FormCard>

        <FormCard title="Automatic Style">
          <div className="flex items-center justify-between gap-4 rounded-lg border border-[#c6c6cd]/60 bg-[#f8f9ff] px-4 py-3">
            <div className="flex min-w-0 items-center gap-3">
              <span className={`grid size-11 shrink-0 place-items-center rounded-full ${selectedStyle.bg} ${selectedStyle.tone}`}>
                <Icon name={selectedStyle.icon} />
              </span>
              <div className="min-w-0">
                <span className="block text-xs font-bold uppercase text-[#45464d]">Type Style</span>
                <span className="mt-1 block truncate text-sm font-semibold text-[#0b1c30]">{categoryTypeLabel(selectedType)} uses {selectedStyle.color}</span>
              </div>
            </div>
            <span className={`size-4 shrink-0 rounded-full ${selectedStyle.marker}`} />
          </div>
        </FormCard>

        <div className="space-y-3 pt-2">
          {formError ? <div className="w-full rounded-md border border-[#fecaca] bg-[#fff1f0] px-4 py-2 text-sm font-medium text-[#991b1b]" role="alert">{formError}</div> : null}
          <div className="flex flex-col-reverse items-stretch justify-end gap-3 sm:flex-row sm:items-center">
            <Link
              className="inline-flex min-h-11 items-center justify-center rounded-md px-4 text-sm font-semibold text-[#45464d] transition hover:bg-[#eff4ff]"
              href="/categories"
            >
              Cancel
            </Link>
            <button
              className="inline-flex min-h-11 items-center justify-center rounded-md border border-[#c6c6cd]/70 bg-[#eff4ff] px-4 text-sm font-semibold text-[#0058be] transition hover:bg-[#dce9ff]"
              disabled={isSaving || Boolean(category)}
              onClick={() => handleSaveCategory(true)}
              type="button"
            >
              Save & Add Another
            </button>
            <LoadingButton
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md bg-[#0b1c30] px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-[#1f2937]"
              isLoading={isSaving}
              loadingLabel="Saving…"
              onClick={() => handleSaveCategory(false)}
              type="button"
            >
              Save Category
            </LoadingButton>
          </div>
        </div>
      </div>

      <aside className="hidden min-w-0 xl:col-span-4 xl:block">
        <div className="sticky top-24 rounded-lg border border-[#c6c6cd]/60 bg-[#eff4ff] p-6 shadow-[0_4px_20px_rgba(15,23,42,0.04)]">
          <div className="rounded-lg border border-[#c6c6cd]/60 bg-white p-5">
            <div className="mb-6 flex items-start justify-between gap-4">
              <span className={`grid size-12 place-items-center rounded-full ${selectedStyle.bg} ${selectedStyle.tone}`}>
                <Icon name={selectedStyle.icon} />
              </span>
              <span className={`size-3 rounded-full ${selectedStyle.marker}`} />
            </div>
            <div className="mb-1 flex items-center gap-2">
              <h3 className="text-xl font-semibold text-[#0b1c30]">{name || "New Category"}</h3>
              <span className="rounded border border-[#c6c6cd]/40 bg-[#eff4ff] px-2 py-0.5 text-xs font-semibold text-[#45464d]">
                {selectedType} · {level}
              </span>
            </div>
            <p className="mb-4 text-sm text-[#45464d]">{description || "Category description preview"}</p>
            <p className="mb-4 rounded-md bg-[#f8f9ff] px-3 py-2 text-xs font-semibold text-[#45464d]">{level === "Super" ? `Dashboard: ${selectedRoleLabel} · ${selectedChildCategories.length} linked subcategories` : selectedParent ? `Super category: ${selectedParent.name} · Inherits ${selectedParentRoleLabel}` : "Ungrouped · No inherited dashboard classification"}</p>
            {level === "Super" && selectedChildCategories.length > 0 ? (
              <div className="mb-4 flex flex-wrap gap-1.5">
                {selectedChildCategories.map((item) => <span className="rounded bg-[#e0f2fe] px-2 py-1 text-xs font-semibold text-[#075985]" key={item.id}>{item.name}</span>)}
              </div>
            ) : null}
            <div className="mb-4 flex flex-wrap gap-1.5">
              {selectedScopes.map((scope) => (
                <span className="rounded bg-[#f8f9ff] px-2 py-1 text-xs font-semibold text-[#45464d]" key={scope}>
                  {scope}
                </span>
              ))}
            </div>
            <div className="flex items-end justify-between gap-4 border-t border-[#c6c6cd]/40 pt-4">
              <div>
                <span className="mb-1 block text-xs font-bold uppercase text-[#45464d]">{activityLabel}</span>
                <ResponsiveAmount className="font-semibold text-[#0b1c30]" maxSizeRem={1.5}>{monthlyAverage}</ResponsiveAmount>
              </div>
              <span className="text-right text-xs font-semibold text-[#45464d]">{transactionCount} {countLabel}</span>
            </div>
          </div>
        </div>
      </aside>
    </div>
  );
}
