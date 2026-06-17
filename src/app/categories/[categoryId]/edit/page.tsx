import { AppShell } from "@/components/app/app-shell";
import { PageHeader } from "@/components/app/page-header";
import { SimpleRecordEditPage } from "@/components/ui/simple-record-edit-page";
import { categories } from "@/lib/categories/mock-data";
import type { CategoryType } from "@/types/finance";

const categoryTypes: CategoryType[] = ["Expense", "Income"];

export default async function EditCategoryPage({ params }: { params: Promise<{ categoryId: string }> }) {
  const { categoryId } = await params;
  const category = categories.find((item) => item.id === categoryId) ?? categories[0];
  const record = {
    description: category.description,
    monthlyAverage: category.monthlyAverage,
    name: category.name,
    status: category.status,
    type: category.type,
  };

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
      <SimpleRecordEditPage
        cancelHref="/categories"
        fields={[
          { key: "name", label: "Category Name" },
          { key: "type", label: "Category Type", options: categoryTypes },
          { key: "monthlyAverage", label: "Monthly Average" },
          { key: "status", label: "Status", options: ["Active", "Hidden"] },
          { key: "description", label: "Description", type: "textarea" },
        ]}
        preview={{
          icon: category.icon,
          iconClassName: `${category.bg} ${category.tone}`,
          label: "Category Preview",
          metrics: [
            { label: "Type", key: "type" },
            { label: "Monthly Avg", key: "monthlyAverage" },
            { label: "Status", key: "status" },
          ],
          primaryKey: "name",
          secondaryKey: "description",
        }}
        record={record}
        saveLabel="Save Category"
      />
    </AppShell>
  );
}
