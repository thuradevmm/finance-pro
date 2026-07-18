"use server";

import { revalidatePath } from "next/cache";

import type { AssetFormData } from "@/lib/assets/supabase";
import { categoryRowSupports } from "@/lib/categories/category-scopes";
import { isValidCalendarDate } from "@/lib/date-validation";
import { getUserSafely } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/server";

type ActionResult = { error?: string };

function revalidateAssetPaths() {
  for (const path of ["/assets", "/categories", "/dashboard", "/reports", "/future-planning", "/scenario-budgeting"]) revalidatePath(path);
}

async function authenticatedClient() {
  const supabase = await createClient();
  const { user } = await getUserSafely(supabase);
  return { supabase, user };
}

function validateAssetInput(input: AssetFormData) {
  if (!input.name.trim()) return "Asset name is required.";
  if (!(["Excellent", "Good", "Fair", "Needs Repair"] as string[]).includes(input.condition)) return "Choose a valid asset condition.";
  if (!(["Active", "Sold", "Archived"] as string[]).includes(input.status)) return "Choose a valid asset status.";
  if (!Number.isFinite(input.purchaseAmount) || input.purchaseAmount < 0) return "Purchase amount cannot be negative.";
  if (!Number.isFinite(input.currentValue) || input.currentValue < 0) return "Current value cannot be negative.";
  if (!isValidCalendarDate(input.purchaseDate)) return "Enter a valid purchase date.";
  if (!isValidCalendarDate(input.startUsingDate)) return "Enter a valid start-using date.";
  if (input.startUsingDate < input.purchaseDate) return "Start-using date cannot be before the purchase date.";
  return "";
}

async function validateAssetCategory(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  categoryId: string,
) {
  if (!categoryId) return "Select an asset category.";
  const { data, error } = await supabase
    .from("categories")
    .select("id,is_active,type,metadata")
    .eq("id", categoryId)
    .eq("user_id", userId)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) return error.message;
  if (!data || data.is_active === false || !categoryRowSupports(data, "Assets", "Asset")) return "Select an active asset category.";
  return "";
}

function payload(input: AssetFormData) {
  return {
    category_id: input.categoryId || null,
    condition: input.condition,
    current_value: input.currentValue,
    description: input.note.trim() || null,
    metadata: {
      category_id: input.categoryId || null,
      condition: input.condition,
      current_value: input.currentValue,
      note: input.note.trim(),
      purchase_amount: input.purchaseAmount,
      purchase_date: input.purchaseDate || null,
      serial_reference: input.serialReference.trim() || null,
      start_using_date: input.startUsingDate,
      status: input.status,
    },
    name: input.name.trim(),
    purchase_amount: input.purchaseAmount,
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
  const { error } = await supabase.from("assets").insert({ ...payload(input), user_id: user.id });
  if (error) return { error: error.message };
  revalidateAssetPaths();
  return {};
}

export async function updateAsset(assetId: string, input: AssetFormData): Promise<ActionResult> {
  const { supabase, user } = await authenticatedClient();
  if (!user) return { error: "You must be signed in." };
  const validationError = validateAssetInput(input);
  if (validationError) return { error: validationError };
  const categoryError = await validateAssetCategory(supabase, user.id, input.categoryId);
  if (categoryError) return { error: categoryError };
  const { data, error } = await supabase.from("assets").update(payload(input)).eq("id", assetId).eq("user_id", user.id).select("id").maybeSingle();
  if (error) return { error: error.message };
  if (!data) return { error: "Asset not found." };
  revalidateAssetPaths();
  revalidatePath(`/assets/${assetId}/edit`);
  return {};
}

export async function deleteAsset(assetId: string): Promise<ActionResult> {
  const { supabase, user } = await authenticatedClient();
  if (!user) return { error: "You must be signed in." };
  const { data, error } = await supabase.from("assets").update({ deleted_at: new Date().toISOString(), status: "Archived" }).eq("id", assetId).eq("user_id", user.id).select("id").maybeSingle();
  if (error) return { error: error.message };
  if (!data) return { error: "Asset not found." };
  revalidateAssetPaths();
  return {};
}
