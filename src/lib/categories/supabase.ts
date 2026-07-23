import { formatMmk } from "@/lib/currency";
import { getCategoryTypeStyle } from "@/lib/categories/category-style";
import {
  buildCategoryActivity,
  pageCategoryActivityRows,
  pageCategoryRollupLabels,
  transactionCategoryActivityRows,
  type CategoryActivity,
} from "@/lib/categories/rollups";
import { createClient } from "@/lib/supabase/server";
import { getUserSafely } from "@/lib/supabase/auth";
import { deriveCreditCardDebtMetadata } from "@/lib/ledger";
import { isMissingDatabaseObject } from "@/lib/supabase/schema-compat";
import type { CategoryScope, CategoryType, FinancialCategory, SummaryMetric } from "@/types/finance";

export type CategoryRecord = FinancialCategory & {
  activityLabel: string;
  color: string;
  countLabel: string;
  isDefault: boolean;
  isSharedDefault: boolean;
};

export type CategoryFormData = {
  description: string;
  isActive: boolean;
  isDefault: boolean;
  name: string;
  reportingRole: "" | "salary";
  scopes: CategoryScope[];
  type: CategoryType;
};

type CategoryRow = {
  archived_at?: string | null;
  category_type?: string | null;
  color: string | null;
  description?: string | null;
  icon: string | null;
  id: string;
  is_active: boolean;
  is_default: boolean;
  metadata: unknown;
  merged_into_category_id?: string | null;
  name: string;
  reporting_role?: string | null;
  type: string;
  user_id: string | null;
};

type CategoryTransactionRow = {
  account_id: string | null;
  amount: number | string;
  category_id: string | null;
  id: string;
  metadata: unknown;
  related_entity_id: string | null;
  related_entity_type: string | null;
  status: string | null;
  transaction_date: string;
  transfer_account_id: string | null;
  type: string;
};

type CategoryAccountRow = {
  created_at: string | null;
  id: string;
  initial_balance: number | string | null;
  metadata: unknown;
  type: string | null;
};
type CategoryDebtRow = {
  category_id: string | null;
  created_at: string | null;
  id: string;
  metadata: unknown;
  payment_account_id: string | null;
  repaid_amount: number | string | null;
  start_date: string | null;
  total_amount: number | string | null;
  type: string | null;
};

function metadataRecord(metadata: unknown) {
  return metadata && typeof metadata === "object" && !Array.isArray(metadata)
    ? metadata as Record<string, unknown>
    : {};
}

function normalizeCategoryType(categoryType: unknown, rowType: string, scopes: CategoryScope[], metadata: Record<string, unknown>): CategoryType {
  const metadataType = typeof metadata.category_type === "string" ? metadata.category_type : "";
  const normalizedType = String(categoryType || metadataType || rowType).toLowerCase().replace(/[_-]/g, " ");

  if (normalizedType === "account" || normalizedType === "accounts") return "Account";
  if (normalizedType === "asset" || normalizedType === "assets") return "Asset";
  if (normalizedType === "debt" || normalizedType === "debts") return "Debt";
  if (normalizedType === "savings goal" || normalizedType === "savings goals") return "Savings Goal";
  if (normalizedType === "subscription" || normalizedType === "subscriptions") return "Subscription";
  if (normalizedType === "income") return "Income";

  if (!scopes.includes("Transactions")) {
    if (scopes.includes("Accounts")) return "Account";
    if (scopes.includes("Assets")) return "Asset";
    if (scopes.includes("Debts")) return "Debt";
    if (scopes.includes("Savings Goals")) return "Savings Goal";
    if (scopes.includes("Subscriptions")) return "Subscription";
  }

  return "Expense";
}

