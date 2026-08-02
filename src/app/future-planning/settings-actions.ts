"use server";

import { revalidatePath } from "next/cache";

import {
  movePlanningColumn,
  normalizePlanningYears,
  type FuturePlanningColumnMoveDirection,
} from "@/lib/future-planning/manual-table";
import { planningDirectionForCategoryType } from "@/lib/future-planning/category-controls";
import { getUserSafely } from "@/lib/supabase/auth";
import {
  isMissingDatabaseObject,
  mergeJsonSettingsSection,
  schemaUpgradeRequiredMessage,
} from "@/lib/supabase/schema-compat";
import { createClient } from "@/lib/supabase/server";

type SettingsActionResult = { error?: string };

function metadataRecord(metadata: unknown) {
  return metadata && typeof metadata === "object" && !Array.isArray(metadata)
    ? metadata as Record<string, unknown>
    : {};
}

function normalizedCategoryType(row: { category_type?: string | null; metadata: unknown; type: string }) {
  const metadata = metadataRecord(row.metadata);
  return String(row.category_type ?? metadata.category_type ?? row.type).trim().toLowerCase().replace(/[\s-]+/g, "_");
}

async function authenticatedClient() {
  const supabase = await createClient();
  const { user, error } = await getUserSafely(supabase);
  return { authError: error, supabase, user };
}

function revalidateFuturePlanning() {
  revalidatePath("/future-planning");
  revalidatePath("/notifications");
}

export async function saveFuturePlanningYears(years: number[]): Promise<SettingsActionResult> {
  const selectedYears = normalizePlanningYears(years);
  if (selectedYears.length === 0) return { error: "Add at least one valid four-digit year." };
  if (selectedYears.length > 50) return { error: "Choose 50 years or fewer for one planning table." };

  const { authError, supabase, user } = await authenticatedClient();
  if (authError || !user) return { error: authError ?? "You must be signed in." };
  const { error: directError } = await supabase.from("future_planning_settings").upsert({
    selected_years: selectedYears,
    user_id: user.id,
  }, { onConflict: "user_id" });
  const directTableMissing = isMissingDatabaseObject(directError, ["future_planning_settings"]);
  if (directError && !directTableMissing) return { error: directError.message };

  const existingResult = await supabase
    .from("user_settings")
    .select("settings")
    .eq("user_id", user.id)
    .maybeSingle();
  if (existingResult.error) {
    if (directTableMissing) return { error: existingResult.error.message };
    revalidateFuturePlanning();
    return {};
  }
  const settings = mergeJsonSettingsSection(existingResult.data?.settings, "future_planning", {
    selected_years: selectedYears,
    storage: directTableMissing ? "fallback" : "direct",
  });
  const { error: settingsError } = await supabase.from("user_settings").upsert({
    settings,
    user_id: user.id,
  }, { onConflict: "user_id" });
  if (settingsError && directTableMissing) return { error: settingsError.message };
  revalidateFuturePlanning();
  return {};
}

export async function createFuturePlanningColumn(input: {
  categoryId: string;
}): Promise<SettingsActionResult> {
  if (!input.categoryId?.trim()) return { error: "Choose a category." };

  const { authError, supabase, user } = await authenticatedClient();
  if (authError || !user) return { error: authError ?? "You must be signed in." };

  const { data: category, error: categoryError } = await supabase
    .from("categories")
    .select("id,name,type,category_type,is_active,metadata")
    .eq("id", input.categoryId)
    .eq("user_id", user.id)
    .is("deleted_at", null)
    .maybeSingle();
  if (categoryError) return { error: categoryError.message };
  if (!category || category.is_active === false) return { error: "Choose an active category." };
  const categoryType = normalizedCategoryType(category);
  if (!["expense", "income", "savings_goal"].includes(categoryType)) {
    return { error: "Future Planning supports Credit, Debit, and Savings Goal categories." };
  }
  const direction = planningDirectionForCategoryType(categoryType);

  const { data: existingColumn, error: existingColumnError } = await supabase
    .from("future_planning_columns")
    .select("id,is_active")
    .eq("user_id", user.id)
    .eq("category_id", category.id)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (existingColumnError) {
    return {
      error: isMissingDatabaseObject(existingColumnError, ["category_id"])
        ? schemaUpgradeRequiredMessage("Category-based future planning")
        : existingColumnError.message,
    };
  }
  if (existingColumn?.is_active) return { error: "This category is already in Future Planning." };

  const { data: finalColumn, error: finalColumnError } = await supabase
    .from("future_planning_columns")
    .select("sort_order")
    .eq("user_id", user.id)
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (finalColumnError) {
    return {
      error: isMissingDatabaseObject(finalColumnError, ["future_planning_columns"])
        ? schemaUpgradeRequiredMessage("Category-based future planning")
        : finalColumnError.message,
    };
  }
  const payload = {
    category_id: category.id,
    direction,
    is_active: true,
    name: category.name,
    sort_order: (finalColumn?.sort_order ?? -1) + 1,
    user_id: user.id,
  };
  const { error } = existingColumn
    ? await supabase.from("future_planning_columns").update(payload).eq("id", existingColumn.id).eq("user_id", user.id)
    : await supabase.from("future_planning_columns").insert(payload);
  if (error) {
    if (isMissingDatabaseObject(error, ["future_planning_columns", "category_id"])) {
      return { error: schemaUpgradeRequiredMessage("Category-based future planning") };
    }
    return { error: error.code === "23505" ? "This category is already in Future Planning." : error.message };
  }
  revalidateFuturePlanning();
  return {};
}

