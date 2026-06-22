export const SYSTEM_CURRENCY = "MMK" as const;
export const SYSTEM_CURRENCY_NAME = "Myanmar Kyat";
export const SYSTEM_CURRENCY_LABEL = `${SYSTEM_CURRENCY_NAME} (${SYSTEM_CURRENCY})`;

export function formatMmk(value: number, maximumFractionDigits = 0) {
  return new Intl.NumberFormat("en-MM", {
    currency: SYSTEM_CURRENCY,
    currencyDisplay: "code",
    maximumFractionDigits,
    minimumFractionDigits: 0,
    style: "currency",
  }).format(value);
}

export function parseCurrency(value: string) {
  const numericValue = Number(value.replace(/[^0-9.-]+/g, ""));
  return Number.isFinite(numericValue) ? numericValue : 0;
}
