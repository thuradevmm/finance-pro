import type { SupabaseClient } from "@supabase/supabase-js";

import {
  comparablePreviousPeriodEnd,
  dateInTimeZone,
  mergeSalaryPaydayOverrides,
  resolvedSalaryPayday,
  salaryPeriodHistory,
  type SalaryPaydayOverride,
  type SalaryPaydayRule,
  type SalaryPaydayRuleMode,
  type SalaryWeekendPolicy,
} from "@/lib/salary-periods/calendar";
import {
  salaryPeriodChange,
  summarizeSalaryPeriod,
  type SalaryPeriodSummary,
  type SalaryPeriodTransaction,
} from "@/lib/salary-periods/calculations";
import {
  isMissingDatabaseObject,
  jsonSettingsSection,
} from "@/lib/supabase/schema-compat";

export type SalaryPeriodSettings = SalaryPaydayRule & {
  defaultView: boolean;
  enabled: boolean;
};

export type SalaryPaydayOverrideRecord = SalaryPaydayOverride & {
  id: string;
  storage: "database" | "settings";
};

export type SalaryPeriodData = {
  comparison: ReturnType<typeof salaryPeriodChange>;
  current: SalaryPeriodSummary;
  hasSalaryCategories: boolean;
  history: SalaryPeriodSummary[];
  previousComparable: SalaryPeriodSummary;
  previousFull: SalaryPeriodSummary;
  paydayOverrides: SalaryPaydayOverrideRecord[];
  referenceDate: string;
  settings: SalaryPeriodSettings;
  timezone: string;
};

type RawCategory = {
  id: string;
  metadata: unknown;
  name: string;
  reporting_role?: string | null;
};

type RawTransaction = {
  account_id: string | null;
  amount: number | string | null;
  category_id: string | null;
  id: string;
  metadata: unknown;
  related_entity_id: string | null;
  related_entity_type: string | null;
  status: string | null;
  transaction_date: string;
  transfer_account_id: string | null;
  type: string | null;
};

