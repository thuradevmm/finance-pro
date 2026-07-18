export function calculateUsageDuration(startDate: string, referenceDate = new Date()) {
  const dateOnlyMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(startDate);
  const startedAt = dateOnlyMatch
    ? new Date(Number(dateOnlyMatch[1]), Number(dateOnlyMatch[2]) - 1, Number(dateOnlyMatch[3]))
    : new Date(startDate);

  if (!startDate || Number.isNaN(startedAt.getTime())) {
    return "Not started";
  }
  if (dateOnlyMatch && (
    startedAt.getFullYear() !== Number(dateOnlyMatch[1])
    || startedAt.getMonth() !== Number(dateOnlyMatch[2]) - 1
    || startedAt.getDate() !== Number(dateOnlyMatch[3])
  )) return "Not started";

  const referenceDay = new Date(referenceDate.getFullYear(), referenceDate.getMonth(), referenceDate.getDate());
  if (startedAt > referenceDay) return "Not started";

  let years = referenceDay.getFullYear() - startedAt.getFullYear();
  let months = referenceDay.getMonth() - startedAt.getMonth();

  if (referenceDay.getDate() < startedAt.getDate()) {
    months -= 1;
  }

  if (months < 0) {
    years -= 1;
    months += 12;
  }

  if (years <= 0 && months <= 0) {
    return "Less than 1 month";
  }

  const parts: string[] = [];

  if (years > 0) {
    parts.push(`${years} ${years === 1 ? "year" : "years"}`);
  }

  if (months > 0) {
    parts.push(`${months} ${months === 1 ? "month" : "months"}`);
  }

  return parts.join(" ");
}
