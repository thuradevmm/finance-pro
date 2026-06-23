import type { CategoryScope, CategoryType, FinancialCategory } from "@/types/finance";

export function getCategoriesForScope(categories: FinancialCategory[], scope: CategoryScope, type?: CategoryType) {
  return categories.filter((category) => category.status === "Active" && category.scopes.includes(scope) && (!type || category.type === type));
}

export function getScopesForCategoryType(type: CategoryType): CategoryScope[] {
  if (type === "Account") return ["Accounts"];
  if (type === "Asset") return ["Assets"];
  if (type === "Debt") return ["Debts"];
  if (type === "Savings Goal") return ["Savings Goals"];
  if (type === "Subscription") return ["Subscriptions"];
  return ["Transactions"];
}

export function isTransactionCategoryType(type: CategoryType) {
  return type === "Expense" || type === "Income";
}
