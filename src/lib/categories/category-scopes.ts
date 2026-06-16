import type { CategoryScope, CategoryType, FinancialCategory } from "@/types/finance";

export function getCategoriesForScope(categories: FinancialCategory[], scope: CategoryScope, type?: CategoryType) {
  return categories.filter((category) => category.status === "Active" && category.scopes.includes(scope) && (!type || category.type === type));
}
