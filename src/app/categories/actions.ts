"use server";

import { revalidatePath } from "next/cache";

import { getCategoryTypeStyle } from "@/lib/categories/category-style";
import { getScopesForCategoryType } from "@/lib/categories/category-scopes";
import type { CategoryFormData } from "@/lib/categories/supabase";
import { createClient } from "@/lib/supabase/server";
import { getUserSafely } from "@/lib/supabase/auth";
import { isMissingDatabaseObject, schemaUpgradeRequiredMessage } from "@/lib/supabase/schema-compat";

type ActionResult = { error?: string };
type StoredCategoryRow = {
  category_type?: string | null;
  id: string;
  is_active?: boolean | null;
  merged_into_category_id?: string | null;
  metadata: unknown;
  type: string;
  user_id?: string | null;
};

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

function metadataRecord(metadata: unknown) {
  return metadata && typeof metadata === "object" && !Array.isArray(metadata)
    ? metadata as Record<string, unknown>
    : {};
}

const categoryTypeKeys: Record<CategoryFormData["type"], string> = {
  Account: "account",
  Asset: "asset",
  Debt: "debt",
  Expense: "expense",
  Income: "income",
  "Savings Goal": "savings_goal",
  Subscription: "subscription",
};

function categoryPayload(input: CategoryFormData, existingMetadata: Record<string, unknown> = {}) {
  const style = getCategoryTypeStyle(input.type);
  const reportingRole = input.type === "Income" && input.reportingRole === "salary" ? "salary" : null;

  return {
    archived_at: input.isActive ? null : new Date().toISOString(),
    category_type: categoryTypeKeys[input.type],
    color: style.color,
    icon: style.icon,
    is_active: input.isActive,
    is_default: false,
    metadata: {
      ...existingMetadata,
      category_type: input.type,
      description: input.description,
      reporting_role: reportingRole,
      scopes: input.scopes,
    },
    name: input.name.trim(),
    reporting_role: reportingRole,
    type: input.type === "Income" ? "income" : "expense",
  };
}

function legacyCategoryPayload(payload: ReturnType<typeof categoryPayload>) {
  const legacyPayload: Partial<ReturnType<typeof categoryPayload>> = { ...payload };
  delete legacyPayload.archived_at;
  delete legacyPayload.category_type;
  delete legacyPayload.reporting_role;
  return legacyPayload;
}

function mergedIntoCategoryId(row: Pick<StoredCategoryRow, "merged_into_category_id" | "metadata">) {
  const metadata = metadataRecord(row.metadata);
  return row.merged_into_category_id
    ?? (typeof metadata.merged_into_category_id === "string" ? metadata.merged_into_category_id : "");
}

async function getOwnedCategory(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  categoryId: string,
) {
  const enrichedResult = await supabase
    .from("categories")
    .select("id,user_id,type,is_active,category_type,merged_into_category_id,metadata")
    .eq("id", categoryId)
    .eq("user_id", userId)
    .is("deleted_at", null)
    .maybeSingle();
  if (!enrichedResult.error) return { data: enrichedResult.data as StoredCategoryRow | null, error: "" };
  if (!isMissingDatabaseObject(enrichedResult.error, ["category_type", "merged_into_category_id"])) {
    return { data: null, error: enrichedResult.error.message };
  }

  const legacyResult = await supabase
    .from("categories")
    .select("id,user_id,type,is_active,metadata")
    .eq("id", categoryId)
    .eq("user_id", userId)
    .is("deleted_at", null)
    .maybeSingle();
  return {
    data: legacyResult.data as StoredCategoryRow | null,
    error: legacyResult.error?.message ?? "",
  };
}

function validateCategoryInput(input: CategoryFormData) {
  const allowedTypes = ["Expense", "Income", "Account", "Savings Goal", "Debt", "Subscription", "Asset"];
  if (!input.name.trim() || input.name.trim().length > 100) return "Enter a category name up to 100 characters.";
  if (input.description.length > 1_000) return "Keep the category description under 1,000 characters.";
  if (!allowedTypes.includes(input.type)) return "Choose a valid category type.";
  if (input.reportingRole && (input.type !== "Income" || input.reportingRole !== "salary")) return "Choose a valid income reporting role.";
  const expectedScopes = getScopesForCategoryType(input.type);
  if (input.scopes.length !== expectedScopes.length || expectedScopes.some((scope) => !input.scopes.includes(scope))) {
    return "Choose the valid scope for this category type.";
  }
  return "";
}

