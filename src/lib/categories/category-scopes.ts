import type { CategoryScope, CategoryType, FinancialCategory } from "@/types/finance";

function metadataRecord(metadata: unknown) {
  return metadata && typeof metadata === "object" && !Array.isArray(metadata)
    ? metadata as Record<string, unknown>
    : {};
}

function normalizedCategoryType(value: unknown) {
  return String(value ?? "").trim().toLowerCase().replace(/[_-]/g, " ");
}

export function categoryRowSupports(
  row: { metadata?: unknown; type?: unknown },
  scope: CategoryScope,
  type: CategoryType,
) {
  const metadata = metadataRecord(row.metadata);
  const scopes = Array.isArray(metadata.scopes)
    ? metadata.scopes.map((value) => String(value).trim().toLowerCase())
    : [];
  const expectedScope = scope.toLowerCase();
  const expectedType = type.toLowerCase();
  const rowType = normalizedCategoryType(metadata.category_type ?? row.type);
  return scopes.includes(expectedScope) && rowType === expectedType;
}

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
