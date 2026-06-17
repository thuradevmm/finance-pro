export function calculateUsageDuration(startDate: string, referenceDate = new Date()) {
  const startedAt = new Date(startDate);

  if (!startDate || Number.isNaN(startedAt.getTime())) {
    return "Not started";
  }

  let years = referenceDate.getFullYear() - startedAt.getFullYear();
  let months = referenceDate.getMonth() - startedAt.getMonth();

  if (referenceDate.getDate() < startedAt.getDate()) {
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
