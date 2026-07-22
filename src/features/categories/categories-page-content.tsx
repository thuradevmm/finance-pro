"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { deleteCategory, mergeCategory, setCategoryStatus } from "@/app/categories/actions";
import { SegmentedTabs } from "@/components/app/segmented-tabs";
import { DeleteConfirmationDialog } from "@/components/ui/delete-confirmation-dialog";
import { SelectInput, TextInput } from "@/components/ui/form-controls";
import { Icon } from "@/components/ui/icon";
import { RecordActions } from "@/components/ui/record-actions";
import { ResponsiveAmount } from "@/components/ui/responsive-amount";
import { useToast } from "@/components/ui/toast-provider";
import { CategoryMergeDialog } from "@/features/categories/category-merge-dialog";
import { isTransactionCategoryType } from "@/lib/categories/category-scopes";
import type { CategoryRecord } from "@/lib/categories/supabase";
import type { CategoryType } from "@/types/finance";

const categoryTypes: CategoryType[] = ["Expense", "Income", "Account", "Savings Goal", "Debt", "Subscription", "Asset"];
const tabs = categoryTypes.map((type) => `${type} Categories`);

function CategoryBadge({ type }: { type: CategoryType }) {
  return (
    <span className="rounded border border-[#c6c6cd]/40 bg-[#eff4ff] px-2 py-0.5 text-xs font-semibold text-[#45464d]">
      {type}
    </span>
  );
}

function CategoryLifecycleActions({
  categories,
  category,
  onDelete,
  onMerge,
  onStatusChange,
}: {
  categories: CategoryRecord[];
  category: CategoryRecord;
  onDelete: (id: string) => void;
  onMerge: (source: CategoryRecord, targetCategoryId: string) => Promise<boolean>;
  onStatusChange: (category: CategoryRecord, isActive: boolean) => Promise<boolean>;
}) {
  const [isLifecycleOpen, setIsLifecycleOpen] = useState(false);
  const [isMergeOpen, setIsMergeOpen] = useState(false);
  const [isPending, setIsPending] = useState(false);
  const isHidden = category.status === "Hidden";
  const isMerged = Boolean(category.mergedIntoCategoryId);
  const mergeTargets = categories.filter((target) => target.id !== category.id
    && target.type === category.type
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
          title={`Merge ${category.name} into another ${category.type.toLowerCase()} category`}
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
        showDelete={!isMerged}
        showEdit={!isMerged}
        viewHref={isTransactionCategoryType(category.type) ? `/transactions?category=${encodeURIComponent(category.name)}` : undefined}
        viewLabel="View transactions"
      />
      <DeleteConfirmationDialog
        confirmIcon={isHidden ? "eye" : "eyeOff"}
        confirmLabel={isHidden ? "Restore" : "Hide"}
        description={isHidden
          ? `Restore ${category.name} so it can be selected for new records again. Historical data is already preserved.`
          : `Hide ${category.name} from new-entry selectors while keeping all historical transactions, reports, and linked records unchanged.`}
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
}: {
  categories: CategoryRecord[];
  category: CategoryRecord;
  onDelete: (id: string) => void;
  onMerge: (source: CategoryRecord, targetCategoryId: string) => Promise<boolean>;
  onStatusChange: (category: CategoryRecord, isActive: boolean) => Promise<boolean>;
}) {
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
            {category.isDefault ? <span className="rounded bg-[#eef2ff] px-2 py-0.5 text-xs font-semibold text-[#4f46e5]">Default</span> : null}
            {category.reportingRole === "salary" ? <span className="rounded bg-[#ecfdf5] px-2 py-0.5 text-xs font-semibold text-[#047857]">Salary</span> : null}
            <span className={category.status === "Active"
              ? "rounded bg-[#ecfdf5] px-2 py-0.5 text-xs font-semibold text-[#166534]"
              : "rounded bg-[#f1f1f4] px-2 py-0.5 text-xs font-semibold text-[#45464d]"}>{category.status}</span>
            {category.mergedIntoCategoryId ? <span className="rounded bg-[#eef2ff] px-2 py-0.5 text-xs font-semibold text-[#4f46e5]">Merged into {category.mergedIntoCategoryName || "another category"}</span> : null}
          </div>
          <p className="break-words text-sm leading-5 text-[#45464d]">{category.description}</p>
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
        <span className="mb-1 block text-xs font-bold uppercase text-[#45464d]">{category.activityLabel}</span>
        <ResponsiveAmount className="font-semibold text-[#0b1c30]" maxSizeRem={1.25}>{category.monthlyAverage}</ResponsiveAmount>
        <span className="mt-1 block text-xs font-semibold text-[#45464d]">{category.transactionCount} {category.countLabel}</span>
      </div>

      <div className="flex min-h-11 items-center justify-end border-t border-[#c6c6cd]/40 pt-3 xl:border-0 xl:pt-0">
        <CategoryLifecycleActions categories={categories} category={category} onDelete={onDelete} onMerge={onMerge} onStatusChange={onStatusChange} />
      </div>
    </article>
  );
}

