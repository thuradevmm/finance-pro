"use server";

import { revalidatePath } from "next/cache";

import { getCategoryTypeStyle } from "@/lib/categories/category-style";
import { getScopesForCategoryType } from "@/lib/categories/category-scopes";
import type { CategoryFormData } from "@/lib/categories/supabase";
import { createClient } from "@/lib/supabase/server";
import { getUserSafely } from "@/lib/supabase/auth";

type ActionResult = { error?: string };

const relatedCategoryPaths = [
  "/categories", "/accounts", "/assets", "/budgets", "/debts",
  "/savings-goals", "/subscriptions", "/transactions", "/future-planning",
  "/dashboard", "/reports", "/scenario-budgeting",
];

function revalidateCategoryPaths() {
  for (const path of relatedCategoryPaths) revalidatePath(path);
}

async function authenticatedClient() {
  const supabase = await createClient();
  const { user, error } = await getUserSafely(supabase);
  if (error || !user) return { error: error ?? "You must be signed in.", supabase, user: null };
  return { error: null, supabase, user };
}

function categoryPayload(input: CategoryFormData, extraMetadata: Record<string, unknown> = {}) {
  const style = getCategoryTypeStyle(input.type);

  return {
    color: style.color,
    icon: style.icon,
    is_active: input.isActive,
    is_default: false,
    metadata: {
      category_type: input.type,
      description: input.description,
      scopes: input.scopes,
      ...extraMetadata,
    },
    name: input.name.trim(),
    type: input.type === "Income" ? "income" : "expense",
  };
}

function validateCategoryInput(input: CategoryFormData) {
  const allowedTypes = ["Expense", "Income", "Account", "Savings Goal", "Debt", "Subscription", "Asset"];
  if (!input.name.trim() || input.name.trim().length > 100) return "Enter a category name up to 100 characters.";
  if (input.description.length > 1_000) return "Keep the category description under 1,000 characters.";
  if (!allowedTypes.includes(input.type)) return "Choose a valid category type.";
  const expectedScopes = getScopesForCategoryType(input.type);
  if (input.scopes.length !== expectedScopes.length || expectedScopes.some((scope) => !input.scopes.includes(scope))) {
    return "Choose the valid scope for this category type.";
  }
  return "";
}

function storedCategoryDefinition(row: { metadata: unknown; type: string }) {
  const metadata = row.metadata && typeof row.metadata === "object" && !Array.isArray(row.metadata)
    ? row.metadata as Record<string, unknown>
    : {};
  const type = typeof metadata.category_type === "string"
    ? metadata.category_type
    : String(row.type).toLowerCase() === "income" ? "Income" : "Expense";
  const scopes = Array.isArray(metadata.scopes) ? metadata.scopes.map(String).sort() : getScopesForCategoryType(type as CategoryFormData["type"]).sort();
  return { scopes, type };
}

async function categoryIsUsed(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  categoryId: string,
) {
  const results = await Promise.all([
    supabase.from("transactions").select("id").eq("user_id", userId).eq("category_id", categoryId).limit(1),
    supabase.from("budget_items").select("id").eq("user_id", userId).eq("category_id", categoryId).limit(1),
    supabase.from("assets").select("id").eq("user_id", userId).eq("category_id", categoryId).limit(1),
    supabase.from("debts").select("id").eq("user_id", userId).eq("category_id", categoryId).limit(1),
    supabase.from("savings_goals").select("id").eq("user_id", userId).eq("category_id", categoryId).limit(1),
    supabase.from("subscriptions").select("id").eq("user_id", userId).eq("category_id", categoryId).limit(1),
    supabase.from("accounts").select("id").eq("user_id", userId).eq("metadata->>category_id", categoryId).is("deleted_at", null).limit(1),
  ]);
  const error = results.find((result) => result.error)?.error;
  return { error: error?.message ?? "", used: results.some((result) => (result.data?.length ?? 0) > 0) };
}

export async function createCategory(input: CategoryFormData): Promise<ActionResult> {
  const { error: authError, supabase, user } = await authenticatedClient();
  if (authError || !user) return { error: authError ?? "You must be signed in." };
  const validationError = validateCategoryInput(input);
  if (validationError) return { error: validationError };

  const { error } = await supabase.from("categories").insert({
    ...categoryPayload(input),
    is_default: false,
    user_id: user.id,
  });
  if (error) return { error: error.code === "23505" ? "A category with this name and type already exists." : error.message };

  revalidateCategoryPaths();
  return {};
}

export async function updateCategory(categoryId: string, input: CategoryFormData): Promise<ActionResult> {
  const { error: authError, supabase, user } = await authenticatedClient();
  if (authError || !user) return { error: authError ?? "You must be signed in." };
  const validationError = validateCategoryInput(input);
  if (validationError) return { error: validationError };

  const { data: target, error: targetError } = await supabase
    .from("categories")
    .select("id,user_id,type,metadata")
    .eq("id", categoryId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (targetError) return { error: targetError.message };
  if (!target) return { error: "Category not found." };
  const stored = storedCategoryDefinition(target);
  const definitionChanged = stored.type !== input.type
    || stored.scopes.join("\u0000") !== [...input.scopes].sort().join("\u0000");
  if (definitionChanged) {
    const usage = await categoryIsUsed(supabase, user.id, categoryId);
    if (usage.error) return { error: usage.error };
    if (usage.used) return { error: "This category is in use, so its type and scope cannot be changed." };
  }

  const { data, error } = await supabase
    .from("categories")
    .update(categoryPayload(input))
    .eq("id", categoryId)
    .eq("user_id", user.id)
    .select("id")
    .maybeSingle();
  if (error) return { error: error.code === "23505" ? "A category with this name and type already exists." : error.message };
  if (!data) return { error: "This category cannot be edited." };

  revalidateCategoryPaths();
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
  const usage = await categoryIsUsed(supabase, user.id, categoryId);
  if (usage.error) return { error: usage.error };
  if (usage.used) return { error: "This category is in use and cannot be deleted." };

  const { data, error } = await supabase
    .from("categories")
    .delete()
    .eq("id", categoryId)
    .eq("user_id", user.id)
    .select("id")
    .maybeSingle();
  if (error) return { error: error.code === "23503" ? "This category is in use and cannot be deleted." : error.message };
  if (!data) return { error: "Category not found." };

  revalidateCategoryPaths();
  return {};
}
