function finiteStoredNumber(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * Debt numeric columns were introduced after legacy records had already stored
 * their values in metadata. Those columns defaulted to zero, so a zero column
 * paired with a non-zero legacy value means the column was never backfilled.
 * Current form actions write both locations, making matching zeroes authoritative.
 */
export function resolveDebtStoredNumber(columnValue: unknown, legacyMetadataValue: unknown) {
  const column = finiteStoredNumber(columnValue);
  const legacy = finiteStoredNumber(legacyMetadataValue);

  if (column === null) return legacy ?? 0;
  if (column === 0 && legacy !== null && legacy !== 0) return legacy;
  return column;
}
