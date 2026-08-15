type DebtCancellationRecord = {
  archived_at?: string | null;
  is_active?: boolean | null;
  metadata?: unknown;
  status?: string | null;
};

function metadataRecord(metadata: unknown) {
  return metadata && typeof metadata === "object" && !Array.isArray(metadata)
    ? metadata as Record<string, unknown>
    : {};
}

function normalizedState(value: unknown) {
  return String(value ?? "").trim().toLowerCase();
}

function storedCancellationState(record: DebtCancellationRecord) {
  const metadata = metadataRecord(record.metadata);
  const states = [
    metadata.cancellation_status,
    metadata.lifecycle_status,
    record.status,
  ].map(normalizedState);
  return states.some((state) => state === "canceled" || state === "cancelled");
}

/**
 * Legacy Borrowing & Lending retirement was the only available way to stop a
 * record. Those rows are cancellation records after the cancellation migration,
 * while this fallback keeps rolling deployments and unmigrated exports safe.
 */
export function debtIsCanceled(record: DebtCancellationRecord) {
  if (storedCancellationState(record)) return true;
  const metadata = metadataRecord(record.metadata);
  const lifecycle = normalizedState(metadata.lifecycle_status);
  return record.is_active === false
    || Boolean(record.archived_at)
    || metadata.is_active === false
    || ["archived", "deactivated", "inactive"].includes(lifecycle);
}

/** Cancellation is effective-dated so historical dashboard snapshots remain stable. */
export function debtWasCanceledByDate(record: DebtCancellationRecord, asOfDate?: string) {
  if (!asOfDate) return debtIsCanceled(record);
  const metadata = metadataRecord(record.metadata);
  const hasDatedEvents = Array.isArray(metadata.cancellation_events)
    && metadata.cancellation_events.some((value) => {
      const event = metadataRecord(value);
      return typeof event.at === "string"
        && event.at.length > 0
        && ["active", "canceled", "cancelled"].includes(normalizedState(event.state));
    });
  const events = Array.isArray(metadata.cancellation_events)
    ? metadata.cancellation_events
      .flatMap((value) => {
        const event = metadataRecord(value);
        const at = typeof event.at === "string" ? event.at : "";
        const state = normalizedState(event.state);
        return at && ["active", "canceled", "cancelled"].includes(state)
          ? [{ at, state: state === "cancelled" ? "canceled" : state }]
          : [];
      })
      .filter((event) => event.at.slice(0, 10) <= asOfDate)
      .sort((first, second) => first.at.localeCompare(second.at))
    : [];
  const effectiveEvent = events.at(-1);
  if (effectiveEvent) return effectiveEvent.state === "canceled";
  if (hasDatedEvents) return false;
  if (!debtIsCanceled(record)) return false;
  const canceledAt = typeof metadata.canceled_at === "string" && metadata.canceled_at
    ? metadata.canceled_at
    : record.archived_at
      ?? (typeof metadata.archived_at === "string" ? metadata.archived_at : "");
  return !canceledAt || canceledAt.slice(0, 10) <= asOfDate;
}

export function appendDebtCancellationEvent(
  metadataValue: unknown,
  event: { at: string; state: "active" | "canceled" },
) {
  const metadata = metadataRecord(metadataValue);
  const events = Array.isArray(metadata.cancellation_events)
    ? metadata.cancellation_events
    : [];
  return [...events, event];
}