function storedCategoryDefinition(row: { category_type?: string | null; metadata: unknown; type: string }) {
  const metadata = metadataRecord(row.metadata);
  const normalizedType = String(row.category_type ?? metadata.category_type ?? row.type).toLowerCase().replace(/[_-]/g, " ");
  const type = normalizedType === "savings goal"
    ? "Savings Goal"
    : `${normalizedType.slice(0, 1).toUpperCase()}${normalizedType.slice(1)}`;
  const scopes = Array.isArray(metadata.scopes)
    ? metadata.scopes.map(String).filter((scope) => scope !== "Reports").sort()
    : getScopesForCategoryType(type as CategoryFormData["type"]).sort();
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
    supabase.from("scenario_items").select("id").eq("user_id", userId).eq("category_id", categoryId).limit(1),
    supabase.from("future_planning_columns").select("id").eq("user_id", userId).eq("category_id", categoryId).limit(1),
    supabase.from("accounts").select("id").eq("user_id", userId).eq("metadata->>category_id", categoryId).is("deleted_at", null).limit(1),
    supabase.from("categories").select("id").eq("user_id", userId).or(`parent_id.eq.${categoryId},merged_into_category_id.eq.${categoryId}`).limit(1),
    supabase.from("user_settings").select("user_id").eq("user_id", userId).or(`default_income_category_id.eq.${categoryId},default_expense_category_id.eq.${categoryId}`).limit(1),
  ]);
  const optionalFutureColumnsMissing = Boolean(results[7].error
    && isMissingDatabaseObject(results[7].error, ["future_planning_columns"]));
  const enrichedCategoryLinksMissing = Boolean(results[9].error
    && isMissingDatabaseObject(results[9].error, ["merged_into_category_id"]));
  const error = results.find((result, index) => result.error
    && !(index === 7 && optionalFutureColumnsMissing)
    && !(index === 9 && enrichedCategoryLinksMissing))?.error;
  if (error) return { error: error.message, used: false };

  let legacyCategoryLinkUsed = false;
  if (enrichedCategoryLinksMissing) {
    const legacyLinks = await supabase
      .from("categories")
      .select("id")
      .eq("user_id", userId)
      .eq("parent_id", categoryId)
      .limit(1);
    if (legacyLinks.error) return { error: legacyLinks.error.message, used: false };
    legacyCategoryLinkUsed = (legacyLinks.data?.length ?? 0) > 0;
  }

  return {
    error: "",
    used: legacyCategoryLinkUsed || results.some((result, index) => (
      !(index === 7 && optionalFutureColumnsMissing)
      && !(index === 9 && enrichedCategoryLinksMissing)
      && (result.data?.length ?? 0) > 0
    )),
  };
}

export async function createCategory(input: CategoryFormData): Promise<ActionResult> {
  const { error: authError, supabase, user } = await authenticatedClient();
  if (authError || !user) return { error: authError ?? "You must be signed in." };
  const validationError = validateCategoryInput(input);
  if (validationError) return { error: validationError };

  const payload = categoryPayload(input);
  let { error } = await supabase.from("categories").insert({
    ...payload,
    is_default: false,
    user_id: user.id,
  });
  if (error && isMissingDatabaseObject(error, ["category_type", "reporting_role", "archived_at"])) {
    ({ error } = await supabase.from("categories").insert({
      ...legacyCategoryPayload(payload),
      is_default: false,
      user_id: user.id,
    }));
  }
  if (error) return { error: error.code === "23505" ? "A category with this name and type already exists." : error.message };

  revalidateCategoryPaths();
  return {};
}

