"use server";

import { revalidatePath } from "next/cache";

import { normalizePlanningYears, type FuturePlanningColumnDirection } from "@/lib/future-planning/manual-table";
import { getUserSafely } from "@/lib/supabase/auth";
import {
  isMissingDatabaseObject,
  mergeJsonSettingsSection,
  schemaUpgradeRequiredMessage,
} from "@/lib/supabase/schema-compat";
import { createClient } from "@/lib/supabase/server";

type SettingsActionResult = { error?: string };
const columnDirections = new Set<FuturePlanningColumnDirection>(["expense", "income", "neutral", "saving"]);

async function authenticatedClient() {
  const supabase = await createClient();
  const { user, error } = await getUserSafely(supabase);
  return { authError: error, supabase, user };
}

function revalidateFuturePlanning() {
  revalidatePath("/future-planning");
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
  direction: FuturePlanningColumnDirection;
  name: string;
}): Promise<SettingsActionResult> {
  const name = input.name?.trim() ?? "";
  if (!name || name.length > 80) return { error: "Enter a column name up to 80 characters." };
  if (!columnDirections.has(input.direction)) return { error: "Choose a valid column direction." };

  const { authError, supabase, user } = await authenticatedClient();
  if (authError || !user) return { error: authError ?? "You must be signed in." };

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
        ? schemaUpgradeRequiredMessage("Custom future-planning columns")
        : finalColumnError.message,
    };
  }
  const { error } = await supabase.from("future_planning_columns").insert({
    direction: input.direction,
    name,
    sort_order: (finalColumn?.sort_order ?? -1) + 1,
    user_id: user.id,
  });
  if (error) {
    if (isMissingDatabaseObject(error, ["future_planning_columns"])) {
      return { error: schemaUpgradeRequiredMessage("Custom future-planning columns") };
    }
    return { error: error.code === "23505" ? "An active column already uses that name." : error.message };
  }
  revalidateFuturePlanning();
  return {};
}

export async function saveFuturePlanningAmount(input: {
  amount: number;
  columnId: string;
  periodMonth: string;
}): Promise<SettingsActionResult & { id?: string }> {
  if (!input.columnId?.trim()) return { error: "Planning type not found." };
  if (!/^\d{4}-(0[1-9]|1[0-2])-01$/.test(input.periodMonth)) return { error: "Choose a valid planning month." };
  if (!Number.isFinite(input.amount) || input.amount < 0 || input.amount > 1_000_000_000_000_000) {
    return { error: "Enter a valid planned amount of zero or more." };
  }

  const { authError, supabase, user } = await authenticatedClient();
  if (authError || !user) return { error: authError ?? "You must be signed in." };
  const { data: column, error: columnError } = await supabase
    .from("future_planning_columns")
    .select("id")
    .eq("id", input.columnId)
    .eq("user_id", user.id)
    .eq("is_active", true)
    .maybeSingle();
  if (columnError) return { error: columnError.message };
  if (!column) return { error: "Planning type not found." };

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
        ? schemaUpgradeRequiredMessage("Custom future-planning columns")
        : error.message,
    };
  }
  if (!data) return { error: "Column not found." };
  revalidateFuturePlanning();
  return {};
}