export async function moveFuturePlanningColumn(input: {
  columnId: string;
  direction: FuturePlanningColumnMoveDirection;
}): Promise<SettingsActionResult & { orderedColumnIds?: string[] }> {
  if (!input.columnId?.trim()) return { error: "Planning category not found." };
  if (input.direction !== "left" && input.direction !== "right") return { error: "Choose a valid move direction." };

  const { authError, supabase, user } = await authenticatedClient();
  if (authError || !user) return { error: authError ?? "You must be signed in." };
  const { data, error } = await supabase
    .from("future_planning_columns")
    .select("id,name,direction,category_id,sort_order,is_active,created_at")
    .eq("user_id", user.id)
    .eq("is_active", true)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true })
    .order("id", { ascending: true });
  if (error) {
    return {
      error: isMissingDatabaseObject(error, ["future_planning_columns"])
        ? schemaUpgradeRequiredMessage("Category-based future planning")
        : error.message,
    };
  }

  const columns = data ?? [];
  if (!columns.some((column) => column.id === input.columnId)) return { error: "Planning category not found." };
  const reordered = movePlanningColumn(columns, input.columnId, input.direction);
  const orderedColumnIds = reordered.map((column) => column.id);
  if (orderedColumnIds.every((columnId, index) => columnId === columns[index]?.id)) {
    return { orderedColumnIds };
  }

  const { error: updateError } = await supabase.from("future_planning_columns").upsert(
    reordered.map((column, sortOrder) => ({
      direction: column.direction,
      category_id: column.category_id,
      id: column.id,
      is_active: true,
      name: column.name,
      sort_order: sortOrder,
      user_id: user.id,
    })),
    { onConflict: "id" },
  );
  if (updateError) return { error: updateError.message };
  revalidateFuturePlanning();
  return { orderedColumnIds };
}

export async function saveFuturePlanningAmount(input: {
  amount: number;
  columnId: string;
  periodMonth: string;
}): Promise<SettingsActionResult & { id?: string }> {
  if (!input.columnId?.trim()) return { error: "Planning category not found." };
  if (!/^\d{4}-(0[1-9]|1[0-2])-01$/.test(input.periodMonth)) return { error: "Choose a valid planning month." };
  if (!Number.isFinite(input.amount) || input.amount < 0 || input.amount > 1_000_000_000_000_000) {
    return { error: "Enter a valid planned amount of zero or more." };
  }

  const { authError, supabase, user } = await authenticatedClient();
  if (authError || !user) return { error: authError ?? "You must be signed in." };
  const { data: column, error: columnError } = await supabase
    .from("future_planning_columns")
    .select("id,category_id")
    .eq("id", input.columnId)
    .eq("user_id", user.id)
    .eq("is_active", true)
    .maybeSingle();
  if (columnError) return { error: columnError.message };
  if (!column) return { error: "Planning category not found." };

  const { data, error } = await supabase
    .from("future_planning_amounts")
    .upsert({
      amount: input.amount,
      column_id: input.columnId,
      period_month: input.periodMonth,
      user_id: user.id,
    }, { onConflict: "user_id,column_id,period_month" })
    .select("id")
    .single();
  if (error) {
    return {
      error: isMissingDatabaseObject(error, ["future_planning_amounts"])
        ? schemaUpgradeRequiredMessage("Manual future-planning amounts")
        : error.message,
    };
  }
  revalidateFuturePlanning();
  revalidatePath("/transactions/add");
  return { id: data.id };
}

export async function archiveFuturePlanningColumn(columnId: string): Promise<SettingsActionResult> {
  if (!columnId?.trim()) return { error: "Column not found." };
  const { authError, supabase, user } = await authenticatedClient();
  if (authError || !user) return { error: authError ?? "You must be signed in." };
  const { data, error } = await supabase
    .from("future_planning_columns")
    .update({ is_active: false })
    .eq("id", columnId)
    .eq("user_id", user.id)
    .eq("is_active", true)
    .select("id")
    .maybeSingle();
  if (error) {
    return {
      error: isMissingDatabaseObject(error, ["future_planning_columns"])
        ? schemaUpgradeRequiredMessage("Category-based future planning")
        : error.message,
    };
  }
  if (!data) return { error: "Column not found." };
  revalidateFuturePlanning();
  return {};
}
