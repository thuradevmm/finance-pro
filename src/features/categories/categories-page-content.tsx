"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { deleteCategory, mergeCategory, setCategoryStatus } from "@/app/categories/actions";
import { SegmentedTabs } from "@/components/app/segmented-tabs";
import { DeleteConfirmationDialog } from "@/components/ui/delete-confirmation-dialog";
import { DetailModal, DetailModalField, DetailModalSection } from "@/components/ui/detail-modal";
import { SelectInput, TextInput } from "@/components/ui/form-controls";
import { Icon } from "@/components/ui/icon";
import { RecordActions } from "@/components/ui/record-actions";
import { ResponsiveAmount } from "@/components/ui/responsive-amount";
import { useToast } from "@/components/ui/toast-provider";
import { CategoryMergeDialog } from "@/features/categories/category-merge-dialog";
import { isTransactionCategoryType } from "@/lib/categories/category-scopes";
import { financialPurposeFieldLabel, financialPurposeLabel } from "@/lib/categories/financial-purpose";
import type { CategoryRecord } from "@/lib/categories/supabase";
import { normalizeTransactionDate } from "@/lib/transactions/filters";
import type { CategoryType } from "@/types/finance";
import { categoryTypeLabel } from "@/lib/transactions/terminology";

const categoryTypes: CategoryType[] = ["Expense", "Income", "Account", "Savings Goal", "Debt", "Subscription", "Asset"];
const tabs = categoryTypes.map((type) => `${categoryTypeLabel(type)} Categories`);
const hierarchyViews = ["Hierarchy", "Super categories", "Subcategories"] as const;
type HierarchyView = (typeof hierarchyViews)[number];

function categoryTypeFromTab(tab: string): CategoryType {
  const label = tab.replace(/ Categories$/, "");
  if (label === "Credit" || label === "Income") return "Income";
  if (label === "Debit" || label === "Expense") return "Expense";
  if (label === "Borrowing & Lending") return "Debt";
  return categoryTypes.find((type) => type === label) ?? "Expense";
}

function CategoryBadge({ type }: { type: CategoryType }) {
  return (
    <span className="rounded border border-[#c6c6cd]/40 bg-[#eff4ff] px-2 py-0.5 text-xs font-semibold text-[#45464d]">
      {categoryTypeLabel(type)}
    </span>
  );
}

