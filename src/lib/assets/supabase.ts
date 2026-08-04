import type { SupabaseClient } from "@supabase/supabase-js";

import { resolveAssetCurrentValue, resolveAssetPurchaseValue } from "@/lib/assets/calculations";
import { formatMmk } from "@/lib/currency";
import { exchangeRateFor } from "@/lib/currency-conversion";
import { getCurrencySettings } from "@/lib/currency-settings";
import { combineDateWithTimestampTime, dateTimeSortValue, formatDisplayDate } from "@/lib/date-format";
import type { CategoryRecord } from "@/lib/categories/supabase";
import { linkedExpenseContributionDelta, roundCurrencyValue } from "@/lib/ledger";
import type { AssetRecord, AssetStatus, SummaryMetric } from "@/types/finance";

export type AssetFormData = {
  categoryId: string;
  condition: AssetRecord["condition"];
  name: string;
  note: string;
  purchaseDate: string;
  serialReference: string;
  startUsingDate: string;
  status: AssetStatus;
};

export type AssetRecordWithValues = AssetRecord & {
  categoryId: string;
  createdAtValue: string;
  currentValueValue: number;
  purchaseAmountValue: number;
  purchaseDateTimeValue: string;
  purchaseDateValue: string;
  serialReference: string;
  startUsingDateTimeValue: string;
  startUsingDateValue: string;
};

type AssetRow = {
  category_id?: string | null;
  condition?: string | null;
  created_at?: string | null;
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
  account_id: string | null;
  amount: number | string | null;
  id: string;
  metadata: unknown;
  related_entity_id: string | null;
  status: string | null;
  transaction_date: string | null;
  type: string | null;
};

type AssetAccountCurrencyRow = {
  currency_code: string | null;
  id: string;
};

function metadataRecord(metadata: unknown) {
  return metadata && typeof metadata === "object" && !Array.isArray(metadata) ? metadata as Record<string, unknown> : {};
}

function normalizeCondition(value: unknown): AssetRecord["condition"] {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (normalized === "excellent") return "Excellent";
  if (normalized === "fair") return "Fair";
  if (normalized === "needs repair" || normalized === "needs_repair") return "Needs Repair";
  return "Good";
}

function normalizeStatus(value: unknown): AssetStatus {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (normalized === "sold") return "Sold";
  if (normalized === "archived") return "Archived";
  return "Active";
}

function mapAsset(row: AssetRow, categories: Map<string, CategoryRecord>, linkedPurchasesByAssetId: Map<string, number>): AssetRecordWithValues {
  const metadata = metadataRecord(row.metadata);
  const categoryId = row.category_id ?? (typeof metadata.category_id === "string" ? metadata.category_id : "");
  const category = categories.get(categoryId);
  // Posted linked transactions are the source of truth. Stored amounts remain
  // only as a compatibility fallback for assets that have no linked purchase.
  const purchaseAmountValue = resolveAssetPurchaseValue(
    row.purchase_amount,
    metadata.purchase_amount,
    linkedPurchasesByAssetId.get(row.id),
  );
  const currentValueValue = resolveAssetCurrentValue(row.current_value, metadata.current_value, purchaseAmountValue);
  const purchaseDateValue = row.purchase_date ?? (typeof metadata.purchase_date === "string" ? metadata.purchase_date : "");
  const startUsingDateValue = row.start_using_date ?? (typeof metadata.start_using_date === "string" ? metadata.start_using_date : purchaseDateValue);

  return {
    bg: category?.bg ?? "bg-[#eff6ff]",
    category: category?.name ?? "Uncategorized",
    categoryId,
    condition: normalizeCondition(row.condition ?? metadata.condition),
    createdAtValue: row.created_at ?? "",
    currentValue: formatMmk(currentValueValue),
    currentValueValue,
    icon: category?.icon ?? "box",
    id: row.id,
    name: row.name,
    note: row.description ?? (typeof metadata.note === "string" ? metadata.note : ""),
    purchaseAmount: formatMmk(purchaseAmountValue),
    purchaseAmountValue,
    purchaseDate: formatDisplayDate(purchaseDateValue, ""),
    purchaseDateTimeValue: combineDateWithTimestampTime(purchaseDateValue, row.created_at),
    purchaseDateValue,
    serialReference: typeof metadata.serial_reference === "string" ? metadata.serial_reference : "",
    startUsingDate: formatDisplayDate(startUsingDateValue, ""),
    startUsingDateTimeValue: combineDateWithTimestampTime(startUsingDateValue, row.created_at),
    startUsingDateValue,
    status: normalizeStatus(row.status ?? metadata.status),
    tone: category?.tone ?? "text-[#0058be]",
    usageDuration: "",
  };
}

