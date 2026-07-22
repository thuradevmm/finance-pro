export type SalaryPeriod = {
  endDate: string;
  key: string;
  label: string;
  startDate: string;
};

export type SalaryPaydayRuleMode = "days_before_month_end" | "fixed_day";
export type SalaryWeekendPolicy = "next_business_day" | "none" | "previous_business_day";

export type SalaryPaydayRule = {
  daysBeforeMonthEnd: number;
  ruleMode: SalaryPaydayRuleMode;
  startDay: number;
  weekendPolicy: SalaryWeekendPolicy;
};

export type SalaryPaydayOverride = {
  payday: string;
  salaryMonth: string;
};

type SalaryPaydayConfiguration = number | SalaryPaydayRule;

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
  if (result.year < 1900 || result.year > 9999
    || result.month < 1 || result.month > 12
    || result.day < 1 || result.day > daysInMonth(result.year, result.month)) {
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

function salaryMonth(year: number, month: number) {
  return `${year}-${pad(month)}`;
}

function parseSalaryMonth(value: string) {
  const match = /^(\d{4})-(\d{2})$/.exec(value);
  if (!match) throw new RangeError("Salary months must use YYYY-MM format.");
  const result = { year: Number(match[1]), month: Number(match[2]) };
  if (result.year < 1900 || result.year > 9999 || result.month < 1 || result.month > 12) {
    throw new RangeError("Salary month is not valid.");
  }
  return result;
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
  if (!Number.isInteger(value) || value < 1 || value > 31) throw new RangeError("Salary-period start day must be from 1 through 31.");
  return value;
}

function normalizeDaysBeforeMonthEnd(value: number) {
  if (!Number.isInteger(value) || value < 0 || value > 27) {
    throw new RangeError("Days before month end must be from 0 through 27.");
  }
  return value;
}

function normalizeRule(configuration: SalaryPaydayConfiguration): SalaryPaydayRule {
  if (typeof configuration === "number") {
    return {
      daysBeforeMonthEnd: 0,
      ruleMode: "fixed_day",
      startDay: normalizeStartDay(configuration),
      weekendPolicy: "none",
    };
  }
  if (configuration.ruleMode !== "fixed_day" && configuration.ruleMode !== "days_before_month_end") {
    throw new RangeError("Choose a valid salary payday rule.");
  }
  if (configuration.weekendPolicy !== "none"
    && configuration.weekendPolicy !== "previous_business_day"
    && configuration.weekendPolicy !== "next_business_day") {
    throw new RangeError("Choose a valid weekend payday policy.");
  }
  return {
    daysBeforeMonthEnd: normalizeDaysBeforeMonthEnd(configuration.daysBeforeMonthEnd),
    ruleMode: configuration.ruleMode,
    startDay: normalizeStartDay(configuration.startDay),
    weekendPolicy: configuration.weekendPolicy,
  };
}

function adjustWeekend(value: string, policy: SalaryWeekendPolicy) {
  if (policy === "none") return value;
  const parsed = parseDate(value);
  const weekday = new Date(Date.UTC(parsed.year, parsed.month - 1, parsed.day)).getUTCDay();
  if (weekday !== 0 && weekday !== 6) return value;
  if (policy === "previous_business_day") return addDays(value, weekday === 6 ? -1 : -2);
  return addDays(value, weekday === 6 ? 2 : 1);
}

function overrideMap(overrides: SalaryPaydayOverride[]) {
  return new Map(overrides.map((override) => [override.salaryMonth, override.payday]));
}

function resolvedSalaryPaydayFromRule(
  monthValue: string,
  rule: SalaryPaydayRule,
  overridesByMonth: Map<string, string>,
) {
  const month = parseSalaryMonth(monthValue);
  const manualPayday = overridesByMonth.get(monthValue);
  if (manualPayday) {
    parseDate(manualPayday);
    return manualPayday;
  }

  const unadjusted = rule.ruleMode === "days_before_month_end"
    ? formatDate({
      day: daysInMonth(month.year, month.month) - rule.daysBeforeMonthEnd,
      month: month.month,
      year: month.year,
    })
    : boundary(month.year, month.month, rule.startDay);
  return adjustWeekend(unadjusted, rule.weekendPolicy);
}

function adjacentSalaryMonth(value: string, offset: -1 | 1) {
  const parsed = parseSalaryMonth(value);
  const shifted = shiftMonth(parsed.year, parsed.month, offset);
  return shifted.year >= 1900 && shifted.year <= 9999
    ? salaryMonth(shifted.year, shifted.month)
    : null;
}

export function shiftSalaryMonth(value: string, offset: number) {
  const parsed = parseSalaryMonth(value);
  const shifted = shiftMonth(parsed.year, parsed.month, Math.trunc(offset));
  return salaryMonth(shifted.year, shifted.month);
}

export function resolvedSalaryPayday(
  monthValue: string,
  configuration: SalaryPaydayConfiguration,
  overrides: SalaryPaydayOverride[] = [],
) {
  const rule = normalizeRule(configuration);
  return resolvedSalaryPaydayFromRule(monthValue, rule, overrideMap(overrides));
}

export function salaryPaydaySequenceError(
  configuration: SalaryPaydayConfiguration,
  overrides: SalaryPaydayOverride[],
) {
  let rule: SalaryPaydayRule;
  try {
    rule = normalizeRule(configuration);
  } catch (error) {
    return error instanceof Error ? error.message : "Choose a valid salary payday rule.";
  }
  if (overrides.length === 0) return "";
  const uniqueMonths = new Set<string>();
  const overridesByMonth = new Map<string, string>();
  for (const override of overrides) {
    try {
      parseSalaryMonth(override.salaryMonth);
      parseDate(override.payday);
    } catch (error) {
      return error instanceof Error ? error.message : "Enter valid payday overrides.";
    }
    if (uniqueMonths.has(override.salaryMonth)) return `Only one payday override is allowed for ${override.salaryMonth}.`;
    uniqueMonths.add(override.salaryMonth);
    overridesByMonth.set(override.salaryMonth, override.payday);
  }

  // The recurring rule is monotonic by construction, so an override can only
  // invalidate the boundary before it or the boundary after it. Checking the
  // neighboring logical months avoids walking decades of unaffected months
  // when users keep a long manual-payday history.
  const monthsToCheck = new Set<string>();
  for (const monthValue of uniqueMonths) {
    monthsToCheck.add(monthValue);
    const previousMonth = adjacentSalaryMonth(monthValue, -1);
    const nextMonth = adjacentSalaryMonth(monthValue, 1);
    if (previousMonth) monthsToCheck.add(previousMonth);
    if (nextMonth) monthsToCheck.add(nextMonth);
  }
  for (const monthValue of [...monthsToCheck].sort()) {
    const previousMonth = adjacentSalaryMonth(monthValue, -1);
    if (!previousMonth) continue;
    const previousPayday = resolvedSalaryPaydayFromRule(previousMonth, rule, overridesByMonth);
    const payday = resolvedSalaryPaydayFromRule(monthValue, rule, overridesByMonth);
    if (payday <= previousPayday) {
      return `The payday for ${monthValue} must be after the prior salary month's payday.`;
    }
  }
  return "";
}

export function mergeSalaryPaydayOverrides<T extends SalaryPaydayOverride>(
  directOverrides: T[],
  fallbackOverrides: T[],
) {
  const byMonth = new Map(fallbackOverrides.map((override) => [override.salaryMonth, override]));
  for (const override of directOverrides) byMonth.set(override.salaryMonth, override);
  return [...byMonth.values()].sort((first, second) => second.salaryMonth.localeCompare(first.salaryMonth));
}

function salaryPaydayBoundaries(
  referenceDate: string,
  configuration: SalaryPaydayConfiguration,
  overrides: SalaryPaydayOverride[],
) {
  const reference = parseDate(referenceDate);
  const referenceMonth = salaryMonth(reference.year, reference.month);
  const rule = normalizeRule(configuration);
  const overridesByMonth = overrideMap(overrides);
  const paydays = new Set<string>();
  for (let offset = -36; offset <= 36; offset += 1) {
    paydays.add(resolvedSalaryPaydayFromRule(shiftSalaryMonth(referenceMonth, offset), rule, overridesByMonth));
  }
  return [...paydays].sort();
}

export function salaryPeriodForDate(
  referenceDate: string,
  configuration: SalaryPaydayConfiguration,
  overrides: SalaryPaydayOverride[] = [],
): SalaryPeriod {
  parseDate(referenceDate);
  const sequenceError = salaryPaydaySequenceError(configuration, overrides);
  if (sequenceError) throw new RangeError(sequenceError);
  const boundaries = salaryPaydayBoundaries(referenceDate, configuration, overrides);
  const startDate = boundaries.findLast((payday) => payday <= referenceDate);
  const nextPayday = boundaries.find((payday) => payday > referenceDate);
  if (!startDate || !nextPayday) throw new RangeError("Unable to resolve the salary period around this date.");
  const endDate = addDays(nextPayday, -1);
  return {
    endDate,
    key: startDate,
    label: `${displayDate(startDate)} – ${displayDate(endDate)}`,
    startDate,
  };
}

export function previousSalaryPeriod(
  period: Pick<SalaryPeriod, "startDate">,
  configuration: SalaryPaydayConfiguration,
  overrides: SalaryPaydayOverride[] = [],
) {
  return salaryPeriodForDate(addDays(period.startDate, -1), configuration, overrides);
}

export function salaryPeriodHistory(
  referenceDate: string,
  configuration: SalaryPaydayConfiguration,
  count: number,
  overrides: SalaryPaydayOverride[] = [],
) {
  const safeCount = Math.max(0, Math.trunc(count));
  const periods: SalaryPeriod[] = [];
  let period = salaryPeriodForDate(referenceDate, configuration, overrides);
  for (let index = 0; index < safeCount; index += 1) {
    periods.push(period);
    period = previousSalaryPeriod(period, configuration, overrides);
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
