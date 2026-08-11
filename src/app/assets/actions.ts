"use server";

import { revalidatePath } from "next/cache";

import type { AssetFormData } from "@/lib/assets/supabase";
import { categoryRowSupports } from "@/lib/categories/category-scopes";
import { isValidCalendarDate } from "@/lib/date-validation";
import { getUserSafely } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/server";
import { isMissingDatabaseObject } from "@/lib/supabase/schema-compat";

type ActionResult = { error?: string; status?: "Active" | "Sold" };

type AssetLifecycleRow = {
  account_id?: string | null;
  archived_at?: string | null;
  category_id: string | null;
  current_value: number | null;
  deleted_at: string | null;
  id: string;
  is_active?: boolean | null;
  metadata: unknown;
  purchase_amount: number | null;
  status: string | null;
  transaction_id: string | null;
};

type AssetMutationPayload = ReturnType<typeof payload> | {
  archived_at?: string | null;
  deleted_at?: string | null;
  is_active?: boolean;
  metadata: Record<string, unknown>;
  status: string;
};

function revalidateAssetPaths(extraPaths: string[] = []) {
  for (const path of [
    "/assets",
    "/categories",
    "/dashboard",
    "/future-planning",
    "/notifications",
    "/transactions",
    ...extraPaths,
  ]) revalidatePath(path);
}

async function authenticatedClient() {
  const supabase = await createClient();
  const { user } = await getUserSafely(supabase);
  return { supabase, user };
}

function metadataRecord(metadata: unknown) {
  return metadata && typeof metadata === "object" && !Array.isArray(metadata)
    ? metadata as Record<string, unknown>
    : {};
}

function metadataTimestamp(metadata: Record<string, unknown>, key: string) {
  return typeof metadata[key] === "string" && metadata[key] ? metadata[key] : null;
}

function normalizedStatus(status: unknown) {
  return String(status ?? "").trim().toLowerCase();
}

async function getOwnedAsset(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  assetId: string,
) {
  let result = await supabase
    .from("assets")
    .select("id,account_id,category_id,current_value,purchase_amount,transaction_id,status,metadata,deleted_at,is_active,archived_at")
    .eq("id", assetId)
    .eq("user_id", userId)
    .maybeSingle();
  if (result.error && isMissingDatabaseObject(result.error, ["is_active", "archived_at"])) {
    result = await supabase
      .from("assets")
      .select("id,account_id,category_id,current_value,purchase_amount,transaction_id,status,metadata,deleted_at")
      .eq("id", assetId)
      .eq("user_id", userId)
      .maybeSingle();
  }
  return { data: result.data as AssetLifecycleRow | null, error: result.error };
}

function legacyAssetPayload<T extends AssetMutationPayload>(currentPayload: T) {
  const { archived_at, is_active, ...legacyPayload } = currentPayload;
  return {
    ...legacyPayload,
    metadata: {
      ...currentPayload.metadata,
      archived_at: archived_at ?? null,
      is_active: is_active ?? normalizedStatus(currentPayload.status) !== "archived",
    },
  };
}

async function insertAssetRow(
  supabase: Awaited<ReturnType<typeof createClient>>,
  currentPayload: ReturnType<typeof payload> & { user_id: string },
) {
  let result = await supabase.from("assets").insert(currentPayload);
  if (result.error && isMissingDatabaseObject(result.error, ["is_active", "archived_at"])) {
    result = await supabase.from("assets").insert(legacyAssetPayload(currentPayload));
  }
  return result;
}

async function updateAssetRow(
  supabase: Awaited<ReturnType<typeof createClient>>,
  assetId: string,
  userId: string,
  currentPayload: AssetMutationPayload,
) {
  let result = await supabase
    .from("assets")
    .update(currentPayload)
    .eq("id", assetId)
    .eq("user_id", userId)
    .is("deleted_at", null)
    .select("id")
    .maybeSingle();
  if (result.error && isMissingDatabaseObject(result.error, ["is_active", "archived_at"])) {
    result = await supabase
      .from("assets")
      .update(legacyAssetPayload(currentPayload))
      .eq("id", assetId)
      .eq("user_id", userId)
      .is("deleted_at", null)
      .select("id")
      .maybeSingle();
  }
  return result;
}

function validateAssetInput(input: AssetFormData) {
  if (!input.name.trim()) return "Asset name is required.";
  if (!(["Excellent", "Good", "Fair", "Needs Repair"] as string[]).includes(input.condition)) return "Choose a valid asset condition.";
  if (!(["Active", "Sold", "Archived"] as string[]).includes(input.status)) return "Choose a valid asset status.";
  if (!isValidCalendarDate(input.purchaseDate)) return "Enter a valid purchase date.";
  if (!isValidCalendarDate(input.startUsingDate)) return "Enter a valid start-using date.";
  if (input.startUsingDate < input.purchaseDate) return "Start-using date cannot be before the purchase date.";
  return "";
}

