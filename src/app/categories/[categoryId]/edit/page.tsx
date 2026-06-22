import { notFound } from "next/navigation";

import { AppShell } from "@/components/app/app-shell";
import { PageHeader } from "@/components/app/page-header";
import { AddCategoryForm } from "@/features/categories/add-category-form";
import { getCategory } from "@/lib/categories/supabase";

export default async function EditCategoryPage({ params }: { params: Promise<{ categoryId: string }> }) {
  const { categoryId } = await params;
  const category = await getCategory(categoryId);

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
      <AddCategoryForm category={category} />
    </AppShell>
  );
}
