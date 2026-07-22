"use server";

import type { SupabaseClient } from "@supabase/supabase-js";
import { revalidatePath } from "next/cache";

import {
  salaryPaydaySequenceError,
  type SalaryPaydayRuleMode,
  type SalaryWeekendPolicy,
} from "@/lib/salary-periods/calendar";
import {
  getSalaryPaydayOverrides,
  getSalaryPeriodSettings,
  type SalaryPeriodSettings,
} from "@/lib/salary-periods/supabase";
import { getUserSafely } from "@/lib/supabase/auth";
import {
  isMissingDatabaseObject,
  mergeJsonSettingsSection,
} from "@/lib/supabase/schema-compat";
import { createClient } from "@/lib/supabase/server";

type SalarySettingsInput = {
  daysBeforeMonthEnd: number;
  defaultView: boolean;
  enabled: boolean;
  ruleMode: SalaryPaydayRuleMode;
  startDay: number;
  weekendPolicy: SalaryWeekendPolicy;
};

type SalaryPaydayOverrideInput = {
  payday: string;
  salaryMonth: string;
};

const ruleModes = new Set<SalaryPaydayRuleMode>(["fixed_day", "days_before_month_end"]);
const weekendPolicies = new Set<SalaryWeekendPolicy>(["none", "previous_business_day", "next_business_day"]);

function validMonth(value: string) {
  const match = /^(\d{4})-(\d{2})$/.exec(value);
  return Boolean(match && Number(match[1]) >= 1900 && Number(match[1]) <= 9999 && Number(match[2]) >= 1 && Number(match[2]) <= 12);
}

function validDate(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  return year >= 1900 && year <= 9999
    && date.getUTCFullYear() === year
    && date.getUTCMonth() === month - 1
    && date.getUTCDate() === day;
}

function revalidateSalaryPaths() {
  for (const path of ["/salary-periods", "/dashboard", "/reports", "/settings"]) revalidatePath(path);
}

function serializedPaydayOverrides(overrides: SalaryPaydayOverrideInput[]) {
  return [...overrides]
    .sort((first, second) => second.salaryMonth.localeCompare(first.salaryMonth))
    .map((override) => ({
      payday: override.payday,
      salary_month: override.salaryMonth,
    }));
}

async function savePaydayOverrideMirror(
  supabase: SupabaseClient,
  userId: string,
  existingSettings: unknown,
  overrides: SalaryPaydayOverrideInput[],
) {
  const settings = mergeJsonSettingsSection(existingSettings, "salary_period", {
    payday_overrides: serializedPaydayOverrides(overrides),
  });
  return supabase.from("user_settings").upsert({
    settings,
    user_id: userId,
  }, { onConflict: "user_id" });
}

