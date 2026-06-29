import { formatMmk } from "@/lib/currency";
import { getCategoryTypeStyle } from "@/lib/categories/category-style";
import { createClient } from "@/lib/supabase/server";
import { getUserSafely } from "@/lib/supabase/auth";
import type { CategoryScope, CategoryType, FinancialCategory, SummaryMetric } from "@/types/finance";

export type CategoryRecord = FinancialCategory & {
  color: string;
  isDefault: boolean;
  isSharedDefault: boolean;
};

export type CategoryFormData = {
  description: string;
  isActive: boolean;
  isDefault: boolean;
  name: string;
  scopes: CategoryScope[];
  type: CategoryType;
};

type CategoryRow = {
  color: string | null;
  description?: string | null;
  icon: string | null;
  id: string;
  is_active: boolean;
  is_default: boolean;
  metadata: unknown;
  name: string;
  type: string;
  user_id: string | null;
};

type CategoryTransactionRow = {
  amount: number | string;
  category_id: string | null;
  status: string | null;
  transaction_date: string;
  type: string;
};

type CategoryAmountRow = {
  amount: number | string | null;
  category_id: string | null;
  date: string | null;
};

type CategoryActivity = {
  monthlyAverage: number;
  transactionCount: number;
};

function metadataRecord(metadata: unknown) {
  return metadata && typeof metadata === "object" && !Array.isArray(metadata)
    ? metadata as Record<string, unknown>
    : {};
}

