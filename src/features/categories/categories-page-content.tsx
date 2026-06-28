"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";

import { deleteCategory } from "@/app/categories/actions";
import { SegmentedTabs } from "@/components/app/segmented-tabs";
import { Icon } from "@/components/ui/icon";
import { RecordActions } from "@/components/ui/record-actions";
import { ResponsiveAmount } from "@/components/ui/responsive-amount";
import { useToast } from "@/components/ui/toast-provider";
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

function CategoryListItem({ category, onDelete }: { category: CategoryRecord; onDelete: (id: string) => void }) {
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
        <span className="mb-1 block text-xs font-bold uppercase text-[#45464d]">Monthly Avg</span>
        <ResponsiveAmount className="font-semibold text-[#0b1c30]" maxSizeRem={1.25}>{category.monthlyAverage}</ResponsiveAmount>
        <span className="mt-1 block text-xs font-semibold text-[#45464d]">{category.transactionCount} Transactions</span>
      </div>

      <div className="flex min-h-11 items-center justify-end border-t border-[#c6c6cd]/40 pt-3 xl:border-0 xl:pt-0">
        <RecordActions
          deleteDescription={`Deleting ${category.name} will remove this category from your category list.`}
          editHref={`/categories/${category.id}/edit`}
          itemId={category.id}
          itemLabel={category.name}
          onDelete={onDelete}
          viewHref={isTransactionCategoryType(category.type) ? `/transactions?category=${encodeURIComponent(category.name)}` : undefined}
          viewLabel="View transactions"
        />
      </div>
    </article>
  );
}

export function CategoriesPageContent({ categories }: { categories: CategoryRecord[] }) {
  const { showError, showSuccess } = useToast();
  const searchParams = useSearchParams();
  const [activeTab, setActiveTab] = useState("Expense Categories");
  const [visibleCategories, setVisibleCategories] = useState(categories);
  const [isPending, setIsPending] = useState(false);
  const activeType = activeTab.replace(/ Categories$/, "") as CategoryType;
  const search = searchParams.get("q") ?? "";
  const filteredCategories = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();
    return visibleCategories.filter((category) => {
      const searchable = `${category.name} ${category.description} ${category.type} ${category.monthlyAverage} ${category.status} ${category.scopes.join(" ")}`.toLowerCase();
      return category.type === activeType && (normalizedSearch === "" || searchable.includes(normalizedSearch));
    });
  }, [activeType, search, visibleCategories]);

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

  return (
    <>
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
          <CategoryListItem category={category} key={category.id} onDelete={handleDelete} />
        ))}
      </section> : null}
    </>
  );
}