function metadataRecord(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function numberValue(value: unknown, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function salaryRuleMode(value: unknown): SalaryPaydayRuleMode {
  return value === "days_before_month_end" ? "days_before_month_end" : "fixed_day";
}

function salaryWeekendPolicy(value: unknown): SalaryWeekendPolicy {
  if (value === "previous_business_day" || value === "next_business_day") return value;
  return "none";
}

function salarySettingsFromRow(
  row: Record<string, unknown>,
  directColumnsAvailable: boolean,
): SalaryPeriodSettings {
  const fallback = jsonSettingsSection(row.settings, "salary_period");
  const fallbackStartDay = Math.min(Math.max(Math.trunc(numberValue(fallback.start_day, 1)), 1), 31);
  const daysBeforeMonthEnd = Math.min(Math.max(Math.trunc(numberValue(fallback.days_before_month_end, 0)), 0), 27);
  const flexibleSettings = {
    daysBeforeMonthEnd,
    ruleMode: salaryRuleMode(fallback.rule_mode),
    weekendPolicy: salaryWeekendPolicy(fallback.weekend_policy),
  };
  const fallbackSettings: SalaryPeriodSettings = {
    defaultView: fallback.default_view === true,
    enabled: fallback.enabled === true,
    startDay: fallbackStartDay,
    ...flexibleSettings,
  };
  if (!directColumnsAvailable) return fallbackSettings;

  const directStartDay = Math.min(Math.max(Math.trunc(numberValue(row.salary_period_start_day, 1)), 1), 31);
  // Settings saved by the compatibility path should survive a later schema
  // rollout whose new columns initially contain their database defaults. A
  // successful direct-column save marks the JSON mirror as direct, after which
  // false and day 1 are authoritative values too.
  if (fallback.storage === "fallback") {
    return {
      defaultView: row.salary_period_default_view === true || fallbackSettings.defaultView,
      enabled: row.salary_period_enabled === true || fallbackSettings.enabled,
      startDay: directStartDay !== 1 ? directStartDay : fallbackSettings.startDay,
      ...flexibleSettings,
    };
  }
  return {
    defaultView: typeof row.salary_period_default_view === "boolean"
      ? row.salary_period_default_view
      : fallbackSettings.defaultView,
    enabled: typeof row.salary_period_enabled === "boolean"
      ? row.salary_period_enabled
      : fallbackSettings.enabled,
    startDay: row.salary_period_start_day == null ? fallbackSettings.startDay : directStartDay,
    ...flexibleSettings,
  };
}

export async function getSalaryPaydayOverrides(
  supabase: SupabaseClient,
  userId: string,
): Promise<SalaryPaydayOverrideRecord[]> {
  const [directResult, settingsResult] = await Promise.all([
    supabase
      .from("salary_payday_overrides")
      .select("id,salary_month,payday")
      .eq("user_id", userId)
      .order("salary_month", { ascending: false }),
    supabase
      .from("user_settings")
      .select("settings")
      .eq("user_id", userId)
      .maybeSingle(),
  ]);
  const tableMissing = isMissingDatabaseObject(directResult.error, ["salary_payday_overrides"]);
  if (directResult.error && !tableMissing) throw new Error(directResult.error.message);

  const fallbackSection = jsonSettingsSection(settingsResult.data?.settings, "salary_period");
  const fallbackRows: SalaryPaydayOverrideRecord[] = Array.isArray(fallbackSection.payday_overrides)
    ? fallbackSection.payday_overrides.flatMap((value) => {
      const row = metadataRecord(value);
      const salaryMonth = typeof row.salary_month === "string" ? row.salary_month : "";
      const payday = typeof row.payday === "string" ? row.payday : "";
      if (!/^\d{4}-\d{2}$/.test(salaryMonth) || !/^\d{4}-\d{2}-\d{2}$/.test(payday)) return [];
      try {
        resolvedSalaryPayday(salaryMonth, 1, [{ payday, salaryMonth }]);
      } catch {
        return [];
      }
      return [{ id: `settings:${salaryMonth}`, payday, salaryMonth, storage: "settings" as const }];
    })
    : [];
  if (settingsResult.error) {
    if (tableMissing) throw new Error(settingsResult.error.message);
    return (directResult.data ?? []).map((row) => ({
      id: row.id,
      payday: row.payday,
      salaryMonth: row.salary_month.slice(0, 7),
      storage: "database" as const,
    }));
  }
  const directRows: SalaryPaydayOverrideRecord[] = (directResult.data ?? []).map((row) => ({
    id: row.id,
    payday: row.payday,
    salaryMonth: row.salary_month.slice(0, 7),
    storage: "database" as const,
  }));
  return tableMissing
    ? mergeSalaryPaydayOverrides([], fallbackRows)
    : mergeSalaryPaydayOverrides(directRows, fallbackRows);
}

export async function getSalaryPeriodSettings(
  supabase: SupabaseClient,
  userId: string,
): Promise<SalaryPeriodSettings> {
  const directResult = await supabase
    .from("user_settings")
    .select("salary_period_enabled,salary_period_start_day,salary_period_default_view,settings")
    .eq("user_id", userId)
    .maybeSingle();

  if (!directResult.error) {
    return salarySettingsFromRow((directResult.data ?? {}) as Record<string, unknown>, true);
  }
  if (!isMissingDatabaseObject(directResult.error, [
    "salary_period_enabled",
    "salary_period_start_day",
    "salary_period_default_view",
  ])) {
    throw new Error(directResult.error.message);
  }

  const fallbackResult = await supabase
    .from("user_settings")
    .select("settings")
    .eq("user_id", userId)
    .maybeSingle();
  if (fallbackResult.error) throw new Error(fallbackResult.error.message);
  return salarySettingsFromRow((fallbackResult.data ?? {}) as Record<string, unknown>, false);
}

export async function getSalaryPeriodData(
  supabase: SupabaseClient,
  userId: string,
  options: { historyCount?: number; now?: Date } = {},
): Promise<SalaryPeriodData> {
  const [settings, paydayOverrides, { data: profileRow, error: profileError }] = await Promise.all([
    getSalaryPeriodSettings(supabase, userId),
    getSalaryPaydayOverrides(supabase, userId),
    supabase
      .from("user_profiles")
      .select("timezone")
      .eq("id", userId)
      .maybeSingle(),
  ]);
  if (profileError) throw new Error(profileError.message);

  const timezone = typeof profileRow?.timezone === "string" && profileRow.timezone ? profileRow.timezone : "Asia/Yangon";
  const referenceDate = dateInTimeZone(options.now ?? new Date(), timezone);
  const historyCount = Math.max(2, Math.trunc(options.historyCount ?? 12));
  const periods = salaryPeriodHistory(referenceDate, settings, historyCount, paydayOverrides);
  const earliestStart = periods.at(-1)?.startDate ?? periods[0].startDate;

  const [categoryResult, { data: transactionRows, error: transactionError }] = await Promise.all([
    supabase
      .from("categories")
      .select("id,name,reporting_role,metadata")
      .eq("user_id", userId)
      .is("deleted_at", null),
    supabase
      .from("transactions")
      .select("id,transaction_date,type,amount,account_id,transfer_account_id,category_id,status,related_entity_type,related_entity_id,metadata")
      .eq("user_id", userId)
      .is("deleted_at", null)
      .gte("transaction_date", earliestStart)
      .lte("transaction_date", periods[0].endDate)
      .order("transaction_date", { ascending: true }),
  ]);
  let categoryRows = (categoryResult.data ?? []) as RawCategory[];
  if (categoryResult.error) {
    if (!isMissingDatabaseObject(categoryResult.error, ["reporting_role"])) {
      throw new Error(categoryResult.error.message);
    }
    const fallbackCategories = await supabase
      .from("categories")
      .select("id,name,metadata")
      .eq("user_id", userId)
      .is("deleted_at", null);
    if (fallbackCategories.error) throw new Error(fallbackCategories.error.message);
    categoryRows = (fallbackCategories.data ?? []) as RawCategory[];
  }
  if (transactionError) throw new Error(transactionError.message);

  const categories = new Map(((categoryRows ?? []) as RawCategory[]).map((category) => {
    const metadata = metadataRecord(category.metadata);
    const role = typeof category.reporting_role === "string"
      ? category.reporting_role
      : typeof metadata.reporting_role === "string" ? metadata.reporting_role : "";
    return [category.id, { name: category.name, reportingRole: role }];
  }));
  const transactions: SalaryPeriodTransaction[] = ((transactionRows ?? []) as RawTransaction[]).map((transaction) => {
    const category = transaction.category_id ? categories.get(transaction.category_id) : undefined;
    return {
      account_id: transaction.account_id,
      amount: transaction.amount,
      categoryName: category?.name ?? "Uncategorized",
      categoryReportingRole: category?.reportingRole ?? "",
      id: transaction.id,
      metadata: transaction.metadata,
      related_entity_id: transaction.related_entity_id,
      related_entity_type: transaction.related_entity_type,
      status: transaction.status,
      transactionDate: transaction.transaction_date,
      transfer_account_id: transaction.transfer_account_id,
      type: transaction.type,
    };
  });

  const current = summarizeSalaryPeriod(transactions, periods[0], referenceDate);
  const previousFull = summarizeSalaryPeriod(transactions, periods[1]);
  const previousComparable = summarizeSalaryPeriod(
    transactions,
    periods[1],
    comparablePreviousPeriodEnd(referenceDate, periods[0], periods[1]),
  );
  const history = periods.map((period, index) => summarizeSalaryPeriod(
    transactions,
    period,
    index === 0 ? referenceDate : period.endDate,
  ));

  return {
    comparison: salaryPeriodChange(current, previousComparable),
    current,
    hasSalaryCategories: [...categories.values()].some((category) => category.reportingRole.trim().toLowerCase() === "salary"),
    history,
    previousComparable,
    previousFull,
    paydayOverrides,
    referenceDate,
    settings,
    timezone,
  };
}
