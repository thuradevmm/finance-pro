import type { SupabaseClient } from "@supabase/supabase-js";

import { formatMmk } from "@/lib/currency";
import type { CategoryRecord } from "@/lib/categories/supabase";
import type { AssetRecord, AssetStatus, SummaryMetric } from "@/types/finance";

export type AssetFormData = {
  categoryId: string;
  condition: AssetRecord["condition"];
  currentValue: number;
  name: string;
  note: string;
  purchaseAmount: number;
  purchaseDate: string;
  startUsingDate: string;
  status: AssetStatus;
};

export type AssetRecordWithValues = AssetRecord & {
  categoryId: string;
  currentValueValue: number;
  purchaseAmountValue: number;
};

type AssetRow = {
  category_id?: string | null;
  condition?: string | null;
  current_value?: number | string | null;
  description?: string | null;
  id: string;
  metadata?: unknown;
  name: string;
  purchase_amount?: number | string | null;
  purchase_date?: string | null;
  start_using_date?: string | null;
  status?: string | null;
};

type LinkedTransactionRow = {
  amount: number | string | null;
  related_entity_id: string | null;
};

function metadataRecord(metadata: unknown) {
  return metadata && typeof metadata === "object" && !Array.isArray(metadata) ? metadata as Record<string, unknown> : {};
}

function numericValue(value: unknown, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function normalizeCondition(value: unknown): AssetRecord["condition"] {
  if (value === "Excellent" || value === "Good" || value === "Fair" || value === "Needs Repair") return value;
  return "Good";
}

function normalizeStatus(value: unknown): AssetStatus {
  if (value === "Sold" || value === "Archived") return value;
  return "Active";
}

function mapAsset(row: AssetRow, categories: Map<string, CategoryRecord>, linkedPurchasesByAssetId: Map<string, number>): AssetRecordWithValues {
  const metadata = metadataRecord(row.metadata);
  const categoryId = row.category_id ?? (typeof metadata.category_id === "string" ? metadata.category_id : "");
  const category = categories.get(categoryId);
  const storedPurchaseAmount = numericValue(row.purchase_amount) || numericValue(metadata.purchase_amount);
  const purchaseAmountValue = storedPurchaseAmount || (linkedPurchasesByAssetId.get(row.id) ?? 0);
  const currentValueValue = numericValue(row.current_value) || numericValue(metadata.current_value, purchaseAmountValue);
  const purchaseDate = row.purchase_date ?? (typeof metadata.purchase_date === "string" ? metadata.purchase_date : "");
  const startUsingDate = row.start_using_date ?? (typeof metadata.start_using_date === "string" ? metadata.start_using_date : purchaseDate);

  return {
    bg: category?.bg ?? "bg-[#eff6ff]",
    category: category?.name ?? "Uncategorized",
    categoryId,
    condition: normalizeCondition(row.condition ?? metadata.condition),
    currentValue: formatMmk(currentValueValue),
    currentValueValue,
    icon: category?.icon ?? "box",
    id: row.id,
    name: row.name,
    note: row.description ?? (typeof metadata.note === "string" ? metadata.note : ""),
    purchaseAmount: formatMmk(purchaseAmountValue),
    purchaseAmountValue,
    purchaseDate,
    startUsingDate,
    status: normalizeStatus(row.status ?? metadata.status),
    tone: category?.tone ?? "text-[#0058be]",
    usageDuration: "",
  };
}

export async function getAssets(supabase: SupabaseClient, userId: string, categories: CategoryRecord[]) {
  const [assetsResult, transactionsResult] = await Promise.all([
    supabase.from("assets").select("*").eq("user_id", userId).is("deleted_at", null).order("created_at", { ascending: false }),
    supabase.from("transactions").select("related_entity_id,amount").eq("user_id", userId).eq("related_entity_type", "asset").is("deleted_at", null),
  ]);
  if (assetsResult.error) throw new Error(assetsResult.error.message);
  if (transactionsResult.error) throw new Error(transactionsResult.error.message);
  const categoriesById = new Map(categories.map((category) => [category.id, category]));
  const linkedPurchasesByAssetId = new Map<string, number>();
  for (const transaction of transactionsResult.data as LinkedTransactionRow[]) {
    if (!transaction.related_entity_id) continue;
    linkedPurchasesByAssetId.set(
      transaction.related_entity_id,
      (linkedPurchasesByAssetId.get(transaction.related_entity_id) ?? 0) + Math.abs(numericValue(transaction.amount)),
    );
  }
  return (assetsResult.data as AssetRow[]).map((row) => mapAsset(row, categoriesById, linkedPurchasesByAssetId));
}

export async function getAsset(supabase: SupabaseClient, userId: string, assetId: string, categories: CategoryRecord[]) {
  const assets = await getAssets(supabase, userId, categories);
  return assets.find((asset) => asset.id === assetId) ?? null;
}

export function getAssetSummaries(assets: AssetRecordWithValues[]): SummaryMetric[] {
  const purchaseValue = assets.reduce((sum, asset) => sum + asset.purchaseAmountValue, 0);
  const currentValue = assets.reduce((sum, asset) => sum + asset.currentValueValue, 0);
  return [
    { label: "Purchase Value", value: formatMmk(purchaseValue), icon: "box", tone: "text-[#0b1c30]", bg: "bg-[#eff6ff]" },
    { label: "Current Value", value: formatMmk(currentValue), icon: "trendingUp", tone: "text-[#0058be]", bg: "bg-[#eff6ff]" },
    { label: "Active Assets", value: String(assets.filter((asset) => asset.status === "Active").length), icon: "dashboard", tone: "text-[#047857]", bg: "bg-[#ecfdf5]" },
    { label: "Archived/Sold", value: String(assets.filter((asset) => asset.status !== "Active").length), icon: "timeline", tone: "text-[#4f46e5]", bg: "bg-[#eef2ff]" },
  ];
}
