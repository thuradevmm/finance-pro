export const SYSTEM_CURRENCY = "MMK" as const;
export const SYSTEM_CURRENCY_NAME = "Myanmar Kyat";
export const SYSTEM_CURRENCY_LABEL = `${SYSTEM_CURRENCY_NAME} (${SYSTEM_CURRENCY})`;

function countFractionDigits(value: number) {
  if (!Number.isFinite(value)) return 0;
  const textValue = String(value);
  if (!textValue.includes("e")) return textValue.split(".")[1]?.length ?? 0;

  const [, exponentText = "0"] = textValue.split("e-");
  const significantDigits = textValue.split("e-")[0]?.replace(".", "").replace("-", "").length ?? 0;
  return Math.max(Number(exponentText) + significantDigits - 1, 0);
}

export function formatMmk(value: number, maximumFractionDigits = countFractionDigits(value)) {
  const fractionDigits = Math.min(Math.max(maximumFractionDigits, countFractionDigits(value)), 20);

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
    maximumFractionDigits: 20,
    minimumFractionDigits: 0,
    useGrouping: true,
  }).format(absoluteValue);
  const signText = sign === "positive" ? "+" : sign === "negative" ? "-" : "";

  return `${SYSTEM_CURRENCY} ${signText}${formattedAmount}`;
}

export function parseCurrency(value: string) {
  const numericValue = Number(value.replace(/[^0-9.-]+/g, ""));
  return Number.isFinite(numericValue) ? numericValue : 0;
}
