"use server";

import { revalidatePath } from "next/cache";

import { getUserSafely } from "@/lib/supabase/auth";
import {
  isMissingDatabaseObject,
  mergeJsonSettingsSection,
} from "@/lib/supabase/schema-compat";
import { createClient } from "@/lib/supabase/server";

type SalarySettingsInput = {
  defaultView: boolean;
  enabled: boolean;
  startDay: number;
};

export async function saveSalaryPeriodSettings(input: SalarySettingsInput) {
  if (!input || typeof input !== "object") return { error: "Enter valid salary-period settings." };
  const startDay = Math.trunc(Number(input.startDay));
  if (!Number.isFinite(startDay) || startDay < 1 || startDay > 31) return { error: "Payday must be from day 1 through day 31." };

  const supabase = await createClient();
  const { user, error: authError } = await getUserSafely(supabase);
  if (authError || !user) return { error: authError ?? "You must be signed in." };

  const existingResult = await supabase
    .from("user_settings")
    .select("settings")
    .eq("user_id", user.id)
    .maybeSingle();
  if (existingResult.error) return { error: existingResult.error.message };

  const settingValues = {
    default_view: input.enabled && input.defaultView === true,
    enabled: input.enabled === true,
    start_day: startDay,
  };
  const directSettings = mergeJsonSettingsSection(existingResult.data?.settings, "salary_period", {
    ...settingValues,
    storage: "direct",
  });

  const { error } = await supabase.from("user_settings").upsert({
    salary_period_default_view: input.enabled && input.defaultView === true,
    salary_period_enabled: input.enabled === true,
    salary_period_start_day: startDay,
    settings: directSettings,
    user_id: user.id,
  }, { onConflict: "user_id" });
  if (error) {
    if (!isMissingDatabaseObject(error, [
      "salary_period_enabled",
      "salary_period_start_day",
      "salary_period_default_view",
    ])) {
      return { error: error.message };
    }
    const fallbackSettings = mergeJsonSettingsSection(existingResult.data?.settings, "salary_period", {
      ...settingValues,
      storage: "fallback",
    });
    const { error: fallbackError } = await supabase.from("user_settings").upsert({
      settings: fallbackSettings,
      user_id: user.id,
    }, { onConflict: "user_id" });
    if (fallbackError) return { error: fallbackError.message };
  }

  for (const path of ["/salary-periods", "/dashboard", "/reports", "/settings"]) revalidatePath(path);
  return {};
}