async function validateAssetCategory(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  categoryId: string,
  allowedExistingCategoryId = "",
) {
  if (!categoryId) return "Select an asset category.";
  let { data, error } = await supabase
    .from("categories")
    .select("id,is_active,type,category_type,metadata")
    .eq("id", categoryId)
    .eq("user_id", userId)
    .is("deleted_at", null)
    .maybeSingle();
  if (error && isMissingDatabaseObject(error, ["category_type"])) {
    ({ data, error } = await supabase
      .from("categories")
      .select("id,is_active,type,metadata")
      .eq("id", categoryId)
      .eq("user_id", userId)
      .is("deleted_at", null)
      .maybeSingle());
  }
  if (error) return error.message;
  if (!data || (data.is_active === false && data.id !== allowedExistingCategoryId) || !categoryRowSupports(data, "Assets", "Asset")) return "Select an active asset category.";
  return "";
}

function payload(
  input: AssetFormData,
  amounts: { currentValue: number; purchaseAmount: number },
  existing: { archivedAt?: string | null; metadata?: unknown } = {},
) {
  const isActive = input.status !== "Archived";
  const existingMetadata = metadataRecord(existing.metadata);
  const archivedAt = isActive
    ? null
    : existing.archivedAt ?? metadataTimestamp(existingMetadata, "archived_at") ?? new Date().toISOString();
  return {
    archived_at: archivedAt,
    category_id: input.categoryId || null,
    condition: input.condition,
    current_value: amounts.currentValue,
    description: input.note.trim() || null,
    is_active: isActive,
    metadata: {
      ...existingMetadata,
      archived_at: archivedAt,
      category_id: input.categoryId || null,
      condition: input.condition,
      current_value: amounts.currentValue,
      is_active: isActive,
      lifecycle_status: isActive ? "active" : "archived",
      note: input.note.trim(),
      purchase_amount: amounts.purchaseAmount,
      purchase_date: input.purchaseDate || null,
      serial_reference: input.serialReference.trim() || null,
      start_using_date: input.startUsingDate,
      status: input.status,
    },
    name: input.name.trim(),
    purchase_amount: amounts.purchaseAmount,
    purchase_date: input.purchaseDate || null,
    start_using_date: input.startUsingDate || null,
    status: input.status,
  };
}

export async function createAsset(input: AssetFormData): Promise<ActionResult> {
  const { supabase, user } = await authenticatedClient();
  if (!user) return { error: "You must be signed in." };
  const validationError = validateAssetInput(input);
  if (validationError) return { error: validationError };
  const categoryError = await validateAssetCategory(supabase, user.id, input.categoryId);
  if (categoryError) return { error: categoryError };
  const { error } = await insertAssetRow(supabase, { ...payload(input, { currentValue: 0, purchaseAmount: 0 }), user_id: user.id });
  if (error) return { error: error.message };
  revalidateAssetPaths();
  return {};
}

export async function updateAsset(assetId: string, input: AssetFormData): Promise<ActionResult> {
  const { supabase, user } = await authenticatedClient();
  if (!user) return { error: "You must be signed in." };
  const validationError = validateAssetInput(input);
  if (validationError) return { error: validationError };
  const { data: existingAsset, error: existingError } = await getOwnedAsset(supabase, user.id, assetId);
  if (existingError) return { error: existingError.message };
  if (!existingAsset || existingAsset.deleted_at) return { error: "Asset not found." };
  const categoryError = await validateAssetCategory(supabase, user.id, input.categoryId, existingAsset.category_id ?? "");
  if (categoryError) return { error: categoryError };
  const existingPurchaseAmount = Number(existingAsset.purchase_amount) || 0;
  const existingCurrentValue = Number(existingAsset.current_value) || existingPurchaseAmount;
  const { data, error } = await updateAssetRow(supabase, assetId, user.id, payload(input, {
    currentValue: existingCurrentValue,
    purchaseAmount: existingPurchaseAmount,
  }, {
    archivedAt: existingAsset.archived_at,
    metadata: existingAsset.metadata,
  }));
  if (error) return { error: error.message };
  if (!data) return { error: "Asset not found." };
  revalidateAssetPaths([`/assets/${assetId}/edit`]);
  return {};
}

export async function archiveAsset(assetId: string): Promise<ActionResult> {
  if (!assetId?.trim()) return { error: "Asset not found." };
  const { supabase, user } = await authenticatedClient();
  if (!user) return { error: "You must be signed in." };
  const { data: target, error: targetError } = await getOwnedAsset(supabase, user.id, assetId);
  if (targetError) return { error: targetError.message };
  if (!target || target.deleted_at) return { error: "Asset not found." };
  const isArchived = normalizedStatus(target.status) === "archived";
  if (isArchived && target.is_active !== true) return {};

  const metadata = metadataRecord(target.metadata);
  const archivedAt = target.archived_at ?? metadataTimestamp(metadata, "archived_at") ?? new Date().toISOString();
  const previousStatus = isArchived
    ? String(metadata.status_before_archive ?? "Active")
    : String(target.status || metadata.status || "Active");
  const { data, error } = await updateAssetRow(supabase, assetId, user.id, {
    archived_at: archivedAt,
    is_active: false,
    metadata: {
      ...metadata,
      archived_at: archivedAt,
      archive_reason: "user_requested",
      is_active: false,
      lifecycle_status: "archived",
      retirement_reason: "no_longer_tracked",
      status: "Archived",
      status_before_archive: previousStatus,
    },
    status: "Archived",
  });
  if (error) return { error: error.message };
  if (!data) return { error: "Asset not found." };
  revalidateAssetPaths([`/assets/${assetId}/edit`]);
  return {};
}

