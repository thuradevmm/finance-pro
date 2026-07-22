export type SalaryPeriod = {
  endDate: string;
  key: string;
  label: string;
  startDate: string;
};

type CalendarDate = {
  day: number;
  month: number;
  year: number;
};

function pad(value: number) {
  return String(value).padStart(2, "0");
}
function daysInMonth(year: number, month: number) {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function parseDate(value: string): CalendarDate {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) throw new RangeError("Salary-period dates must use YYYY-MM-DD format.");
  const result = { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]) };
  if (result.month < 1 || result.month > 12 || result.day < 1 || result.day > daysInMonth(result.year, result.month)) {
    throw new RangeError("Salary-period date is not a valid calendar date.");
  }
  return result;
}

function formatDate(value: CalendarDate) {
  return `${value.year}-${pad(value.month)}-${pad(value.day)}`;
}

function shiftMonth(year: number, month: number, offset: number) {
  const zeroBased = month - 1 + offset;
  return {
    year: year + Math.floor(zeroBased / 12),
    month: ((zeroBased % 12) + 12) % 12 + 1,
  };
}

function boundary(year: number, month: number, startDay: number) {
  const clampedDay = Math.min(startDay, daysInMonth(year, month));
  return formatDate({ day: clampedDay, month, year });
}

function addDays(value: string, count: number) {
  const parsed = parseDate(value);
  const date = new Date(Date.UTC(parsed.year, parsed.month - 1, parsed.day));
  date.setUTCDate(date.getUTCDate() + count);
  return formatDate({ day: date.getUTCDate(), month: date.getUTCMonth() + 1, year: date.getUTCFullYear() });
}

function dayDistance(from: string, to: string) {
  const first = parseDate(from);
  const second = parseDate(to);
  return Math.round((Date.UTC(second.year, second.month - 1, second.day) - Date.UTC(first.year, first.month - 1, first.day)) / 86_400_000);
}

function displayDate(value: string) {
  const date = parseDate(value);
  return new Intl.DateTimeFormat("en-US", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" })
    .format(new Date(Date.UTC(date.year, date.month - 1, date.day)));
}

function normalizeStartDay(value: number) {
  const day = Math.trunc(value);
  if (!Number.isFinite(day) || day < 1 || day > 31) throw new RangeError("Salary-period start day must be from 1 through 31.");
  return day;
}

export function salaryPeriodForDate(referenceDate: string, configuredStartDay: number): SalaryPeriod {
  const reference = parseDate(referenceDate);
  const startDay = normalizeStartDay(configuredStartDay);
  const currentBoundary = boundary(reference.year, reference.month, startDay);
  const startMonth = referenceDate >= currentBoundary
    ? { year: reference.year, month: reference.month }
    : shiftMonth(reference.year, reference.month, -1);
  const nextMonth = shiftMonth(startMonth.year, startMonth.month, 1);
  const startDate = boundary(startMonth.year, startMonth.month, startDay);
  const endDate = addDays(boundary(nextMonth.year, nextMonth.month, startDay), -1);
  return {
    endDate,
    key: startDate,
    label: `${displayDate(startDate)} – ${displayDate(endDate)}`,
    startDate,
  };
}

export function previousSalaryPeriod(period: Pick<SalaryPeriod, "startDate">, configuredStartDay: number) {
  return salaryPeriodForDate(addDays(period.startDate, -1), configuredStartDay);
}

export function salaryPeriodHistory(referenceDate: string, configuredStartDay: number, count: number) {
  const safeCount = Math.max(0, Math.trunc(count));
  const periods: SalaryPeriod[] = [];
  let period = salaryPeriodForDate(referenceDate, configuredStartDay);
  for (let index = 0; index < safeCount; index += 1) {
    periods.push(period);
    period = previousSalaryPeriod(period, configuredStartDay);
  }
  return periods;
}

export function comparablePreviousPeriodEnd(
  referenceDate: string,
  currentPeriod: SalaryPeriod,
  priorPeriod: SalaryPeriod,
) {
  const elapsedDays = Math.max(0, dayDistance(currentPeriod.startDate, referenceDate));
  const candidate = addDays(priorPeriod.startDate, elapsedDays);
  return candidate < priorPeriod.endDate ? candidate : priorPeriod.endDate;
}

export function dateInTimeZone(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    day: "2-digit",
    month: "2-digit",
    timeZone,
    year: "numeric",
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}
