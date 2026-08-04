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
  const linked = presentNumber(linkedValue);
  if (linked !== null) return Math.max(linked, 0);
  const metadata = presentNumber(metadataValue);
  const stored = presentNumber(storedValue);
  const value = metadata ?? stored ?? 0;
  return Math.max(value, 0);
}

export function resolveAssetCurrentValue(
  _storedValue: unknown,
  _metadataValue: unknown,
  purchaseValue: number,
) {
  return Math.max(purchaseValue, 0);
}
