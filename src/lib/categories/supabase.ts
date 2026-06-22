import type { IconName } from "@/components/ui/icon";
import { formatMmk } from "@/lib/currency";
import { createClient } from "@/lib/supabase/server";
import { getUserSafely } from "@/lib/supabase/auth";
import type { CategoryScope, CategoryType, FinancialCategory, SummaryMetric } from "@/types/finance";

export type CategoryRecord = FinancialCategory & {
  color: string;
  isDefault: boolean;
  isSharedDefault: boolean;
};

export type CategoryFormData = {
  color: string;
  description: string;
  icon: IconName;
  isActive: boolean;
  isDefault: boolean;
  monthlyAverage: number;
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

const iconNames = new Set<IconName>([
  "account", "box", "category", "credit", "document", "food", "home", "medical",
  "plus", "savings", "settings", "shopping", "subscriptions", "target", "travel",
  "trendingDown", "trendingUp", "users",
]);

const colorStyles: Record<string, Pick<FinancialCategory, "bg" | "marker" | "tone">> = {
  Amber: { bg: "bg-[#fffbeb]", marker: "bg-[#92400e]", tone: "text-[#92400e]" },
  Blue: { bg: "bg-[#eff6ff]", marker: "bg-[#2170e4]", tone: "text-[#0058be]" },
  Gray: { bg: "bg-[#f8f9ff]", marker: "bg-[#76777d]", tone: "text-[#45464d]" },
  Green: { bg: "bg-[#ecfdf5]", marker: "bg-[#047857]", tone: "text-[#047857]" },
  Indigo: { bg: "bg-[#eef2ff]", marker: "bg-[#4f46e5]", tone: "text-[#4f46e5]" },
  Red: { bg: "bg-[#fff1f0]", marker: "bg-[#b42318]", tone: "text-[#b42318]" },
};

function metadataRecord(metadata: unknown) {
  return metadata && typeof metadata === "object" && !Array.isArray(metadata)
    ? metadata as Record<string, unknown>
    : {};
}

function mapCategory(row: CategoryRow): CategoryRecord {
  const metadata = metadataRecord(row.metadata);
  const scopes = Array.isArray(metadata.scopes)
    ? metadata.scopes.filter((scope): scope is CategoryScope => typeof scope === "string")
    : ["Transactions", "Reports"] as CategoryScope[];
  const monthlyAverage = typeof metadata.monthly_average === "number" ? metadata.monthly_average : 0;
  const transactionCount = typeof metadata.transaction_count === "number" ? metadata.transaction_count : 0;
  const color = row.color && colorStyles[row.color] ? row.color : "Blue";

  return {
    ...colorStyles[color],
    color,
    description: typeof metadata.description === "string" ? metadata.description : row.description ?? "",
    icon: row.icon && iconNames.has(row.icon as IconName) ? row.icon as IconName : "category",
    id: row.id,
    isDefault: row.is_default,
    isSharedDefault: row.is_default && row.user_id === null,
    monthlyAverage: formatMmk(monthlyAverage),
    name: row.name,
    scopes,
    status: row.is_active ? "Active" : "Hidden",
    transactionCount,
    type: row.type.toLowerCase() === "income" ? "Income" : "Expense",
  };
}

export async function getCategories() {
  const supabase = await createClient();
  const { user, error: userError } = await getUserSafely(supabase);
  if (userError || !user) throw new Error(userError ?? "You must be signed in to view categories.");

  const { data, error } = await supabase
    .from("categories")
    .select("id,user_id,name,type,icon,color,is_default,is_active,metadata")
    .eq("user_id", user.id)
    .is("deleted_at", null)
    .order("is_default", { ascending: false })
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true });

  if (error) throw new Error(error.message);

  const rows = data as CategoryRow[];
  const suppressedDefaults = new Set<string>();
  for (const row of rows) {
    if (row.user_id !== user.id) continue;
    const metadata = metadataRecord(row.metadata);
    if (typeof metadata.hidden_default_id === "string") suppressedDefaults.add(metadata.hidden_default_id);
    if (typeof metadata.source_default_id === "string") suppressedDefaults.add(metadata.source_default_id);
  }

  return rows
    .filter((row) => {
      const metadata = metadataRecord(row.metadata);
      if (typeof metadata.hidden_default_id === "string") return false;
      return !(row.user_id === null && suppressedDefaults.has(row.id));
    })
    .map(mapCategory);
}

export async function getCategory(categoryId: string) {
  const categories = await getCategories();
  return categories.find((category) => category.id === categoryId) ?? null;
}

export function getCategorySummaries(categories: CategoryRecord[]): SummaryMetric[] {
  const activeCategories = categories.filter((category) => category.status === "Active");
  const monthlyTracked = activeCategories.reduce(
    (total, category) => total + Number(category.monthlyAverage.replace(/[^0-9.-]+/g, "")),
    0,
  );

  return [
    { label: "Expense Categories", value: String(categories.filter((category) => category.type === "Expense").length), icon: "trendingDown", tone: "text-[#b42318]", bg: "bg-[#fff1f0]" },
    { label: "Income Categories", value: String(categories.filter((category) => category.type === "Income").length), icon: "trendingUp", tone: "text-[#047857]", bg: "bg-[#ecfdf5]" },
    { label: "Monthly Tracked", value: formatMmk(monthlyTracked), icon: "chart", tone: "text-[#0058be]", bg: "bg-[#eff6ff]" },
    { label: "Active Categories", value: String(activeCategories.length), icon: "category", tone: "text-[#4f46e5]", bg: "bg-[#eef2ff]" },
  ];
}
