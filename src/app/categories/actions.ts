"use server";

import { revalidatePath } from "next/cache";

import type { CategoryFormData } from "@/lib/categories/supabase";
import { createClient } from "@/lib/supabase/server";
import { getUserSafely } from "@/lib/supabase/auth";

type ActionResult = { error?: string };

async function authenticatedClient() {
  const supabase = await createClient();
  const { user, error } = await getUserSafely(supabase);
  if (error || !user) return { error: error ?? "You must be signed in.", supabase, user: null };
  return { error: null, supabase, user };
}

function categoryPayload(input: CategoryFormData, extraMetadata: Record<string, unknown> = {}) {
  return {
    color: input.color,
    icon: input.icon,
    is_active: input.isActive,
    is_default: false,
    metadata: {
      category_type: input.type,
      description: input.description,
      monthly_average: input.monthlyAverage,
      scopes: input.scopes,
      ...extraMetadata,
    },
    name: input.name.trim(),
    type: input.type === "Income" ? "income" : "expense",
  };
}

export async function createCategory(input: CategoryFormData): Promise<ActionResult> {
  const { error: authError, supabase, user } = await authenticatedClient();
  if (authError || !user) return { error: authError ?? "You must be signed in." };

  const { error } = await supabase.from("categories").insert({
    ...categoryPayload(input),
    is_default: false,
    user_id: user.id,
  });
  if (error) return { error: error.code === "23505" ? "A category with this name and type already exists." : error.message };

  revalidatePath("/categories");
  return {};
}

export async function updateCategory(categoryId: string, input: CategoryFormData): Promise<ActionResult> {
  const { error: authError, supabase, user } = await authenticatedClient();
  if (authError || !user) return { error: authError ?? "You must be signed in." };

  const { data: target, error: targetError } = await supabase
    .from("categories")
    .select("id,user_id")
    .eq("id", categoryId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (targetError) return { error: targetError.message };
  if (!target) return { error: "Category not found." };

  const { data, error } = await supabase
    .from("categories")
    .update(categoryPayload(input))
    .eq("id", categoryId)
    .eq("user_id", user.id)
    .select("id")
    .maybeSingle();
  if (error) return { error: error.code === "23505" ? "A category with this name and type already exists." : error.message };
  if (!data) return { error: "This category cannot be edited." };

  revalidatePath("/categories");
  revalidatePath(`/categories/${categoryId}/edit`);
  return {};
}

export async function deleteCategory(categoryId: string): Promise<ActionResult> {
  const { error: authError, supabase, user } = await authenticatedClient();
  if (authError || !user) return { error: authError ?? "You must be signed in." };

  const { data: target, error: targetError } = await supabase
    .from("categories")
    .select("id,user_id")
    .eq("id", categoryId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (targetError) return { error: targetError.message };
  if (!target) return { error: "Category not found." };

  const { data, error } = await supabase
    .from("categories")
    .delete()
    .eq("id", categoryId)
    .eq("user_id", user.id)
    .select("id")
    .maybeSingle();
  if (error) return { error: error.code === "23503" ? "This category is in use and cannot be deleted." : error.message };
  if (!data) return { error: "Category not found." };

  revalidatePath("/categories");
  return {};
}
