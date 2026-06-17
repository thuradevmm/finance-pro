"use client";

import { useMemo, useState } from "react";

import { SegmentedTabs } from "@/components/app/segmented-tabs";
import { Icon } from "@/components/ui/icon";
import { RecordActions } from "@/components/ui/record-actions";
import type { CategoryType, FinancialCategory } from "@/types/finance";

type CategoryTab = "Expense Categories" | "Income Categories";

const tabs: CategoryTab[] = ["Expense Categories", "Income Categories"];

function CategoryBadge({ type }: { type: CategoryType }) {
  return (
    <span className="rounded border border-[#c6c6cd]/40 bg-[#eff4ff] px-2 py-0.5 text-xs font-semibold text-[#45464d]">
      {type}
    </span>
  );
}

function CategoryCard({ category, onDelete }: { category: FinancialCategory; onDelete: (id: string) => void }) {
  return (
    <article className="flex min-h-64 flex-col rounded-lg border border-[#c6c6cd]/60 bg-white p-5 shadow-[0_4px_20px_rgba(15,23,42,0.04)] transition hover:shadow-[0_10px_30px_rgba(15,23,42,0.08)]">
      <div className="mb-6 flex items-start justify-between gap-4">
        <span className={`grid size-11 place-items-center rounded-full ${category.bg} ${category.tone}`}>
          <Icon name={category.icon} />
        </span>
        <span className={`size-3 rounded-full ${category.marker}`} title={`${category.name} color`} />
      </div>

      <div className="mt-auto">
        <div className="mb-1 flex items-center gap-2">
          <h2 className="text-xl font-semibold text-[#0b1c30]">{category.name}</h2>
          <CategoryBadge type={category.type} />
        </div>
        <p className="mb-4 text-sm text-[#45464d]">{category.description}</p>
        <div className="mb-4 flex flex-wrap gap-1.5">
          {category.scopes.map((scope) => (
            <span className="rounded bg-[#f8f9ff] px-2 py-1 text-xs font-semibold text-[#45464d]" key={scope}>
              {scope}
            </span>
          ))}
        </div>

        <div className="flex items-end justify-between gap-4 border-t border-[#c6c6cd]/40 pt-4">
          <div>
            <span className="mb-1 block text-xs font-bold uppercase text-[#45464d]">Monthly Avg</span>
            <span className="text-2xl font-semibold text-[#0b1c30]">{category.monthlyAverage}</span>
          </div>
          <span className="text-right text-xs font-semibold text-[#45464d]">{category.transactionCount} Transactions</span>
        </div>

        <div className="mt-4 flex items-center justify-end gap-1 border-t border-[#c6c6cd]/40 pt-4">
          <RecordActions editHref={`/categories/${category.id}/edit`} itemId={category.id} itemLabel={category.name} onDelete={onDelete} />
        </div>
      </div>
    </article>
  );
}

export function CategoriesPageContent({ categories }: { categories: FinancialCategory[] }) {
  const [activeTab, setActiveTab] = useState<CategoryTab>("Expense Categories");
  const [visibleCategories, setVisibleCategories] = useState(categories);
  const activeType: CategoryType = activeTab === "Expense Categories" ? "Expense" : "Income";
  const filteredCategories = useMemo(() => visibleCategories.filter((category) => category.type === activeType), [activeType, visibleCategories]);

  return (
    <>
      <SegmentedTabs activeTab={activeTab} onTabChange={(tab) => setActiveTab(tab as CategoryTab)} tabs={tabs} />

      <section className="grid grid-cols-1 gap-6 sm:grid-cols-2 xl:grid-cols-4">
        {filteredCategories.map((category) => (
          <CategoryCard category={category} key={category.id} onDelete={(id) => setVisibleCategories((items) => items.filter((item) => item.id !== id))} />
        ))}
      </section>
    </>
  );
}
