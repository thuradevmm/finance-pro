"use server";

import { revalidatePath } from "next/cache";

import type { AssetFormData } from "@/lib/assets/supabase";
import { getUserSafely } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/server";

type ActionResult = { error?: string };

async function authenticatedClient() {
  const supabase = await createClient();
  const { user } = await getUserSafely(supabase);
  return { supabase, user };
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
  const { error } = await supabase.from("assets").insert({ ...payload(input), user_id: user.id });
  if (error) return { error: error.message };
  revalidatePath("/assets");
  return {};
}

export async function updateAsset(assetId: string, input: AssetFormData): Promise<ActionResult> {
  const { supabase, user } = await authenticatedClient();
  if (!user) return { error: "You must be signed in." };
  const { data, error } = await supabase.from("assets").update(payload(input)).eq("id", assetId).eq("user_id", user.id).select("id").maybeSingle();
  if (error) return { error: error.message };
  if (!data) return { error: "Asset not found." };
  revalidatePath("/assets");
  revalidatePath(`/assets/${assetId}/edit`);
  return {};
}

export async function deleteAsset(assetId: string): Promise<ActionResult> {
  const { supabase, user } = await authenticatedClient();
  if (!user) return { error: "You must be signed in." };
  const { data, error } = await supabase.from("assets").update({ deleted_at: new Date().toISOString(), status: "Archived" }).eq("id", assetId).eq("user_id", user.id).select("id").maybeSingle();
  if (error) return { error: error.message };
  if (!data) return { error: "Asset not found." };
  revalidatePath("/assets");
  return {};
}
