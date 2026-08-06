import { AppShell } from "@/components/app/app-shell";
import { PageHeader } from "@/components/app/page-header";
import { AddCategoryForm } from "@/features/categories/add-category-form";
import { getCategories } from "@/lib/categories/supabase";

export default async function AddCategoryPage() {
  const categories = await getCategories();
  return (
    <AppShell
      activeNavLabel="Categories"
      mobileSearchLabel="Search categories on mobile"
      mobileSearchPlaceholder="Search categories..."
      mobileSubtitle="Add Category"
      topSearchLabel="Search categories"
      topSearchPlaceholder="Search categories..."
    >
      <PageHeader description="Create a reusable classification for transactions, future planning, and linked financial records." title="Add Category" />
      <AddCategoryForm categories={categories} />
    </AppShell>
  );
}
