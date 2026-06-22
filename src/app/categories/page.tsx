import Link from "next/link";

import { AppShell } from "@/components/app/app-shell";
import { PageHeader } from "@/components/app/page-header";
import { SummaryCards } from "@/components/app/summary-cards";
import { Icon } from "@/components/ui/icon";
import { CategoriesPageContent } from "@/features/categories/categories-page-content";
import { getCategories, getCategorySummaries } from "@/lib/categories/supabase";

export default async function CategoriesPage() {
  const categories = await getCategories();
  const categorySummaries = getCategorySummaries(categories);
  return (
    <AppShell
      activeNavLabel="Categories"
      mobileAction={{ label: "Add category", icon: "plus", href: "/categories/add", title: "Add category" }}
      mobileSearchLabel="Search categories on mobile"
      mobileSearchPlaceholder="Search categories..."
      mobileSubtitle="Categories"
      topSearchLabel="Search categories"
      topSearchPlaceholder="Search categories..."
    >
      <PageHeader
        actions={
          <Link
            className="inline-flex h-10 items-center gap-2 rounded-md bg-[#0b1c30] px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-[#1f2937]"
            href="/categories/add"
          >
            <Icon className="size-4" name="plus" />
            Add Category
          </Link>
        }
        description="Manage income and expense classifications for transactions, budgets, and reports."
        title="Categories"
      />

      <SummaryCards summaries={categorySummaries} />
      <CategoriesPageContent categories={categories} />
    </AppShell>
  );
}