export async function updateCategory(categoryId: string, input: CategoryFormData): Promise<ActionResult> {
  const { error: authError, supabase, user } = await authenticatedClient();
  if (authError || !user) return { error: authError ?? "You must be signed in." };
  const validationError = validateCategoryInput(input);
  if (validationError) return { error: validationError };

  const { data: target, error: targetError } = await getOwnedCategory(supabase, user.id, categoryId);
  if (targetError) return { error: targetError };
  if (!target) return { error: "Category not found." };
  if (mergedIntoCategoryId(target)) return { error: "A merged category is read-only. Edit its target category instead." };
  const stored = storedCategoryDefinition(target);
  const definitionChanged = stored.type !== input.type
    || stored.scopes.join("\u0000") !== [...input.scopes].sort().join("\u0000");
  if (definitionChanged) {
    const usage = await categoryIsUsed(supabase, user.id, categoryId);
    if (usage.error) return { error: usage.error };
    if (usage.used) return { error: "This category is in use, so its type and scope cannot be changed." };
  }

  const payload = categoryPayload(input, metadataRecord(target.metadata));
  let { data, error } = await supabase
    .from("categories")
    .update(payload)
    .eq("id", categoryId)
    .eq("user_id", user.id)
    .select("id")
    .maybeSingle();
  if (error && isMissingDatabaseObject(error, ["category_type", "reporting_role", "archived_at"])) {
    ({ data, error } = await supabase
      .from("categories")
      .update(legacyCategoryPayload(payload))
      .eq("id", categoryId)
      .eq("user_id", user.id)
      .select("id")
      .maybeSingle());
  }
  if (error) return { error: error.code === "23505" ? "A category with this name and type already exists." : error.message };
  if (!data) return { error: "This category cannot be edited." };

  revalidateCategoryPaths();
  revalidatePath(`/categories/${categoryId}/edit`);
  return {};
}

export async function setCategoryStatus(categoryId: string, isActive: boolean): Promise<ActionResult> {
  const { error: authError, supabase, user } = await authenticatedClient();
  if (authError || !user) return { error: authError ?? "You must be signed in." };

  const { data: target, error: targetError } = await getOwnedCategory(supabase, user.id, categoryId);
  if (targetError) return { error: targetError };
  if (!target) return { error: "Category not found." };
  if (isActive && mergedIntoCategoryId(target)) return { error: "Merged categories cannot be restored. Restore or edit the target category instead." };
  if (target.is_active === isActive) return {};

  const metadata = metadataRecord(target.metadata);
  const changedAt = new Date().toISOString();
  const statusMetadata = {
    ...metadata,
    archived_at: isActive ? null : changedAt,
    restored_at: isActive ? changedAt : metadata.restored_at,
  };
  let { data, error } = await supabase
    .from("categories")
    .update({
      archived_at: isActive ? null : changedAt,
      is_active: isActive,
      metadata: statusMetadata,
    })
    .eq("id", categoryId)
    .eq("user_id", user.id)
    .select("id")
    .maybeSingle();
  if (error && isMissingDatabaseObject(error, ["archived_at"])) {
    ({ data, error } = await supabase
      .from("categories")
      .update({ is_active: isActive, metadata: statusMetadata })
      .eq("id", categoryId)
      .eq("user_id", user.id)
      .select("id")
      .maybeSingle());
  }
  if (error) return { error: error.message };
  if (!data) return { error: "Category not found." };

  revalidateCategoryPaths();
  revalidatePath(`/categories/${categoryId}/edit`);
  return {};
}

export async function mergeCategory(sourceCategoryId: string, targetCategoryId: string): Promise<ActionResult> {
  const { error: authError, supabase, user } = await authenticatedClient();
  if (authError || !user) return { error: authError ?? "You must be signed in." };
  if (!sourceCategoryId || !targetCategoryId || sourceCategoryId === targetCategoryId) {
    return { error: "Choose a different target category." };
  }

  const { error } = await supabase.rpc("merge_categories", {
    p_source_category_id: sourceCategoryId,
    p_target_category_id: targetCategoryId,
  });
  if (error) {
    return {
      error: isMissingDatabaseObject(error, ["merge_categories"])
        ? schemaUpgradeRequiredMessage("Category merge")
        : error.message,
    };
  }

  revalidateCategoryPaths();
  revalidatePath(`/categories/${sourceCategoryId}/edit`);
  revalidatePath(`/categories/${targetCategoryId}/edit`);
  return {};
}

export async function deleteCategory(categoryId: string): Promise<ActionResult> {
  const { error: authError, supabase, user } = await authenticatedClient();
  if (authError || !user) return { error: authError ?? "You must be signed in." };

  const { data: target, error: targetError } = await getOwnedCategory(supabase, user.id, categoryId);
  if (targetError) return { error: targetError };
  if (!target) return { error: "Category not found." };
  if (mergedIntoCategoryId(target)) return { error: "Merged categories are retained as an audit record and cannot be deleted." };
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