function CategoryFilters({
  initialSearch,
  initialStatus,
  onSearch,
}: {
  initialSearch: string;
  initialStatus: string;
  onSearch: (search: string, status: string) => void;
}) {
  const [draftSearch, setDraftSearch] = useState(initialSearch);
  const [draftStatus, setDraftStatus] = useState(initialStatus);

  return (
    <form
      className="mb-6 grid grid-cols-1 gap-3 rounded-lg border border-[#c6c6cd]/70 bg-white p-4 shadow-[0_4px_20px_rgba(15,23,42,0.04)] md:grid-cols-[minmax(0,1fr)_minmax(11rem,0.35fr)_auto]"
      onSubmit={(event) => {
        event.preventDefault();
        onSearch(draftSearch, draftStatus);
      }}
    >
      <TextInput label="Search Categories" onChange={setDraftSearch} placeholder="Name, type, scope, status..." value={draftSearch} />
      <SelectInput label="Status" onChange={setDraftStatus} options={["All statuses", "Active", "Hidden"]} value={draftStatus} />
      <div className="flex items-end">
        <button className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-md bg-[#0b1c30] px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-[#1f2937]" type="submit">
          <Icon className="size-4" name="search" />
          Search
        </button>
      </div>
    </form>
  );
}

export function CategoriesPageContent({ categories }: { categories: CategoryRecord[] }) {
  const { showError, showSuccess } = useToast();
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  const [activeTab, setActiveTab] = useState("Expense Categories");
  const [visibleCategories, setVisibleCategories] = useState(categories);
  const [isPending, setIsPending] = useState(false);
  const activeType = activeTab.replace(/ Categories$/, "") as CategoryType;
  const search = searchParams.get("q") ?? "";
  const status = searchParams.get("categoryStatus") ?? "All statuses";
  const filteredCategories = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();
    return visibleCategories.filter((category) => {
      const searchable = `${category.name} ${category.description} ${category.type} ${category.activityLabel} ${category.monthlyAverage} ${category.countLabel} ${category.status} ${category.scopes.join(" ")}`.toLowerCase();
      const matchesStatus = status === "All statuses" || category.status === status;
      return category.type === activeType && matchesStatus && (normalizedSearch === "" || searchable.includes(normalizedSearch));
    });
  }, [activeType, search, status, visibleCategories]);

  function applyFilters(nextSearch: string, nextStatus: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (nextSearch.trim()) params.set("q", nextSearch.trim());
    else params.delete("q");
    if (nextStatus !== "All statuses") params.set("categoryStatus", nextStatus);
    else params.delete("categoryStatus");
    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  }

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
      <CategoryFilters initialSearch={search} initialStatus={status} key={searchParams.toString()} onSearch={applyFilters} />
      <SegmentedTabs activeTab={activeTab} onTabChange={setActiveTab} tabs={tabs} />

      {isPending ? <p className="mb-4 text-sm font-medium text-[#45464d]">Updating categories…</p> : null}

      {filteredCategories.length === 0 ? (
        <section className="rounded-lg border border-dashed border-[#c6c6cd] bg-white p-6 text-center sm:p-10">
          <Icon className="mx-auto size-8 text-[#76777d]" name="category" />
          <h2 className="mt-3 text-lg font-semibold text-[#0b1c30]">No {activeType.toLowerCase()} categories yet</h2>
          <p className="mt-1 text-sm text-[#45464d]">Create categories that match how you manage your finances.</p>
          <Link className="mt-5 inline-flex min-h-11 items-center justify-center rounded-md bg-[#0b1c30] px-4 text-sm font-semibold text-white" href="/categories/add">Add Category</Link>
        </section>
      ) : null}

      {filteredCategories.length > 0 ? <section className="space-y-3">
        {filteredCategories.map((category) => (
          <CategoryListItem categories={visibleCategories} category={category} key={category.id} onDelete={handleDelete} onMerge={handleMerge} onStatusChange={handleStatusChange} />
        ))}
      </section> : null}
    </>
  );
}