export async function getAssets(supabase: SupabaseClient, userId: string, categories: CategoryRecord[], options: { limit?: number } = {}) {
  let assetsQuery = supabase.from("assets").select("*").eq("user_id", userId).is("deleted_at", null).order("created_at", { ascending: false });
  if (options.limit) assetsQuery = assetsQuery.limit(options.limit);

  const [assetsResult, transactionsResult, accountsResult, currencySettings] = await Promise.all([
    assetsQuery,
    supabase.from("transactions").select("id,account_id,related_entity_id,type,amount,status,transaction_date,metadata").eq("user_id", userId).eq("related_entity_type", "asset").is("deleted_at", null),
    supabase.from("accounts").select("id,currency_code").eq("user_id", userId).is("deleted_at", null),
    getCurrencySettings(supabase, userId),
  ]);
  if (assetsResult.error) throw new Error(assetsResult.error.message);
  if (transactionsResult.error) throw new Error(transactionsResult.error.message);
  if (accountsResult.error) throw new Error(accountsResult.error.message);
  const categoriesById = new Map(categories.map((category) => [category.id, category]));
  const accountCurrencies = new Map((accountsResult.data as AssetAccountCurrencyRow[]).map((account) => [account.id, account.currency_code]));
  const linkedPurchasesByAssetId = new Map<string, number>();
  for (const transaction of transactionsResult.data as LinkedTransactionRow[]) {
    if (!transaction.related_entity_id) continue;
    const contribution = linkedExpenseContributionDelta(transaction);
    const rate = exchangeRateFor(currencySettings, accountCurrencies.get(transaction.account_id ?? ""), transaction.transaction_date ?? undefined);
    linkedPurchasesByAssetId.set(
      transaction.related_entity_id,
      roundCurrencyValue(
        (linkedPurchasesByAssetId.get(transaction.related_entity_id) ?? 0)
        + (contribution * (rate ?? 1)),
      ),
    );
  }
  return (assetsResult.data as AssetRow[])
    .map((row) => mapAsset(row, categoriesById, linkedPurchasesByAssetId))
    .sort((first, second) => dateTimeSortValue(second.purchaseDateTimeValue) - dateTimeSortValue(first.purchaseDateTimeValue));
}

export async function getAsset(supabase: SupabaseClient, userId: string, assetId: string, categories: CategoryRecord[]) {
  const assets = await getAssets(supabase, userId, categories);
  return assets.find((asset) => asset.id === assetId) ?? null;
}

export function getAssetSummaries(assets: AssetRecordWithValues[]): SummaryMetric[] {
  const currentValue = assets
    .filter((asset) => asset.status === "Active")
    .reduce((sum, asset) => sum + asset.currentValueValue, 0);
  return [
    { label: "Transaction-Backed Asset Value", value: formatMmk(currentValue), icon: "trendingUp", tone: "text-[#0058be]", bg: "bg-[#eff6ff]" },
    { label: "Active Assets", value: String(assets.filter((asset) => asset.status === "Active").length), icon: "dashboard", tone: "text-[#047857]", bg: "bg-[#ecfdf5]" },
    { label: "Needs Attention", value: String(assets.filter((asset) => asset.status === "Active" && asset.condition === "Needs Repair").length), icon: "bell", tone: "text-[#b42318]", bg: "bg-[#fff1f0]" },
  ];
}
