type SupabaseErrorLike = {
  code?: unknown;
  details?: unknown;
  hint?: unknown;
  message?: unknown;
};

export type JsonSettingsRecord = Record<string, unknown>;

const missingDatabaseObjectCodes = new Set([
  "42P01", // PostgreSQL undefined_table
  "42703", // PostgreSQL undefined_column
  "42883", // PostgreSQL undefined_function
  "PGRST202", // PostgREST function not found in schema cache
  "PGRST204", // PostgREST column not found in schema cache
  "PGRST205", // PostgREST table not found in schema cache
]);

function errorRecord(error: unknown): SupabaseErrorLike {
  return error && typeof error === "object" ? error as SupabaseErrorLike : {};
}

export function supabaseErrorText(error: unknown) {
  const record = errorRecord(error);
  return [record.message, record.details, record.hint]
    .filter((value): value is string => typeof value === "string")
    .join(" ")
    .toLowerCase();
}

/**
 * Supports rolling application/database deployments. Postgres and PostgREST
 * use different error codes for a column, table, or RPC that has not reached
 * the linked project yet, so callers should recognize both families.
 */
export function isMissingDatabaseObject(error: unknown, objectNames: string[] = []) {
  const record = errorRecord(error);
  const code = typeof record.code === "string" ? record.code.toUpperCase() : "";
  const text = supabaseErrorText(error);
  const describesMissingObject = missingDatabaseObjectCodes.has(code)
    || /(?:column|relation|table|function).*(?:does not exist|not found)/.test(text)
    || /could not find.*(?:column|table|function)/.test(text);
  if (!describesMissingObject) return false;
  if (objectNames.length === 0) return true;
  return objectNames.some((name) => text.includes(name.toLowerCase()));
}

export function schemaUpgradeRequiredMessage(feature: string) {
  return `${feature} needs the latest database migrations. Commit and deploy the pending Supabase migrations, then try again.`;
}

/**
 * `user_settings.settings` predates the feature-specific columns and tables.
 * Keep its parsing deliberately defensive because older rows can contain any
 * valid JSON value, not necessarily an object.
 */
export function jsonSettingsRecord(value: unknown): JsonSettingsRecord {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as JsonSettingsRecord
    : {};
}

export function jsonSettingsSection(value: unknown, section: string): JsonSettingsRecord {
  return jsonSettingsRecord(jsonSettingsRecord(value)[section]);
}

/**
 * Merge one application-owned section without replacing unrelated settings.
 * This is used as a rolling-deployment fallback while a newer database schema
 * is being applied.
 */
export function mergeJsonSettingsSection(
  value: unknown,
  section: string,
  patch: JsonSettingsRecord,
): JsonSettingsRecord {
  const settings = jsonSettingsRecord(value);
  return {
    ...settings,
    [section]: {
      ...jsonSettingsSection(settings, section),
      ...patch,
    },
  };
}
