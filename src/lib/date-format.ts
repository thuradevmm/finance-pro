export function formatDisplayDate(value: string | Date, fallback = "Not set") {
  if (!value) return fallback;
  const date = value instanceof Date ? value : new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return String(value);

  const day = String(date.getDate()).padStart(2, "0");
  const month = new Intl.DateTimeFormat("en-US", { month: "short" }).format(date);
  const year = date.getFullYear();
  return `${day}-${month}-${year}`;
}

export function combineDateWithTimestampTime(dateValue: string, timestampValue?: string | null) {
  if (!dateValue) return "";
  if (!timestampValue) return `${dateValue}T00:00:00`;

  const timestamp = new Date(timestampValue);
  if (Number.isNaN(timestamp.getTime())) return `${dateValue}T00:00:00`;

  const hours = String(timestamp.getHours()).padStart(2, "0");
  const minutes = String(timestamp.getMinutes()).padStart(2, "0");
  const seconds = String(timestamp.getSeconds()).padStart(2, "0");
  return `${dateValue}T${hours}:${minutes}:${seconds}`;
}

export function dateTimeSortValue(value: string) {
  if (!value) return 0;
  return new Date(value).getTime() || 0;
}
