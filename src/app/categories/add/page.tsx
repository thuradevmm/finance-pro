import { AppShell } from "@/components/app/app-shell";
import { PageHeader } from "@/components/app/page-header";
import { AddCategoryForm } from "@/features/categories/add-category-form";

export default function AddCategoryPage() {
  return (
    <AppShell
      activeNavLabel="Categories"
      mobileSearchLabel="Search categories on mobile"
      mobileSearchPlaceholder="Search categories..."
      mobileSubtitle="Add Category"
      topSearchLabel="Search categories"
      topSearchPlaceholder="Search categories..."
    >
      <PageHeader description="Create a reusable classification for income, expenses, budgets, and reports." title="Add Category" />
      <AddCategoryForm />
    </AppShell>
  );
}
