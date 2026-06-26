export const SYSTEM_CURRENCY = "MMK" as const;
export const SYSTEM_CURRENCY_NAME = "Myanmar Kyat";
export const SYSTEM_CURRENCY_LABEL = `${SYSTEM_CURRENCY_NAME} (${SYSTEM_CURRENCY})`;

export function formatMmk(value: number, maximumFractionDigits = 2) {
  const fractionDigits = Math.min(Math.max(maximumFractionDigits, 0), 20);

  return new Intl.NumberFormat("en-MM", {
    currency: SYSTEM_CURRENCY,
    currencyDisplay: "code",
    maximumFractionDigits: fractionDigits,
    minimumFractionDigits: 0,
    style: "currency",
  }).format(value);
}

export function formatMmkPreview(value: number | string, sign: "negative" | "none" | "positive" = "none") {
  const numericValue = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numericValue) || numericValue === 0) return `${SYSTEM_CURRENCY} 0`;

  const absoluteValue = Math.abs(numericValue);
  const formattedAmount = new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 2,
    minimumFractionDigits: 0,
    useGrouping: true,
  }).format(absoluteValue);
  const signText = sign === "positive" ? "+" : sign === "negative" ? "-" : "";

  return `${SYSTEM_CURRENCY} ${signText}${formattedAmount}`;
}

export function formatCurrencyAmount(value: number, currencyCode: string) {
  const normalizedCurrency = currencyCode.trim().toUpperCase() || SYSTEM_CURRENCY;
  if (normalizedCurrency === SYSTEM_CURRENCY) return formatMmk(value);

  try {
    return new Intl.NumberFormat("en-US", {
      currency: normalizedCurrency,
      currencyDisplay: "code",
      maximumFractionDigits: 2,
      minimumFractionDigits: 0,
      style: "currency",
    }).format(value);
  } catch {
    return `${normalizedCurrency} ${new Intl.NumberFormat("en-US", {
      maximumFractionDigits: 2,
      minimumFractionDigits: 0,
    }).format(value)}`;
  }
}

export function parseCurrency(value: string) {
  const numericValue = Number(value.replace(/[^0-9.-]+/g, ""));
  return Number.isFinite(numericValue) ? numericValue : 0;
}
