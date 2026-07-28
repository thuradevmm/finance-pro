function presentNumber(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

export function assetPurchaseAmountMatchesRange(amount: number, range: string) {
  if (range === "Under MMK 500") return amount < 500;
  if (range === "MMK 500 - 1,500") return amount >= 500 && amount < 1500;
  if (range === "MMK 1,500+") return amount >= 1500;
  return true;
}

export function resolveAssetPurchaseValue(
  storedValue: unknown,
  metadataValue: unknown,
  linkedValue: unknown,
) {
  const metadata = presentNumber(metadataValue);
  const stored = presentNumber(storedValue);
  // Current writes mirror the explicit form value into metadata. Legacy rows
  // have no metadata amount and often carry the schema's default zero, so only
  // those rows may fall back to linked purchase evidence.
  const value = metadata ?? (stored !== null && stored !== 0 ? stored : presentNumber(linkedValue) ?? stored ?? 0);
  return Math.max(value, 0);
}

export function resolveAssetCurrentValue(
  storedValue: unknown,
  metadataValue: unknown,
  purchaseValue: number,
) {
  const value = presentNumber(storedValue) ?? presentNumber(metadataValue) ?? purchaseValue;
  return Math.max(value, 0);
}