function CategoryLifecycleActions({
  categories,
  category,
  onDelete,
  onMerge,
  onStatusChange,
  onView,
}: {
  categories: CategoryRecord[];
  category: CategoryRecord;
  onDelete: (id: string) => void;
  onMerge: (source: CategoryRecord, targetCategoryId: string) => Promise<boolean>;
  onStatusChange: (category: CategoryRecord, isActive: boolean) => Promise<boolean>;
  onView: () => void;
}) {
  const [isLifecycleOpen, setIsLifecycleOpen] = useState(false);
  const [isMergeOpen, setIsMergeOpen] = useState(false);
  const [isPending, setIsPending] = useState(false);
  const isHidden = category.status === "Hidden";
  const isMerged = Boolean(category.mergedIntoCategoryId);
  const mergeTargets = categories.filter((target) => target.id !== category.id
    && target.type === category.type
    && target.level === category.level
    && target.status === "Active"
    && !target.mergedIntoCategoryId);

  return (
    <>
      {!isMerged ? (
        <button
          aria-label={`${isHidden ? "Restore" : "Hide"} ${category.name}`}
          className={isHidden
            ? "grid size-11 place-items-center rounded-full text-[#0058be] transition hover:bg-[#eff4ff] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2170e4]/25"
            : "grid size-11 place-items-center rounded-full text-[#92400e] transition hover:bg-[#fffbeb] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#b45309]/25"}
          onClick={() => setIsLifecycleOpen(true)}
          title={`${isHidden ? "Restore" : "Hide"} ${category.name}`}
          type="button"
        >
          <Icon className="size-4" name={isHidden ? "eye" : "eyeOff"} />
        </button>
      ) : null}
      {!isMerged ? (
        <button
          aria-label={`Merge ${category.name}`}
          className="grid size-11 place-items-center rounded-full text-[#4f46e5] transition hover:bg-[#eef2ff] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4f46e5]/25"
          onClick={() => setIsMergeOpen(true)}
          title={`Merge ${category.name} into another ${categoryTypeLabel(category.type).toLowerCase()} category`}
          type="button"
        >
          <Icon className="size-4" name="sync" />
        </button>
      ) : null}
      <RecordActions
        deleteDescription={`Delete ${category.name} only if it has never been used. Hide it to preserve history, or merge it to reassign existing records safely.`}
        deleteTitle="Delete unused category"
        editHref={`/categories/${category.id}/edit`}
        itemId={category.id}
        itemLabel={category.name}
        onDelete={onDelete}
        onView={onView}
        showDelete={!isMerged}
        showEdit={!isMerged}
      />
      <DeleteConfirmationDialog
        confirmIcon={isHidden ? "eye" : "eyeOff"}
        confirmLabel={isHidden ? "Restore" : "Hide"}
        description={isHidden
          ? `Restore ${category.name} so it can be selected for new records again. Historical data is already preserved.`
          : `Hide ${category.name} from new-entry selectors while keeping all historical transactions and linked records unchanged.`}
        icon={isHidden ? "eye" : "eyeOff"}
        isOpen={isLifecycleOpen}
        isPending={isPending}
        itemLabel={category.name}
        onCancel={() => setIsLifecycleOpen(false)}
        onConfirm={async () => {
          setIsPending(true);
          const succeeded = await onStatusChange(category, isHidden);
          setIsPending(false);
          if (succeeded) setIsLifecycleOpen(false);
        }}
        pendingLabel={isHidden ? "Restoring…" : "Hiding…"}
        title={isHidden ? "Restore category" : "Hide category"}
        tone="primary"
      />
      {isMergeOpen ? (
        <CategoryMergeDialog
          isOpen
          isPending={isPending}
          key={`${category.id}:${mergeTargets.map((target) => target.id).join(":")}`}
          onCancel={() => setIsMergeOpen(false)}
          onMerge={async (targetCategoryId) => {
            setIsPending(true);
            const succeeded = await onMerge(category, targetCategoryId);
            setIsPending(false);
            if (succeeded) setIsMergeOpen(false);
          }}
          source={category}
          targets={mergeTargets}
        />
      ) : null}
    </>
  );
}

