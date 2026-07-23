import Link from "next/link";

import { AppShell } from "@/components/app/app-shell";
import { PageHeader } from "@/components/app/page-header";
import { SummaryCards } from "@/components/app/summary-cards";
import { Icon } from "@/components/ui/icon";
import { CategoriesPageContent } from "@/features/categories/categories-page-content";
import { getCategories, getCategorySummaries } from "@/lib/categories/supabase";

export default async function CategoriesPage({
  searchParams,
}: {
  searchParams: Promise<{
    dateFrom?: string | string[];
    dateTo?: string | string[];
  }>;
}) {
  const resolvedSearchParams = await searchParams;
  const dateFrom = Array.isArray(resolvedSearchParams.dateFrom) ? resolvedSearchParams.dateFrom[0] : resolvedSearchParams.dateFrom;
  const dateTo = Array.isArray(resolvedSearchParams.dateTo) ? resolvedSearchParams.dateTo[0] : resolvedSearchParams.dateTo;
  const categories = await getCategories({ dateFrom, dateTo, limit: 200 });
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
            className="inline-flex min-h-11 items-center gap-2 rounded-md bg-[#0b1c30] px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-[#1f2937]"
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
      <CategoriesPageContent
        categories={categories}
        key={`${dateFrom ?? ""}:${dateTo ?? ""}:${categories.map((category) => `${category.id}:${category.status}:${category.mergedIntoCategoryId}:${category.reportingRole}:${category.monthlyAverage}:${category.transactionCount}`).join("|")}`}
      />
    </AppShell>
  );
}
