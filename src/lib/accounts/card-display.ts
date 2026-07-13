export function maskCardNumber(value: string) {
  const compactValue = value.replace(/\D+/g, "");
  if (!compactValue) return "Not set";

  const visibleDigits = compactValue.slice(-4);
  if (compactValue.length <= 4) return visibleDigits;

  const hiddenLength = Math.max(compactValue.length - visibleDigits.length, 4);
  const hiddenGroups = Array.from(
    { length: Math.ceil(hiddenLength / 4) },
    (_, index) => "•".repeat(Math.min(4, hiddenLength - index * 4)),
  );

  return [...hiddenGroups, visibleDigits].join(" ");
}

export function creditUtilizationPercent(used: number, limit: number) {
  if (!Number.isFinite(used) || !Number.isFinite(limit) || limit <= 0) return 0;
  return Math.max(used, 0) / limit * 100;
}

export function formatCreditUtilization(used: number, limit: number) {
  return `${new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 1,
    minimumFractionDigits: 0,
  }).format(creditUtilizationPercent(used, limit))}%`;
}

export function formatBillingDay(day: number | null) {
  return day == null ? "Not set" : `Day ${day}`;
}