function CategoryListItem({
  categories,
  category,
  onDelete,
  onMerge,
  onStatusChange,
  onView,
}: {
  categories: CategoryRecord[];
  category: CategoryRecord;
  onDelete: (id: string) => void;
  onMerge: (source: CategoryRecord, targetCategoryId: string) => Promise<boolean>;
  onStatusChange: (category: CategoryRecord, isActive: boolean) => Promise<boolean>;
  onView: () => void;
}) {
  const childCategories = category.level === "Super"
    ? categories.filter((item) => item.parentId === category.id && !item.mergedIntoCategoryId)
    : [];

  return (
    <article className="grid min-w-0 gap-4 rounded-lg border border-[#c6c6cd]/60 bg-white p-4 shadow-[0_4px_20px_rgba(15,23,42,0.04)] transition hover:shadow-[0_8px_24px_rgba(15,23,42,0.07)] xl:grid-cols-[minmax(16rem,1.5fr)_minmax(11rem,1fr)_minmax(11rem,0.7fr)_auto] xl:items-center sm:p-5">
      <div className="flex min-w-0 items-center gap-3">
        <span className={`relative grid size-11 shrink-0 place-items-center rounded-full ${category.bg} ${category.tone}`}>
          <Icon name={category.icon} />
          <span className={`absolute -right-0.5 -top-0.5 size-3 rounded-full ring-2 ring-white ${category.marker}`} title={`${category.name} color`} />
        </span>
        <div className="min-w-0">
          <div className="mb-1 flex min-w-0 flex-wrap items-center gap-2">
            <h2 className="min-w-0 break-words text-lg font-semibold leading-tight text-[#0b1c30]">{category.name}</h2>
            <CategoryBadge type={category.type} />
            <span className={category.level === "Super" ? "rounded bg-[#e0f2fe] px-2 py-0.5 text-xs font-semibold text-[#075985]" : "rounded bg-[#f1f1f4] px-2 py-0.5 text-xs font-semibold text-[#45464d]"}>{category.level === "Super" ? "Super" : "Sub"}</span>
            {category.level === "Super" ? <span className="rounded bg-[#ecfdf5] px-2 py-0.5 text-xs font-semibold text-[#166534]">{childCategories.length} linked</span> : null}
            {category.parentName ? <span className="rounded bg-[#f8f9ff] px-2 py-0.5 text-xs font-semibold text-[#45464d]">Under {category.parentName}</span> : null}
            {category.isDefault ? <span className="rounded bg-[#eef2ff] px-2 py-0.5 text-xs font-semibold text-[#4f46e5]">Default</span> : null}
            <span className={category.status === "Active"
              ? "rounded bg-[#ecfdf5] px-2 py-0.5 text-xs font-semibold text-[#166534]"
              : "rounded bg-[#f1f1f4] px-2 py-0.5 text-xs font-semibold text-[#45464d]"}>{category.status}</span>
            {category.mergedIntoCategoryId ? <span className="rounded bg-[#eef2ff] px-2 py-0.5 text-xs font-semibold text-[#4f46e5]">Merged into {category.mergedIntoCategoryName || "another category"}</span> : null}
          </div>
          <p className="break-words text-sm leading-5 text-[#45464d]">{category.description}</p>
          {childCategories.length > 0 ? (
            <div className="mt-2 flex flex-wrap gap-1.5" aria-label={`Subcategories linked to ${category.name}`}>
              {childCategories.slice(0, 4).map((child) => <span className="rounded bg-[#f8f9ff] px-2 py-1 text-xs font-semibold text-[#45464d]" key={child.id}>{child.name}</span>)}
              {childCategories.length > 4 ? <span className="rounded bg-[#f8f9ff] px-2 py-1 text-xs font-semibold text-[#45464d]">+{childCategories.length - 4} more</span> : null}
            </div>
          ) : null}
        </div>
      </div>

      <div className="flex min-w-0 flex-wrap gap-1.5">
        {category.scopes.map((scope) => (
          <span className="max-w-full break-words rounded bg-[#f8f9ff] px-2 py-1 text-xs font-semibold text-[#45464d]" key={scope}>
            {scope}
          </span>
        ))}
      </div>

      <div className="min-w-0">
        <span className="mb-1 block text-xs font-bold uppercase text-[#45464d]">{category.level === "Super" ? `Rolled-up ${category.activityLabel}` : category.activityLabel}</span>
        <ResponsiveAmount className="font-semibold text-[#0b1c30]" maxSizeRem={1.25}>{category.monthlyAverage}</ResponsiveAmount>
        <span className="mt-1 block text-xs font-semibold text-[#45464d]">{category.transactionCount} {category.countLabel}</span>
      </div>

      <div className="flex min-h-11 items-center justify-end border-t border-[#c6c6cd]/40 pt-3 xl:border-0 xl:pt-0">
        <CategoryLifecycleActions categories={categories} category={category} onDelete={onDelete} onMerge={onMerge} onStatusChange={onStatusChange} onView={onView} />
      </div>
    </article>
  );
}