export async function saveSalaryPeriodSettings(input: SalarySettingsInput) {
  if (!input || typeof input !== "object") return { error: "Enter valid salary-period settings." };
  const startDay = Number(input.startDay);
  if (!Number.isInteger(startDay) || startDay < 1 || startDay > 31) return { error: "Payday must be from day 1 through day 31." };
  const daysBeforeMonthEnd = Number(input.daysBeforeMonthEnd);
  if (!Number.isInteger(daysBeforeMonthEnd) || daysBeforeMonthEnd < 0 || daysBeforeMonthEnd > 27) {
    return { error: "Days before month end must be from 0 through 27." };
  }
  if (!ruleModes.has(input.ruleMode)) return { error: "Choose a valid payday rule." };
  if (!weekendPolicies.has(input.weekendPolicy)) return { error: "Choose a valid weekend policy." };

  const supabase = await createClient();
  const { user, error: authError } = await getUserSafely(supabase);
  if (authError || !user) return { error: authError ?? "You must be signed in." };

  const existingResult = await supabase
    .from("user_settings")
    .select("settings")
    .eq("user_id", user.id)
    .maybeSingle();
  if (existingResult.error) return { error: existingResult.error.message };

  const proposedSettings: SalaryPeriodSettings = {
    daysBeforeMonthEnd,
    defaultView: input.enabled && input.defaultView === true,
    enabled: input.enabled === true,
    ruleMode: input.ruleMode,
    startDay,
    weekendPolicy: input.weekendPolicy,
  };
  let paydayOverrides;
  try {
    paydayOverrides = await getSalaryPaydayOverrides(supabase, user.id);
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Payday overrides could not be checked." };
  }
  const sequenceError = salaryPaydaySequenceError(proposedSettings, paydayOverrides);
  if (sequenceError) return { error: sequenceError };

  const settingValues = {
    days_before_month_end: daysBeforeMonthEnd,
    default_view: input.enabled && input.defaultView === true,
    enabled: input.enabled === true,
    rule_mode: input.ruleMode,
    start_day: startDay,
    weekend_policy: input.weekendPolicy,
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

  revalidateSalaryPaths();
  return {};
}

export async function saveSalaryPaydayOverride(input: SalaryPaydayOverrideInput) {
  if (!input || typeof input !== "object" || !validMonth(input.salaryMonth) || !validDate(input.payday)) {
    return { error: "Choose a valid salary month and actual payday." };
  }

  const supabase = await createClient();
  const { user, error: authError } = await getUserSafely(supabase);
  if (authError || !user) return { error: authError ?? "You must be signed in." };

  let settings;
  let currentOverrides;
  let existingSettings;
  try {
    const [loadedSettings, loadedOverrides, existingResult] = await Promise.all([
      getSalaryPeriodSettings(supabase, user.id),
      getSalaryPaydayOverrides(supabase, user.id),
      supabase
        .from("user_settings")
        .select("settings")
        .eq("user_id", user.id)
        .maybeSingle(),
    ]);
    if (existingResult.error) return { error: existingResult.error.message };
    settings = loadedSettings;
    currentOverrides = loadedOverrides;
    existingSettings = existingResult.data?.settings;
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Payday settings could not be loaded." };
  }
  const nextOverrides = [
    ...currentOverrides.filter((override) => override.salaryMonth !== input.salaryMonth),
    { payday: input.payday, salaryMonth: input.salaryMonth },
  ];
  const sequenceError = salaryPaydaySequenceError(settings, nextOverrides);
  if (sequenceError) return { error: sequenceError };

  const { error } = await supabase.from("salary_payday_overrides").upsert({
    metadata: { source: "manual" },
    payday: input.payday,
    salary_month: `${input.salaryMonth}-01`,
    user_id: user.id,
  }, { onConflict: "user_id,salary_month" });
  if (error && !isMissingDatabaseObject(error, ["salary_payday_overrides"])) return { error: error.message };

  const { error: mirrorError } = await savePaydayOverrideMirror(
    supabase,
    user.id,
    existingSettings,
    nextOverrides,
  );
  if (mirrorError) return { error: mirrorError.message };
  revalidateSalaryPaths();
  return {};
}

export async function deleteSalaryPaydayOverride(overrideId: string) {
  if (!overrideId?.trim()) return { error: "Payday override not found." };
  const supabase = await createClient();
  const { user, error: authError } = await getUserSafely(supabase);
  if (authError || !user) return { error: authError ?? "You must be signed in." };

  let settings;
  let currentOverrides;
  let existingSettings;
  try {
    const [loadedSettings, loadedOverrides, existingResult] = await Promise.all([
      getSalaryPeriodSettings(supabase, user.id),
      getSalaryPaydayOverrides(supabase, user.id),
      supabase
        .from("user_settings")
        .select("settings")
        .eq("user_id", user.id)
        .maybeSingle(),
    ]);
    if (existingResult.error) return { error: existingResult.error.message };
    settings = loadedSettings;
    currentOverrides = loadedOverrides;
    existingSettings = existingResult.data?.settings;
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Payday settings could not be loaded." };
  }
  const targetOverride = currentOverrides.find((override) => override.id === overrideId);
  if (!targetOverride) return { error: "Payday override not found." };
  const remainingOverrides = currentOverrides.filter((override) => override.salaryMonth !== targetOverride.salaryMonth);
  const sequenceError = salaryPaydaySequenceError(settings, remainingOverrides);
  if (sequenceError) return { error: sequenceError };

  if (targetOverride.storage === "database") {
    const { data, error } = await supabase
      .from("salary_payday_overrides")
      .delete()
      .eq("id", overrideId)
      .eq("user_id", user.id)
      .select("id")
      .maybeSingle();
    const tableMissing = isMissingDatabaseObject(error, ["salary_payday_overrides"]);
    if (error && !tableMissing) return { error: error.message };
    if (!error && !data) return { error: "Payday override not found." };
  }

  const { error: mirrorError } = await savePaydayOverrideMirror(
    supabase,
    user.id,
    existingSettings,
    remainingOverrides,
  );
  if (mirrorError) return { error: mirrorError.message };
  revalidateSalaryPaths();
  return {};
}
