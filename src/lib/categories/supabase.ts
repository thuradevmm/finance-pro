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
import { convertToBaseCurrency } from "@/lib/currency-conversion";
import { getCurrencySettings } from "@/lib/currency-settings";
import { calculateLinkedSavingsAmounts, type SavingsGoalEntryInput } from "@/lib/savings-goals/calculations";
import { isMissingDatabaseObject } from "@/lib/supabase/schema-compat";
import type { CategoryFinancialRole, CategoryLevel, CategoryScope, CategoryType, FinancialCategory, SummaryMetric } from "@/types/finance";

export type CategoryRecord = FinancialCategory & {
  activityLabel: string;
  color: string;
  countLabel: string;
  isDefault: boolean;
  isSharedDefault: boolean;
};

export type CategoryFormData = {
  childCategoryIds: string[];
  description: string;
  financialRole: CategoryFinancialRole;
  isActive: boolean;
  isDefault: boolean;
  level: CategoryLevel;
  name: string;
  parentId: string;
  reportingRole: "" | "salary";
  scopes: CategoryScope[];
  type: CategoryType;
};

type CategoryRow = {
  archived_at?: string | null;
  category_level?: string | null;
  category_type?: string | null;
  color: string | null;
  description?: string | null;
  icon: string | null;
  id: string;
  financial_role?: string | null;
  is_active: boolean;
  is_default: boolean;
  metadata: unknown;
  merged_into_category_id?: string | null;
  name: string;
  parent_id?: string | null;
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
  currency_code: string | null;
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
  const supportedScopes = new Set<CategoryScope>(["Accounts", "Assets", "Debts", "Savings Goals", "Subscriptions", "Transactions"]);
  const scopes = Array.isArray(metadata.scopes)
    ? metadata.scopes.filter((scope): scope is CategoryScope => typeof scope === "string" && supportedScopes.has(scope as CategoryScope))
    : ["Transactions"] as CategoryScope[];
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

  const level: CategoryLevel = row.category_level === "super" || metadata.category_level === "super" ? "Super" : "Subcategory";
  const supportedFinancialRoles = new Set<CategoryFinancialRole>(["essential", "debt_obligation", "emergency_reserve", "savings", "discretionary", "income", "other"]);
  const storedFinancialRole = row.financial_role ?? metadata.financial_role;
  const financialRole = typeof storedFinancialRole === "string" && supportedFinancialRoles.has(storedFinancialRole as CategoryFinancialRole)
    ? storedFinancialRole as CategoryFinancialRole
    : "";
  const parentId = row.parent_id ?? (typeof metadata.parent_id === "string" ? metadata.parent_id : "");

  return {
    ...style,
    activityLabel: labels[type].activity,
    description: typeof metadata.description === "string" ? metadata.description : row.description ?? "",
    financialRole,
    id: row.id,
    isDefault: row.is_default,
    isSharedDefault: row.is_default && row.user_id === null,
    level,
    countLabel: labels[type].count,
    monthlyAverage: formatMmk(activityValue),
    mergedIntoCategoryId,
    mergedIntoCategoryName: categoryNames.get(mergedIntoCategoryId)
      ?? (typeof metadata.merged_into_category_name === "string" ? metadata.merged_into_category_name : ""),
    name: row.name,
    parentId,
    parentName: categoryNames.get(parentId) ?? "",
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
    .select("id,user_id,name,type,category_type,category_level,financial_role,parent_id,reporting_role,icon,color,is_default,is_active,archived_at,merged_into_category_id,metadata")
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
    "category_level",
    "financial_role",
    "reporting_role",
    "archived_at",
    "merged_into_category_id",
  ])) {
    throw new Error(enrichedResult.error.message);
  }

  let legacyQuery = supabase
    .from("categories")
    .select("id,user_id,name,type,parent_id,icon,color,is_default,is_active,metadata")
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

  const [categoryRows, transactionsResult, assetsResult, debtsResult, savingsGoalsResult, savingsEntriesResult, subscriptionsResult, accountsResult, currencySettings] = await Promise.all([
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
      .select("id,account_id,category_id,target_amount,target_date,goal_type,current_amount,initial_saved_amount,saved_amount,created_at,metadata")
      .eq("user_id", user.id)
      .is("deleted_at", null),
    supabase
      .from("savings_goal_entries")
      .select("savings_goal_id,transaction_id,amount,type")
      .eq("user_id", user.id),
    supabase
      .from("subscriptions")
      .select("category_id,amount,billing_cycle,next_billing_date,created_at,status,metadata")
      .eq("user_id", user.id)
      .is("deleted_at", null),
    supabase
      .from("accounts")
      .select("id,type,currency_code,initial_balance,metadata,created_at")
      .eq("user_id", user.id)
      .is("deleted_at", null),
    getCurrencySettings(supabase, user.id),
  ]);

  if (transactionsResult.error) throw new Error(transactionsResult.error.message);
  if (assetsResult.error) throw new Error(assetsResult.error.message);
  if (debtsResult.error) throw new Error(debtsResult.error.message);
  if (savingsGoalsResult.error) throw new Error(savingsGoalsResult.error.message);
  if (savingsEntriesResult.error) throw new Error(savingsEntriesResult.error.message);
  if (subscriptionsResult.error) throw new Error(subscriptionsResult.error.message);
  if (accountsResult.error) throw new Error(accountsResult.error.message);

  const categoryNames = new Map(categoryRows.map((category) => [category.id, category.name]));
  const categoryIdByName = new Map(categoryRows.map((category) => [category.name.trim().toLowerCase(), category.id]));
  const debtRows = debtsResult.data as CategoryDebtRow[];
  const accountRows = accountsResult.data as CategoryAccountRow[];
  const currencyByAccountId = new Map(accountRows.map((account) => [account.id, account.currency_code]));
  const transactionRows = (transactionsResult.data as CategoryTransactionRow[]).map((transaction) => ({
    ...transaction,
    metadata: deriveCreditCardDebtMetadata(transaction, debtRows, accountRows),
  }));
  const baseTransactionRows = transactionRows.map((transaction) => ({
    ...transaction,
    amount: convertToBaseCurrency(
      Math.abs(Number(transaction.amount) || 0),
      currencyByAccountId.get(transaction.account_id ?? ""),
      currencySettings,
      transaction.transaction_date,
    ) ?? 0,
  }));
  const savingsGoalRows = savingsGoalsResult.data ?? [];
  const goalAccountById = new Map(savingsGoalRows.map((goal) => {
    const metadata = metadataRecord(goal.metadata);
    return [goal.id, goal.account_id ?? (typeof metadata.account_id === "string" ? metadata.account_id : "")];
  }));
  const linkedSavings = calculateLinkedSavingsAmounts(
    savingsEntriesResult.data as SavingsGoalEntryInput[],
    baseTransactionRows,
    goalAccountById,
  ).progressByGoalId;
  const dateRange = { dateFrom: options.dateFrom, dateTo: options.dateTo };
  const activityByCategory = buildCategoryActivity(
    pageCategoryActivityRows({
      accounts: accountRows,
      assets: assetsResult.data,
      baseTransactions: baseTransactionRows,
      categoryIdByName,
      debts: debtRows,
      savingsGoals: savingsGoalRows.map((goal) => ({ ...goal, linked_saved_amount: linkedSavings.get(goal.id) ?? 0 })),
      subscriptions: subscriptionsResult.data,
      transactions: transactionRows,
    }),
  );
  const transactionActivityByCategory = buildCategoryActivity(
    transactionCategoryActivityRows(baseTransactionRows, dateRange),
    dateRange,
  );
  for (const [categoryId, activity] of transactionActivityByCategory) {
    activityByCategory.set(categoryId, activity);
  }
  for (const category of categoryRows) {
    const metadata = metadataRecord(category.metadata);
    const parentId = category.parent_id ?? (typeof metadata.parent_id === "string" ? metadata.parent_id : "");
    if (!parentId) continue;
    const childActivity = activityByCategory.get(category.id);
    if (!childActivity) continue;
    const parentActivity = activityByCategory.get(parentId) ?? { monthlyAverage: 0, total: 0, transactionCount: 0 };
    activityByCategory.set(parentId, {
      monthlyAverage: parentActivity.monthlyAverage + childActivity.monthlyAverage,
      total: parentActivity.total + childActivity.total,
      transactionCount: parentActivity.transactionCount + childActivity.transactionCount,
    });
  }
  return categoryRows.map((category) => mapCategory(category, categoryNames, activityByCategory.get(category.id)));
}

export async function getCategory(categoryId: string) {
  const categories = await getCategories();
  return categories.find((category) => category.id === categoryId) ?? null;
}

export function getCategorySummaries(categories: CategoryRecord[]): SummaryMetric[] {
  const currentCategories = categories.filter((category) => !category.mergedIntoCategoryId);
  const superCategories = currentCategories.filter((category) => category.level === "Super");
  const subcategories = currentCategories.filter((category) => category.level === "Subcategory");
  const linkedSubcategories = subcategories.filter((category) => category.parentId);
  const activeCategories = currentCategories.filter((category) => category.status === "Active");

  return [
    { label: "Super Categories", value: String(superCategories.length), icon: "category", tone: "text-[#075985]", bg: "bg-[#e0f2fe]" },
    { label: "Subcategories", value: String(subcategories.length), icon: "category", tone: "text-[#0058be]", bg: "bg-[#eff6ff]" },
    { label: "Linked Subcategories", value: String(linkedSubcategories.length), icon: "sync", tone: "text-[#047857]", bg: "bg-[#ecfdf5]" },
    { label: "Active Categories", value: String(activeCategories.length), icon: "category", tone: "text-[#4f46e5]", bg: "bg-[#eef2ff]" },
  ];
}
