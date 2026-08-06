import { notFound } from "next/navigation";

import { AppShell } from "@/components/app/app-shell";
import { PageHeader } from "@/components/app/page-header";
import { AddCategoryForm } from "@/features/categories/add-category-form";
import { getCategories } from "@/lib/categories/supabase";

export default async function EditCategoryPage({ params }: { params: Promise<{ categoryId: string }> }) {
  const { categoryId } = await params;
  const categories = await getCategories();
  const category = categories.find((item) => item.id === categoryId) ?? null;

  if (!category) {
    notFound();
  }
  return (
    <AppShell
      activeNavLabel="Categories"
      mobileSearchLabel="Search categories on mobile"
      mobileSearchPlaceholder="Search categories..."
      mobileSubtitle="Edit Category"
      topSearchLabel="Search categories"
      topSearchPlaceholder="Search categories..."
    >
      <PageHeader description={`Update category details for ${category.name}.`} title="Edit Category" />
      <AddCategoryForm categories={categories} category={category} />
    </AppShell>
  );
}