function CategoryFilters({
  defaultDateFrom,
  defaultDateTo,
  initialDateFrom,
  initialDateTo,
  initialSearch,
  initialStatus,
  onSearch,
}: {
  defaultDateFrom: string;
  defaultDateTo: string;
  initialDateFrom: string;
  initialDateTo: string;
  initialSearch: string;
  initialStatus: string;
  onSearch: (search: string, status: string, dateFrom: string, dateTo: string) => void;
}) {
  const [draftDateFrom, setDraftDateFrom] = useState(initialDateFrom);
  const [draftDateTo, setDraftDateTo] = useState(initialDateTo);
  const [draftSearch, setDraftSearch] = useState(initialSearch);
  const [draftStatus, setDraftStatus] = useState(initialStatus);

  return (
    <form
      className="mb-6 grid grid-cols-1 gap-3 rounded-lg border border-[#c6c6cd]/70 bg-white p-4 shadow-[0_4px_20px_rgba(15,23,42,0.04)] lg:grid-cols-[minmax(12rem,1fr)_minmax(20rem,1.35fr)_minmax(11rem,0.45fr)_auto]"
      onSubmit={(event) => {
        event.preventDefault();
        const formData = new FormData(event.currentTarget);
        onSearch(
          String(formData.get("q") ?? draftSearch),
          String(formData.get("categoryStatus") ?? draftStatus),
          String(formData.get("dateFrom") ?? draftDateFrom),
          String(formData.get("dateTo") ?? draftDateTo),
        );
      }}
    >
      <TextInput label="Search Categories" name="q" onChange={setDraftSearch} placeholder="Name, type, scope, status..." value={draftSearch} />
      <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2">
        <TextInput
          label="Activity Date From"
          name="dateFrom"
          onChange={(value) => {
            setDraftDateFrom(value);
            if (value && draftDateTo && value > draftDateTo) setDraftDateTo(value);
          }}
          placeholder=""
          type="date"
          value={draftDateFrom}
        />
        <TextInput
          label="Activity Date To"
          name="dateTo"
          onChange={(value) => {
            setDraftDateTo(value);
            if (value && draftDateFrom && value < draftDateFrom) setDraftDateFrom(value);
          }}
          placeholder=""
          type="date"
          value={draftDateTo}
        />
      </div>
      <SelectInput label="Status" name="categoryStatus" onChange={setDraftStatus} options={["All statuses", "Active", "Hidden"]} value={draftStatus} />
      <div className="flex items-end gap-2">
        <button
          className="inline-flex min-h-12 items-center justify-center rounded-md border border-[#c6c6cd] bg-white px-4 text-sm font-semibold text-[#45464d] transition hover:bg-[#eff4ff]"
          onClick={() => {
            setDraftSearch("");
            setDraftStatus("All statuses");
            setDraftDateFrom(defaultDateFrom);
            setDraftDateTo(defaultDateTo);
            onSearch("", "All statuses", defaultDateFrom, defaultDateTo);
          }}
          type="button"
        >
          Reset
        </button>
        <button className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-md bg-[#0b1c30] px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-[#1f2937]" type="submit">
          <Icon className="size-4" name="search" />
          Search
        </button>
      </div>
    </form>
  );
}

export function CategoriesPageContent({
  categories,
  defaultDateFrom,
  defaultDateTo,
  initialDateFrom,
  initialDateTo,
}: {
  categories: CategoryRecord[];
  defaultDateFrom: string;
  defaultDateTo: string;
  initialDateFrom: string;
  initialDateTo: string;
}) {
  const { showError, showSuccess } = useToast();
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  const [activeTab, setActiveTab] = useState("Debit Categories");
  const [hierarchyView, setHierarchyView] = useState<HierarchyView>("Hierarchy");
  const [visibleCategories, setVisibleCategories] = useState(categories);
  const [isPending, setIsPending] = useState(false);
  const [viewedCategory, setViewedCategory] = useState<CategoryRecord | null>(null);
  const filtersRestored = useRef(false);
  const activeType = categoryTypeFromTab(activeTab);
  const search = searchParams.get("q") ?? "";
  const requestedStatus = searchParams.get("categoryStatus") ?? "All statuses";
  const status = ["All statuses", "Active", "Hidden"].includes(requestedStatus) ? requestedStatus : "All statuses";
  const dateFrom = searchParams.get("dateFrom") ?? initialDateFrom;
  const dateTo = searchParams.get("dateTo") ?? initialDateTo;
  const filteredCategories = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();
    return visibleCategories.filter((category) => {
      const searchable = `${category.name} ${category.description} ${category.type} ${category.level} ${category.parentName} ${category.financialRole} ${category.activityLabel} ${category.monthlyAverage} ${category.countLabel} ${category.status} ${category.scopes.join(" ")}`.toLowerCase();
      const matchesStatus = status === "All statuses" || category.status === status;
      const matchesHierarchyView = hierarchyView === "Hierarchy"
        || (hierarchyView === "Super categories" && category.level === "Super")
        || (hierarchyView === "Subcategories" && category.level === "Subcategory");
      return category.type === activeType && matchesHierarchyView && matchesStatus && (normalizedSearch === "" || searchable.includes(normalizedSearch));
    });
  }, [activeType, hierarchyView, search, status, visibleCategories]);
  const hierarchicalCategories = useMemo(() => {
    const order = new Map(filteredCategories.map((category, index) => [category.id, index]));
    return [...filteredCategories].sort((first, second) => {
      const firstGroup = first.level === "Super" ? first.id : first.parentId || `~${first.id}`;
      const secondGroup = second.level === "Super" ? second.id : second.parentId || `~${second.id}`;
      if (firstGroup !== secondGroup) return firstGroup.localeCompare(secondGroup);
      if (first.level !== second.level) return first.level === "Super" ? -1 : 1;
      return (order.get(first.id) ?? 0) - (order.get(second.id) ?? 0);
    });
  }, [filteredCategories]);
  const hasCategoriesForActiveType = visibleCategories.some((category) => category.type === activeType);
  const hasCategoriesForSelectedView = visibleCategories.some((category) => category.type === activeType
    && (hierarchyView === "Hierarchy"
      || (hierarchyView === "Super categories" && category.level === "Super")
      || (hierarchyView === "Subcategories" && category.level === "Subcategory")));
  const hasActiveCategoryFilters = Boolean(search.trim() || status !== "All statuses");
  const viewedParentCategory = viewedCategory?.parentId
    ? visibleCategories.find((category) => category.id === viewedCategory.parentId)
    : undefined;
  const viewedFinancialRole = viewedCategory?.financialRole || viewedParentCategory?.financialRole || "";

  function applyFilters(nextSearch: string, nextStatus: string, nextDateFrom: string, nextDateTo: string) {
    const normalizedStatus = ["All statuses", "Active", "Hidden"].includes(nextStatus) ? nextStatus : "All statuses";
    const normalizedDateFrom = nextDateFrom.trim() === "" ? "" : normalizeTransactionDate(nextDateFrom) || defaultDateFrom;
    const normalizedDateTo = nextDateTo.trim() === "" ? "" : normalizeTransactionDate(nextDateTo) || defaultDateTo;
    const datesAreReversed = Boolean(normalizedDateFrom && normalizedDateTo && normalizedDateFrom > normalizedDateTo);
    const safeDateFrom = datesAreReversed ? normalizedDateTo : normalizedDateFrom;
    const safeDateTo = datesAreReversed ? normalizedDateFrom : normalizedDateTo;
    const params = new URLSearchParams(searchParams.toString());
    if (nextSearch.trim()) params.set("q", nextSearch.trim());
    else params.delete("q");
    if (normalizedStatus !== "All statuses") params.set("categoryStatus", normalizedStatus);
    else params.delete("categoryStatus");
    if (safeDateFrom && safeDateFrom !== defaultDateFrom) params.set("dateFrom", safeDateFrom);
    else params.delete("dateFrom");
    if (safeDateTo && safeDateTo !== defaultDateTo) params.set("dateTo", safeDateTo);
    else params.delete("dateTo");
    const query = params.toString();
    window.localStorage.setItem("finance-pro:filters:categories", JSON.stringify({
      activeTab,
      dateFrom: safeDateFrom,
      dateTo: safeDateTo,
      hierarchyView,
      search: nextSearch.trim(),
      status: normalizedStatus,
    }));
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  }

  useEffect(() => {
    if (filtersRestored.current) return;
    filtersRestored.current = true;
    try {
      const saved = JSON.parse(window.localStorage.getItem("finance-pro:filters:categories") ?? "null");
      if (!saved || typeof saved !== "object") return;
      if (typeof saved.activeTab === "string" && tabs.includes(saved.activeTab)) {
        queueMicrotask(() => setActiveTab(`${categoryTypeLabel(categoryTypeFromTab(saved.activeTab))} Categories`));
      }
      if (typeof saved.hierarchyView === "string" && hierarchyViews.includes(saved.hierarchyView as HierarchyView)) {
        queueMicrotask(() => setHierarchyView(saved.hierarchyView as HierarchyView));
      }
      if (searchParams.has("q") || searchParams.has("categoryStatus") || searchParams.has("dateFrom") || searchParams.has("dateTo")) return;
      applyFilters(
        typeof saved.search === "string" ? saved.search : "",
        typeof saved.status === "string" ? saved.status : "All statuses",
        typeof saved.dateFrom === "string" ? saved.dateFrom : "",
        typeof saved.dateTo === "string" ? saved.dateTo : "",
      );
    } catch {
      // Invalid browser storage is ignored.
    }
    // This one-time restoration intentionally uses the initial URL state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  async function handleDelete(categoryId: string) {
    setIsPending(true);
    const result = await deleteCategory(categoryId);
    setIsPending(false);
    if (result.error) {
      showError(result.error);
      return;
    }
    setVisibleCategories((items) => items.filter((item) => item.id !== categoryId));
    showSuccess("Category deleted successfully.");
  }

  async function handleStatusChange(category: CategoryRecord, isActive: boolean) {
    setIsPending(true);
    const result = await setCategoryStatus(category.id, isActive);
    setIsPending(false);
    if (result.error) {
      showError(result.error);
      return false;
    }
    setVisibleCategories((items) => items.map((item) => item.id === category.id
      ? { ...item, status: isActive ? "Active" : "Hidden" }
      : item));
    showSuccess(isActive ? "Category restored for new records." : "Category hidden; historical records are unchanged.");
    router.refresh();
    return true;
  }

  async function handleMerge(source: CategoryRecord, targetCategoryId: string) {
    setIsPending(true);
    const result = await mergeCategory(source.id, targetCategoryId);
    setIsPending(false);
    if (result.error) {
      showError(result.error);
      return false;
    }
    const target = visibleCategories.find((category) => category.id === targetCategoryId);
    setVisibleCategories((items) => items.map((item) => {
      if (item.id === source.id) return {
        ...item,
        mergedIntoCategoryId: targetCategoryId,
        mergedIntoCategoryName: target?.name ?? "",
        monthlyAverage: "0 MMK",
        status: "Hidden",
        transactionCount: 0,
      };
      if (item.id === targetCategoryId && !item.reportingRole && source.reportingRole) {
        return { ...item, reportingRole: source.reportingRole };
      }
      return item;
    }));
    showSuccess(`${source.name} merged into ${target?.name ?? "the target category"}; linked records were reassigned.`);
    router.refresh();
    return true;
  }

  return (
    <>
      <CategoryFilters
        defaultDateFrom={defaultDateFrom}
        defaultDateTo={defaultDateTo}
        initialDateFrom={dateFrom}
        initialDateTo={dateTo}
        initialSearch={search}
        initialStatus={status}
        key={searchParams.toString()}
        onSearch={applyFilters}
      />
      <SegmentedTabs activeTab={activeTab} onTabChange={(tab) => {
        setActiveTab(tab);
        window.localStorage.setItem("finance-pro:filters:categories", JSON.stringify({ activeTab: tab, dateFrom, dateTo, hierarchyView, search, status }));
      }} tabs={tabs} />

      <section className="mb-5 flex flex-col gap-3 rounded-lg border border-[#c6c6cd]/60 bg-white p-4 shadow-[0_4px_20px_rgba(15,23,42,0.04)] sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-sm font-bold text-[#0b1c30]">Category view</h2>
          <p className="mt-1 text-xs leading-5 text-[#45464d]">Super categories show totals rolled up from every linked subcategory in the selected date range.</p>
        </div>
        <div className="grid grid-cols-1 gap-1 rounded-lg bg-[#f1f1f4] p-1 sm:grid-cols-3" role="group" aria-label="Category hierarchy view">
          {hierarchyViews.map((view) => (
            <button
              aria-pressed={hierarchyView === view}
              className={hierarchyView === view
                ? "min-h-10 rounded-md bg-white px-3 text-sm font-bold text-[#0058be] shadow-sm"
                : "min-h-10 rounded-md px-3 text-sm font-semibold text-[#45464d] transition hover:bg-white/70"}
              key={view}
              onClick={() => {
                setHierarchyView(view);
                window.localStorage.setItem("finance-pro:filters:categories", JSON.stringify({ activeTab, dateFrom, dateTo, hierarchyView: view, search, status }));
              }}
              type="button"
            >
              {view}
            </button>
          ))}
        </div>
      </section>

      {isPending ? <p className="mb-4 text-sm font-medium text-[#45464d]">Updating categories…</p> : null}

      {filteredCategories.length === 0 ? (
        <section className="rounded-lg border border-dashed border-[#c6c6cd] bg-white p-6 text-center sm:p-10">
          <Icon className="mx-auto size-8 text-[#76777d]" name="category" />
          <h2 className="mt-3 text-lg font-semibold text-[#0b1c30]">
            {hasCategoriesForSelectedView && hasActiveCategoryFilters
              ? "No matching categories"
              : hasCategoriesForActiveType
                ? `No ${hierarchyView.toLowerCase()} in this category type`
                : `No ${String(categoryTypeLabel(activeType)).toLowerCase()} categories yet`}
          </h2>
          <p className="mt-1 text-sm text-[#45464d]">
            {hasCategoriesForSelectedView && hasActiveCategoryFilters
              ? "Change or reset the category filters to see results."
              : hasCategoriesForActiveType
                ? "Switch the category view or create a category at this hierarchy level."
              : "Create categories that match how you manage your finances."}
          </p>
          {!hasCategoriesForActiveType ? <Link className="mt-5 inline-flex min-h-11 items-center justify-center rounded-md bg-[#0b1c30] px-4 text-sm font-semibold text-white" href="/categories/add">Add Category</Link> : null}
        </section>
      ) : null}

      {filteredCategories.length > 0 ? <section className="space-y-3">
        {hierarchicalCategories.map((category) => (
          <div className={category.level === "Subcategory" && category.parentId ? "ml-3 border-l-2 border-[#bfdbfe] pl-3 sm:ml-6 sm:pl-4" : ""} key={category.id}>
            <CategoryListItem categories={visibleCategories} category={category} onDelete={handleDelete} onMerge={handleMerge} onStatusChange={handleStatusChange} onView={() => setViewedCategory(category)} />
          </div>
        ))}
      </section> : null}
      <DetailModal
        actions={viewedCategory ? <><Link className="inline-flex min-h-11 items-center gap-2 rounded-md border border-[#c6c6cd] bg-white px-4 text-sm font-semibold text-[#0b1c30] hover:bg-[#eff4ff]" href={`/categories/${viewedCategory.id}/edit`}><Icon className="size-4" name="edit" />Edit</Link>{viewedCategory.level === "Subcategory" && isTransactionCategoryType(viewedCategory.type) ? <Link className="inline-flex min-h-11 items-center gap-2 rounded-md border border-[#c6c6cd] bg-white px-4 text-sm font-semibold text-[#0058be] hover:bg-[#eff4ff]" href={`/transactions?category=${encodeURIComponent(viewedCategory.name)}`}><Icon className="size-4" name="receipt" />Transactions</Link> : null}</> : null}
        icon={viewedCategory?.icon}
        iconClassName={viewedCategory ? `${viewedCategory.bg} ${viewedCategory.tone}` : undefined}
        isOpen={viewedCategory !== null}
        onClose={() => setViewedCategory(null)}
        subtitle={viewedCategory ? categoryTypeLabel(viewedCategory.type) : undefined}
        title={viewedCategory?.name ?? "Category details"}
      >
        {viewedCategory ? <div className="space-y-5">
          <DetailModalSection title="Category information">
            <DetailModalField label="Type" value={categoryTypeLabel(viewedCategory.type)} />
            <DetailModalField label="Level" value={viewedCategory.level} />
            <DetailModalField label="Super category" value={viewedCategory.parentName || "Ungrouped"} />
            <DetailModalField label={viewedCategory.level === "Super" ? financialPurposeFieldLabel(viewedCategory.type) : "Inherited dashboard classification"} value={viewedFinancialRole ? financialPurposeLabel(viewedFinancialRole) : "Not set"} />
            <DetailModalField label="Status" value={viewedCategory.status} />
            <DetailModalField label="Scopes" value={viewedCategory.scopes.join(", ") || "Not assigned"} />
            <DetailModalField label="Default category" value={viewedCategory.isDefault ? viewedCategory.isSharedDefault ? "Shared system default" : "Default" : "No"} />
            <DetailModalField label="Reporting role" value={viewedCategory.reportingRole || "Standard"} />
            <DetailModalField label="Color" value={viewedCategory.color || "Default"} />
            <DetailModalField label="Merged into" value={viewedCategory.mergedIntoCategoryName || "Not merged"} />
          </DetailModalSection>
          <DetailModalSection title="Activity">
            <DetailModalField label={viewedCategory.level === "Super" ? `Rolled-up ${viewedCategory.activityLabel}` : viewedCategory.activityLabel} value={viewedCategory.monthlyAverage} />
            <DetailModalField label={viewedCategory.countLabel} value={viewedCategory.transactionCount} />
          </DetailModalSection>
          {viewedCategory.level === "Super" ? <DetailModalSection title="Linked subcategories">
            <DetailModalField
              label="Subcategories"
              value={visibleCategories.filter((category) => category.parentId === viewedCategory.id && !category.mergedIntoCategoryId).map((category) => category.name).join(", ") || "No linked subcategories"}
            />
          </DetailModalSection> : null}
          <DetailModalSection title="Description">
            <DetailModalField label="Notes" value={viewedCategory.description || "No description"} />
          </DetailModalSection>
        </div> : null}
      </DetailModal>
    </>
  );
}