function mapCategory(row: CategoryRow, categoryNames: Map<string, string>, activity?: CategoryActivity): CategoryRecord {
  const metadata = metadataRecord(row.metadata);
  const scopes = Array.isArray(metadata.scopes)
    ? metadata.scopes.filter((scope): scope is CategoryScope => typeof scope === "string")
    : ["Transactions", "Reports"] as CategoryScope[];
  const type = normalizeCategoryType(row.category_type, row.type, scopes, metadata);
  const style = getCategoryTypeStyle(type);
  const isTransactionCategory = type === "Expense" || type === "Income";
  const activityValue = isTransactionCategory ? activity?.monthlyAverage ?? 0 : activity?.total ?? 0;
  const transactionCount = activity?.transactionCount ?? 0;
  const labels: Record<CategoryType, { activity: string; count: string }> = {
    ...pageCategoryRollupLabels,
    Expense: { activity: "Monthly Avg", count: "Transactions" },
    Income: { activity: "Monthly Avg", count: "Transactions" },
  };
  const mergedIntoCategoryId = row.merged_into_category_id
    ?? (typeof metadata.merged_into_category_id === "string" ? metadata.merged_into_category_id : "");

  return {
    ...style,
    activityLabel: labels[type].activity,
    description: typeof metadata.description === "string" ? metadata.description : row.description ?? "",
    id: row.id,
    isDefault: row.is_default,
    isSharedDefault: row.is_default && row.user_id === null,
    countLabel: labels[type].count,
    monthlyAverage: formatMmk(activityValue),
    mergedIntoCategoryId,
    mergedIntoCategoryName: categoryNames.get(mergedIntoCategoryId)
      ?? (typeof metadata.merged_into_category_name === "string" ? metadata.merged_into_category_name : ""),
    name: row.name,
    reportingRole: row.reporting_role === "salary" || metadata.reporting_role === "salary" ? "salary" : "",
    scopes,
    status: row.is_active ? "Active" : "Hidden",
    transactionCount,
    type,
  };
}

async function getCategoryRows(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  options: { limit?: number },
) {
  let enrichedQuery = supabase
    .from("categories")
    .select("id,user_id,name,type,category_type,reporting_role,icon,color,is_default,is_active,archived_at,merged_into_category_id,metadata")
    .eq("user_id", userId)
    .is("deleted_at", null)
    .order("is_default", { ascending: false })
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true });
  if (options.limit) enrichedQuery = enrichedQuery.limit(options.limit);

  const enrichedResult = await enrichedQuery;
  if (!enrichedResult.error) return enrichedResult.data as CategoryRow[];
  if (!isMissingDatabaseObject(enrichedResult.error, [
    "category_type",
    "reporting_role",
    "archived_at",
    "merged_into_category_id",
  ])) {
    throw new Error(enrichedResult.error.message);
  }

  let legacyQuery = supabase
    .from("categories")
    .select("id,user_id,name,type,icon,color,is_default,is_active,metadata")
    .eq("user_id", userId)
    .is("deleted_at", null)
    .order("is_default", { ascending: false })
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true });
  if (options.limit) legacyQuery = legacyQuery.limit(options.limit);
  const legacyResult = await legacyQuery;
  if (legacyResult.error) throw new Error(legacyResult.error.message);
  return legacyResult.data as CategoryRow[];
}

