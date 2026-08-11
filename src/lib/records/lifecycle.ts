type StoredLifecycleRecord = {
  archived_at?: string | null;
  is_active?: boolean | null;
  metadata?: unknown;
};

function metadataRecord(metadata: unknown) {
  return metadata && typeof metadata === "object" && !Array.isArray(metadata)
    ? metadata as Record<string, unknown>
    : {};
}

/**
 * Normalized columns are authoritative, while metadata keeps rolling-schema
 * deployments and legacy rows safe. Business statuses such as Paid or Sold
 * are intentionally separate from lifecycle retirement.
 */
export function storedRecordIsInactive(record: StoredLifecycleRecord) {
  const metadata = metadataRecord(record.metadata);
  const lifecycle = String(metadata.lifecycle_status ?? "").trim().toLowerCase();
  return record.is_active === false
    || Boolean(record.archived_at)
    || metadata.is_active === false
    || ["archived", "deactivated", "inactive"].includes(lifecycle);
}

export function recordWasInactiveByDate(record: StoredLifecycleRecord, asOfDate?: string) {
  if (!asOfDate) return storedRecordIsInactive(record);
  const metadata = metadataRecord(record.metadata);
  const lifecycleEvents = Array.isArray(metadata.lifecycle_events)
    ? metadata.lifecycle_events
      .flatMap((value) => {
        const event = metadataRecord(value);
        const at = typeof event.at === "string" ? event.at : "";
        const state = String(event.state ?? "").trim().toLowerCase();
        return at && ["active", "archived"].includes(state) ? [{ at, state }] : [];
      })
      .filter((event) => event.at.slice(0, 10) <= asOfDate)
      .sort((first, second) => first.at.localeCompare(second.at))
    : [];
  const effectiveEvent = lifecycleEvents.at(-1);
  if (effectiveEvent) return effectiveEvent.state === "archived";
  if (!storedRecordIsInactive(record)) return false;
  const archivedAt = record.archived_at
    ?? (typeof metadata.archived_at === "string" ? metadata.archived_at : "");
  return !archivedAt || archivedAt.slice(0, 10) <= asOfDate;
}