function normalizeCategoryType(rowType: string, scopes: CategoryScope[], metadata: Record<string, unknown>): CategoryType {
  const metadataType = typeof metadata.category_type === "string" ? metadata.category_type : "";
  const normalizedType = (metadataType || rowType).toLowerCase().replace(/[_-]/g, " ");

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

function numericValue(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function monthKey(value: string) {
  return value.slice(0, 7);
}

function buildCategoryActivity(rows: CategoryAmountRow[]) {
  const monthlyTotalsByCategory = new Map<string, Map<string, number>>();
  const transactionCounts = new Map<string, number>();

  for (const row of rows) {
    if (!row.category_id || !row.date) continue;

    const categoryMonths = monthlyTotalsByCategory.get(row.category_id) ?? new Map<string, number>();
    const month = monthKey(row.date);
    categoryMonths.set(month, (categoryMonths.get(month) ?? 0) + numericValue(row.amount));
    monthlyTotalsByCategory.set(row.category_id, categoryMonths);
    transactionCounts.set(row.category_id, (transactionCounts.get(row.category_id) ?? 0) + 1);
  }

  const activityByCategory = new Map<string, CategoryActivity>();
  for (const [categoryId, monthlyTotals] of monthlyTotalsByCategory) {
    const total = Array.from(monthlyTotals.values()).reduce((sum, value) => sum + value, 0);
    activityByCategory.set(categoryId, {
      monthlyAverage: monthlyTotals.size === 0 ? 0 : total / monthlyTotals.size,
      transactionCount: transactionCounts.get(categoryId) ?? 0,
    });
  }

  return activityByCategory;
}

function transactionActivityRows(transactions: CategoryTransactionRow[]): CategoryAmountRow[] {
  return transactions.flatMap((transaction) => {
    if (String(transaction.status ?? "cleared").toLowerCase() === "scheduled") return [];
    const type = transaction.type.toLowerCase();
    if (type !== "income" && type !== "expense") return [];
    return [{
      amount: transaction.amount,
      category_id: transaction.category_id,
      date: transaction.transaction_date,
    }];
  });
}

function mapCategory(row: CategoryRow, activity?: CategoryActivity): CategoryRecord {
  const metadata = metadataRecord(row.metadata);
  const scopes = Array.isArray(metadata.scopes)
    ? metadata.scopes.filter((scope): scope is CategoryScope => typeof scope === "string")
    : ["Transactions", "Reports"] as CategoryScope[];
  const type = normalizeCategoryType(row.type, scopes, metadata);
  const style = getCategoryTypeStyle(type);
  const monthlyAverage = activity?.monthlyAverage ?? 0;
  const transactionCount = activity?.transactionCount ?? 0;

  return {
    ...style,
    description: typeof metadata.description === "string" ? metadata.description : row.description ?? "",
    id: row.id,
    isDefault: row.is_default,
    isSharedDefault: row.is_default && row.user_id === null,
    monthlyAverage: formatMmk(monthlyAverage),
    name: row.name,
    scopes,
    status: row.is_active ? "Active" : "Hidden",
    transactionCount,
    type,
  };
}

export async function getCategories(options: { limit?: number } = {}) {
  const supabase = await createClient();
  const { user, error: userError } = await getUserSafely(supabase);
  if (userError || !user) throw new Error(userError ?? "You must be signed in to view categories.");

  let categoriesQuery = supabase
    .from("categories")
    .select("id,user_id,name,type,icon,color,is_default,is_active,metadata")
    .eq("user_id", user.id)
    .is("deleted_at", null)
    .order("is_default", { ascending: false })
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true });

  if (options.limit) categoriesQuery = categoriesQuery.limit(options.limit);

  const [categoriesResult, transactionsResult, assetsResult, debtsResult, savingsGoalsResult, subscriptionsResult] = await Promise.all([
    categoriesQuery,
    supabase
      .from("transactions")
      .select("category_id,amount,transaction_date,type,status")
      .eq("user_id", user.id)
      .is("deleted_at", null),
    supabase
      .from("assets")
      .select("category_id,purchase_amount,purchase_date,created_at")
      .eq("user_id", user.id)
      .is("deleted_at", null),
    supabase
      .from("debts")
      .select("category_id,total_amount,start_date,created_at")
      .eq("user_id", user.id)
      .is("deleted_at", null),
    supabase
      .from("savings_goals")
      .select("category_id,target_amount,target_date,created_at")
      .eq("user_id", user.id)
      .is("deleted_at", null),
    supabase
      .from("subscriptions")
      .select("category_id,amount,next_billing_date,created_at")
      .eq("user_id", user.id)
      .is("deleted_at", null),
  ]);

  if (categoriesResult.error) throw new Error(categoriesResult.error.message);
  if (transactionsResult.error) throw new Error(transactionsResult.error.message);
  if (assetsResult.error) throw new Error(assetsResult.error.message);
  if (debtsResult.error) throw new Error(debtsResult.error.message);
  if (savingsGoalsResult.error) throw new Error(savingsGoalsResult.error.message);
  if (subscriptionsResult.error) throw new Error(subscriptionsResult.error.message);

  const categoryRows = categoriesResult.data as CategoryRow[];
  const activityRows = [
    ...transactionActivityRows(transactionsResult.data as CategoryTransactionRow[]),
    ...(assetsResult.data as Array<{ category_id: string | null; created_at: string | null; purchase_amount: number | string | null; purchase_date: string | null }>).map((asset) => ({ amount: asset.purchase_amount, category_id: asset.category_id, date: asset.purchase_date ?? asset.created_at })),
    ...(debtsResult.data as Array<{ category_id: string | null; created_at: string | null; start_date: string | null; total_amount: number | string | null }>).map((debt) => ({ amount: debt.total_amount, category_id: debt.category_id, date: debt.start_date ?? debt.created_at })),
    ...(savingsGoalsResult.data as Array<{ category_id: string | null; created_at: string | null; target_amount: number | string | null; target_date: string | null }>).map((goal) => ({ amount: goal.target_amount, category_id: goal.category_id, date: goal.target_date ?? goal.created_at })),
    ...(subscriptionsResult.data as Array<{ amount: number | string | null; category_id: string | null; created_at: string | null; next_billing_date: string | null }>).map((subscription) => ({ amount: subscription.amount, category_id: subscription.category_id, date: subscription.next_billing_date ?? subscription.created_at })),
  ];
  const activityByCategory = buildCategoryActivity(activityRows);
  return categoryRows.map((category) => mapCategory(category, activityByCategory.get(category.id)));
}

export async function getCategory(categoryId: string) {
  const categories = await getCategories();
  return categories.find((category) => category.id === categoryId) ?? null;
}

export function getCategorySummaries(categories: CategoryRecord[]): SummaryMetric[] {
  const activeCategories = categories.filter((category) => category.status === "Active");

  return [
    { label: "Expense Categories", value: String(categories.filter((category) => category.type === "Expense").length), icon: "trendingDown", tone: "text-[#b42318]", bg: "bg-[#fff1f0]" },
    { label: "Income Categories", value: String(categories.filter((category) => category.type === "Income").length), icon: "trendingUp", tone: "text-[#047857]", bg: "bg-[#ecfdf5]" },
    { label: "Page Categories", value: String(categories.filter((category) => category.type !== "Expense" && category.type !== "Income").length), icon: "category", tone: "text-[#0058be]", bg: "bg-[#eff6ff]" },
    { label: "Active Categories", value: String(activeCategories.length), icon: "category", tone: "text-[#4f46e5]", bg: "bg-[#eef2ff]" },
  ];
}