export async function getCategories(options: { dateFrom?: string; dateTo?: string; limit?: number } = {}) {
  const supabase = await createClient();
  const { user, error: userError } = await getUserSafely(supabase);
  if (userError || !user) throw new Error(userError ?? "You must be signed in to view categories.");

  const [categoryRows, transactionsResult, assetsResult, debtsResult, savingsGoalsResult, subscriptionsResult, accountsResult] = await Promise.all([
    getCategoryRows(supabase, user.id, options),
    supabase
      .from("transactions")
      .select("id,account_id,transfer_account_id,category_id,amount,transaction_date,type,status,metadata,related_entity_id,related_entity_type")
      .eq("user_id", user.id)
      .is("deleted_at", null),
    supabase
      .from("assets")
      .select("id,category_id,purchase_amount,purchase_date,created_at,metadata")
      .eq("user_id", user.id)
      .is("deleted_at", null),
    supabase
      .from("debts")
      .select("id,category_id,total_amount,repaid_amount,start_date,created_at,payment_account_id,type,metadata")
      .eq("user_id", user.id)
      .is("deleted_at", null),
    supabase
      .from("savings_goals")
      .select("category_id,target_amount,target_date,created_at,metadata")
      .eq("user_id", user.id)
      .is("deleted_at", null),
    supabase
      .from("subscriptions")
      .select("category_id,amount,billing_cycle,next_billing_date,created_at,status,metadata")
      .eq("user_id", user.id)
      .is("deleted_at", null),
    supabase
      .from("accounts")
      .select("id,type,initial_balance,metadata,created_at")
      .eq("user_id", user.id)
      .is("deleted_at", null),
  ]);

  if (transactionsResult.error) throw new Error(transactionsResult.error.message);
  if (assetsResult.error) throw new Error(assetsResult.error.message);
  if (debtsResult.error) throw new Error(debtsResult.error.message);
  if (savingsGoalsResult.error) throw new Error(savingsGoalsResult.error.message);
  if (subscriptionsResult.error) throw new Error(subscriptionsResult.error.message);
  if (accountsResult.error) throw new Error(accountsResult.error.message);

  const categoryNames = new Map(categoryRows.map((category) => [category.id, category.name]));
  const categoryIdByName = new Map(categoryRows.map((category) => [category.name.trim().toLowerCase(), category.id]));
  const debtRows = debtsResult.data as CategoryDebtRow[];
  const accountRows = accountsResult.data as CategoryAccountRow[];
  const transactionRows = (transactionsResult.data as CategoryTransactionRow[]).map((transaction) => ({
    ...transaction,
    metadata: deriveCreditCardDebtMetadata(transaction, debtRows, accountRows),
  }));
  const dateRange = { dateFrom: options.dateFrom, dateTo: options.dateTo };
  const activityByCategory = buildCategoryActivity(
    pageCategoryActivityRows({
      accounts: accountRows,
      assets: assetsResult.data,
      categoryIdByName,
      debts: debtRows,
      savingsGoals: savingsGoalsResult.data,
      subscriptions: subscriptionsResult.data,
      transactions: transactionRows,
    }),
  );
  const transactionActivityByCategory = buildCategoryActivity(
    transactionCategoryActivityRows(transactionRows, dateRange),
    dateRange,
  );
  for (const [categoryId, activity] of transactionActivityByCategory) {
    activityByCategory.set(categoryId, activity);
  }
  return categoryRows.map((category) => mapCategory(category, categoryNames, activityByCategory.get(category.id)));
}

export async function getCategory(categoryId: string) {
  const categories = await getCategories();
  return categories.find((category) => category.id === categoryId) ?? null;
}

export function getCategorySummaries(categories: CategoryRecord[]): SummaryMetric[] {
  const currentCategories = categories.filter((category) => !category.mergedIntoCategoryId);
  const activeCategories = currentCategories.filter((category) => category.status === "Active");

  return [
    { label: "Expense Categories", value: String(currentCategories.filter((category) => category.type === "Expense").length), icon: "trendingDown", tone: "text-[#b42318]", bg: "bg-[#fff1f0]" },
    { label: "Income Categories", value: String(currentCategories.filter((category) => category.type === "Income").length), icon: "trendingUp", tone: "text-[#047857]", bg: "bg-[#ecfdf5]" },
    { label: "Page Categories", value: String(currentCategories.filter((category) => category.type !== "Expense" && category.type !== "Income").length), icon: "category", tone: "text-[#0058be]", bg: "bg-[#eff6ff]" },
    { label: "Active Categories", value: String(activeCategories.length), icon: "category", tone: "text-[#4f46e5]", bg: "bg-[#eef2ff]" },
  ];
}