export async function restoreAsset(assetId: string): Promise<ActionResult> {
  if (!assetId?.trim()) return { error: "Asset not found." };
  const { supabase, user } = await authenticatedClient();
  if (!user) return { error: "You must be signed in." };
  const { data: target, error: targetError } = await getOwnedAsset(supabase, user.id, assetId);
  if (targetError) return { error: targetError.message };
  if (!target || target.deleted_at) return { error: "Asset not found." };
  if (normalizedStatus(target.status) !== "archived" && target.is_active !== false) return {};

  const metadata = metadataRecord(target.metadata);
  const [accountResult, categoryResult] = await Promise.all([
    target.account_id
      ? supabase.from("accounts").select("id,is_active").eq("id", target.account_id).eq("user_id", user.id).is("deleted_at", null).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    target.category_id
      ? supabase.from("categories").select("id,is_active").eq("id", target.category_id).eq("user_id", user.id).is("deleted_at", null).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ]);
  const dependencyError = accountResult.error ?? categoryResult.error;
  if (dependencyError) return { error: dependencyError.message };
  if (target.account_id && (!accountResult.data || accountResult.data.is_active === false)) {
    return { error: "Restore the asset's linked account before restoring this asset." };
  }
  if (target.category_id && (!categoryResult.data || categoryResult.data.is_active === false)) {
    return { error: "Restore the asset category before restoring this asset." };
  }
  const restoredAt = new Date().toISOString();
  const restoredStatus = normalizedStatus(metadata.status_before_archive) === "sold" ? "Sold" : "Active";
  const { data, error } = await updateAssetRow(supabase, assetId, user.id, {
    archived_at: null,
    is_active: true,
    metadata: {
      ...metadata,
      archived_at: null,
      is_active: true,
      lifecycle_status: "active",
      restored_at: restoredAt,
      status: restoredStatus,
    },
    status: restoredStatus,
  });
  if (error) return { error: error.message };
  if (!data) return { error: "Asset not found." };
  revalidateAssetPaths([`/assets/${assetId}/edit`]);
  return { status: restoredStatus };
}

export async function deleteAsset(assetId: string): Promise<ActionResult> {
  if (!assetId?.trim()) return { error: "Asset not found." };
  const { supabase, user } = await authenticatedClient();
  if (!user) return { error: "You must be signed in." };
  const { data: target, error: targetError } = await getOwnedAsset(supabase, user.id, assetId);
  if (targetError) return { error: targetError.message };
  if (!target) return { error: "Asset not found." };
  if (target.deleted_at) return {};

  const [transactionsResult, historyResult, filesResult] = await Promise.all([
    supabase.from("transactions").select("id").eq("user_id", user.id).ilike("related_entity_type", "asset").eq("related_entity_id", assetId).limit(1),
    supabase.from("asset_history_events").select("id").eq("user_id", user.id).eq("asset_id", assetId).limit(1),
    supabase.from("file_links").select("id").eq("user_id", user.id).ilike("entity_type", "asset").eq("entity_id", assetId).limit(1),
  ]);
  const historyError = transactionsResult.error ?? historyResult.error ?? filesResult.error;
  if (historyError) return { error: historyError.message };
  const hasHistory = Boolean(target.transaction_id)
    || (transactionsResult.data?.length ?? 0) > 0
    || (historyResult.data?.length ?? 0) > 0
    || (filesResult.data?.length ?? 0) > 0
    || [
      target.purchase_amount,
      target.current_value,
      metadataRecord(target.metadata).purchase_amount,
      metadataRecord(target.metadata).current_value,
    ].some((value) => Math.abs(Number(value) || 0) > 0.005);
  if (hasHistory) {
    return { error: "This asset has linked purchase history and cannot be deleted. Change its status to Archived so its transactions remain reconcilable." };
  }
  const metadata = metadataRecord(target.metadata);
  const deletedAt = new Date().toISOString();
  const archivedAt = target.archived_at ?? metadataTimestamp(metadata, "archived_at") ?? deletedAt;
  const { data, error } = await updateAssetRow(supabase, assetId, user.id, {
    archived_at: archivedAt,
    deleted_at: deletedAt,
    is_active: false,
    metadata: {
      ...metadata,
      archived_at: archivedAt,
      deleted_at: deletedAt,
      deletion_reason: "user_requested_unused_record",
      is_active: false,
      lifecycle_status: "deleted",
      status: "Archived",
    },
    status: "Archived",
  });
  if (error) return { error: error.message };
  if (!data) return { error: "Asset not found." };
  revalidateAssetPaths([`/assets/${assetId}/edit`]);
  return {};
}
