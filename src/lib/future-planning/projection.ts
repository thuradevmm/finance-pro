import { nextCreditCardPaymentDate } from "../accounts/credit-card-dates.ts";

export type ForecastKind = "income" | "expense" | "saving";

export type ForecastSource =
  | "Scheduled"
  | "Subscription"
  | "Debt"
  | "Savings Goal"
  | "Trend";

export type ForecastRecurrence = "Once" | "Weekly" | "Monthly" | "Yearly";

/** A JSON-safe, normalized input from a scheduled transaction or linked module. */
export type ForecastItem = {
  id: string;
  label: string;
  kind: ForecastKind;
  source: ForecastSource;
  recurrence: ForecastRecurrence;
  amount: number;
  category: string;
  startDate: string;
  endDate?: string | null;
  entityType?: string | null;
  entityId?: string | null;
  active?: boolean;
  budgetDate?: string;
  cashTiming?: {
    accountId: string;
    kind: "credit_card_settlement";
    paymentDueDay: number | null;
    statementDay: number | null;
  };
};

/** A cleared historical amount used only when the optional trend is enabled. */
export type HistoricalActualItem = {
  id?: string;
  date: string;
  kind: ForecastKind;
  amount: number;
  category: string;
};

export type ProjectionOptions = {
  startDate: string;
  months: 12 | 24 | 36;
  openingBalance: number;
  openingCardCredits?: Record<string, number>;
  openingSavings: number;
  includeTrend: boolean;
};

export type ProjectionEvent = {
  id: string;
  itemId: string | null;
  label: string;
  date: string;
  kind: ForecastKind;
  source: ForecastSource;
  amount: number;
  /** Full economic amount used by Budget Watch when cash differs. */
  budgetAmount?: number;
  cardAccountId?: string;
  category: string;
  budgetDate?: string;
  entityType?: string;
  entityId?: string;
};

export type MonthlyProjectionRow = {
  monthKey: string;
  year: number;
  month: number;
  monthLabel: string;
  openingBalance: number;
  totalIncome: number;
  totalExpense: number;
  totalSavings: number;
  net: number;
  netCashFlow: number;
  closingBalance: number;
  cumulativeSavings: number;
  expenseCategories: Record<string, number>;
  events: ProjectionEvent[];
};

export type ProjectionSummary = {
  projectedMonths: 12 | 24 | 36;
  openingBalance: number;
  openingSavings: number;
  totalIncome: number;
  totalExpense: number;
  totalSavings: number;
  net: number;
  netCashFlow: number;
  closingBalance: number;
  cumulativeSavings: number;
};

export type FutureProjectionResult = {
  categories: string[];
  rows: MonthlyProjectionRow[];
  summary: ProjectionSummary;
  firstShortfallMonth: string | null;
};

type CalendarDate = {
  year: number;
  month: number;
  day: number;
  iso: string;
};

type TrendAverage = {
  kind: ForecastKind;
  category: string;
  amount: number;
};

const MONTH_LABELS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const;

const AUTO_LINKED_SOURCES = new Set<ForecastSource>([
  "Subscription",
  "Debt",
  "Savings Goal",
]);

function pad(value: number, length = 2) {
  return String(value).padStart(length, "0");
}

function daysInMonth(year: number, month: number) {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function calendarDate(year: number, month: number, day: number): CalendarDate {
  return {
    year,
    month,
    day,
    iso: `${pad(year, 4)}-${pad(month)}-${pad(day)}`,
  };
}

function parseCalendarDate(value: string, fieldName: string): CalendarDate {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) {
    throw new RangeError(`${fieldName} must use YYYY-MM-DD format.`);
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1 || day > daysInMonth(year, month)) {
    throw new RangeError(`${fieldName} is not a valid calendar date.`);
  }

  return calendarDate(year, month, day);
}

function fromUtcDate(date: Date) {
  return calendarDate(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate());
}

function toUtcDate(date: CalendarDate) {
  return new Date(Date.UTC(date.year, date.month - 1, date.day));
}

function addDays(date: CalendarDate, numberOfDays: number) {
  const result = toUtcDate(date);
  result.setUTCDate(result.getUTCDate() + numberOfDays);
  return fromUtcDate(result);
}

function daysBetween(from: CalendarDate, to: CalendarDate) {
  return Math.round((toUtcDate(to).getTime() - toUtcDate(from).getTime()) / 86_400_000);
}

function shiftYearMonth(year: number, month: number, offset: number) {
  const zeroBasedMonth = month - 1 + offset;
  const shiftedYear = year + Math.floor(zeroBasedMonth / 12);
  const shiftedMonth = ((zeroBasedMonth % 12) + 12) % 12 + 1;
  return { year: shiftedYear, month: shiftedMonth };
}

function monthDifference(from: CalendarDate, to: CalendarDate) {
  return (to.year - from.year) * 12 + to.month - from.month;
}

function dateForAnchoredMonth(start: CalendarDate, monthOffset: number) {
  const target = shiftYearMonth(start.year, start.month, monthOffset);
  return calendarDate(
    target.year,
    target.month,
    Math.min(start.day, daysInMonth(target.year, target.month)),
  );
}

function dateForAnchoredYear(start: CalendarDate, yearOffset: number) {
  const targetYear = start.year + yearOffset;
  return calendarDate(
    targetYear,
    start.month,
    Math.min(start.day, daysInMonth(targetYear, start.month)),
  );
}

function isOnOrAfter(date: CalendarDate, boundary: CalendarDate) {
  return date.iso >= boundary.iso;
}

function isOnOrBefore(date: CalendarDate, boundary: CalendarDate) {
  return date.iso <= boundary.iso;
}

function roundMoney(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.round((value + Math.sign(value) * Number.EPSILON) * 100) / 100;
}

function positiveAmount(value: number) {
  return Number.isFinite(value) ? Math.max(0, value) : 0;
}

function normalizedCategory(category: string) {
  return category.trim() || "Uncategorized";
}

function normalizedEntityPart(value: string | null | undefined) {
  return value?.trim().toLocaleLowerCase() ?? "";
}

function expandDates(
  item: ForecastItem,
  horizonStart: CalendarDate,
  horizonEnd: CalendarDate,
) {
  if (item.active === false) return [];

  const itemStart = parseCalendarDate(item.startDate, `Forecast item ${item.id} startDate`);
  const itemEnd = item.endDate
    ? parseCalendarDate(item.endDate, `Forecast item ${item.id} endDate`)
    : horizonEnd;
  const effectiveEnd = itemEnd.iso < horizonEnd.iso ? itemEnd : horizonEnd;
  if (effectiveEnd.iso < itemStart.iso || effectiveEnd.iso < horizonStart.iso) return [];

  const dates: CalendarDate[] = [];
  const pushIfInRange = (date: CalendarDate) => {
    if (isOnOrAfter(date, horizonStart) && isOnOrBefore(date, effectiveEnd)) {
      dates.push(date);
    }
  };

  if (item.recurrence === "Once") {
    pushIfInRange(itemStart);
    return dates;
  }

  if (item.recurrence === "Weekly") {
    const elapsedDays = Math.max(0, daysBetween(itemStart, horizonStart));
    let occurrence = addDays(itemStart, Math.ceil(elapsedDays / 7) * 7);
    while (isOnOrBefore(occurrence, effectiveEnd)) {
      pushIfInRange(occurrence);
      occurrence = addDays(occurrence, 7);
    }
    return dates;
  }

  if (item.recurrence === "Monthly") {
    let offset = Math.max(0, monthDifference(itemStart, horizonStart));
    let occurrence = dateForAnchoredMonth(itemStart, offset);
    if (!isOnOrAfter(occurrence, horizonStart)) {
      offset += 1;
      occurrence = dateForAnchoredMonth(itemStart, offset);
    }
    while (isOnOrBefore(occurrence, effectiveEnd)) {
      pushIfInRange(occurrence);
      offset += 1;
      occurrence = dateForAnchoredMonth(itemStart, offset);
    }
    return dates;
  }

  let yearOffset = Math.max(0, horizonStart.year - itemStart.year);
  let occurrence = dateForAnchoredYear(itemStart, yearOffset);
  if (!isOnOrAfter(occurrence, horizonStart)) {
    yearOffset += 1;
    occurrence = dateForAnchoredYear(itemStart, yearOffset);
  }
  while (isOnOrBefore(occurrence, effectiveEnd)) {
    pushIfInRange(occurrence);
    yearOffset += 1;
    occurrence = dateForAnchoredYear(itemStart, yearOffset);
  }
  return dates;
}

function eventFromItem(item: ForecastItem, date: CalendarDate): ProjectionEvent {
  const entityType = item.entityType?.trim();
  const entityId = item.entityId?.trim();
  const settlementDate = item.cashTiming?.kind === "credit_card_settlement"
    ? nextCreditCardPaymentDate({
      paymentDueDay: item.cashTiming.paymentDueDay,
      referenceDate: date.iso,
      statementDay: item.cashTiming.statementDay,
    })
    : "";
  return {
    id: `${item.id}:${date.iso}`,
    itemId: item.id,
    label: item.label,
    date: settlementDate || date.iso,
    kind: item.kind,
    source: item.source,
    amount: roundMoney(positiveAmount(item.amount)),
    category: normalizedCategory(item.category),
    ...(item.budgetDate || settlementDate ? { budgetDate: item.budgetDate || date.iso } : {}),
    ...(item.cashTiming?.accountId ? { cardAccountId: item.cashTiming.accountId } : {}),
    ...(entityType ? { entityType } : {}),
    ...(entityId ? { entityId } : {}),
  };
}

function applyOpeningCardCredits(events: ProjectionEvent[], openingCardCredits: Record<string, number> | undefined) {
  if (!openingCardCredits) return events;
  const remainingByAccount = new Map(
    Object.entries(openingCardCredits)
      .map(([accountId, amount]) => [accountId, roundMoney(Math.max(positiveAmount(amount), 0))] as const)
      .filter(([accountId, amount]) => Boolean(accountId) && amount > 0),
  );
  if (remainingByAccount.size === 0) return events;

  const cardExpenses = events
    .filter((event) => event.kind === "expense" && event.cardAccountId && remainingByAccount.has(event.cardAccountId))
    .sort((first, second) => (
      (first.budgetDate ?? first.date).localeCompare(second.budgetDate ?? second.date)
      || first.date.localeCompare(second.date)
      || first.id.localeCompare(second.id)
    ));

  for (const event of cardExpenses) {
    const accountId = event.cardAccountId as string;
    const remainingCredit = remainingByAccount.get(accountId) ?? 0;
    const budgetAmount = event.amount;
    const creditApplied = Math.min(remainingCredit, budgetAmount);
    event.budgetAmount = budgetAmount;
    event.amount = roundMoney(budgetAmount - creditApplied);
    remainingByAccount.set(accountId, roundMoney(remainingCredit - creditApplied));
  }
  return events;
}

function removeLinkedAutoDuplicates(events: ProjectionEvent[]) {
  const scheduledExactKeys = new Set<string>();
  const scheduledWildcardKeys = new Set<string>();
  const scheduledEntityDateKeys = new Set<string>();

  for (const event of events) {
    if (event.source !== "Scheduled") continue;
    const entityId = normalizedEntityPart(event.entityId);
    if (!entityId) continue;

    const entityDateKey = `${entityId}\u0000${event.budgetDate ?? event.date}`;
    const entityType = normalizedEntityPart(event.entityType);
    scheduledEntityDateKeys.add(entityDateKey);
    if (entityType) {
      scheduledExactKeys.add(`${entityType}\u0000${entityDateKey}`);
    } else {
      scheduledWildcardKeys.add(entityDateKey);
    }
  }

  return events.filter((event) => {
    if (!AUTO_LINKED_SOURCES.has(event.source)) return true;
    const entityId = normalizedEntityPart(event.entityId);
    if (!entityId) return true;

    const entityDateKey = `${entityId}\u0000${event.budgetDate ?? event.date}`;
    const entityType = normalizedEntityPart(event.entityType);
    if (!entityType) return !scheduledEntityDateKeys.has(entityDateKey);
    return !scheduledWildcardKeys.has(entityDateKey)
      && !scheduledExactKeys.has(`${entityType}\u0000${entityDateKey}`);
  });
}

function trendKey(kind: ForecastKind, category: string) {
  return `${kind}\u0000${normalizedCategory(category).toLocaleLowerCase()}`;
}

function calculateTrendAverages(
  actuals: HistoricalActualItem[],
  horizonStart: CalendarDate,
): TrendAverage[] {
  const trendWindowStartMonth = shiftYearMonth(horizonStart.year, horizonStart.month, -3);
  const windowStart = calendarDate(trendWindowStartMonth.year, trendWindowStartMonth.month, 1);
  const windowEnd = addDays(calendarDate(horizonStart.year, horizonStart.month, 1), -1);
  const totals = new Map<string, { kind: ForecastKind; category: string; total: number }>();

  for (const actual of actuals) {
    const date = parseCalendarDate(actual.date, `Historical actual ${actual.id ?? "item"} date`);
    if (!isOnOrAfter(date, windowStart) || !isOnOrBefore(date, windowEnd)) continue;

    const amount = roundMoney(actual.amount);
    if (amount === 0) continue;
    const category = normalizedCategory(actual.category);
    const key = trendKey(actual.kind, category);
    const current = totals.get(key);
    if (current) {
      current.total += amount;
    } else {
      totals.set(key, { kind: actual.kind, category, total: amount });
    }
  }

  return [...totals.values()]
    .map(({ kind, category, total }) => ({
      kind,
      category,
      // Missing months are deliberately zero: this is a true three-month average.
      amount: roundMoney(Math.max(total / 3, 0)),
    }))
    .filter((trend) => trend.amount > 0)
    .sort((left, right) => trendKey(left.kind, left.category).localeCompare(trendKey(right.kind, right.category)));
}

function addTrendEvents(
  events: ProjectionEvent[],
  averages: TrendAverage[],
  horizonStart: CalendarDate,
  months: ProjectionOptions["months"],
) {
  if (averages.length === 0) return events;

  const explicitTotals = new Map<string, number>();
  for (const event of events) {
    const key = `${event.date.slice(0, 7)}\u0000${trendKey(event.kind, event.category)}`;
    explicitTotals.set(key, roundMoney((explicitTotals.get(key) ?? 0) + event.amount));
  }
  const result = [...events];

  for (let monthOffset = 0; monthOffset < months; monthOffset += 1) {
    const target = shiftYearMonth(horizonStart.year, horizonStart.month, monthOffset);
    const monthKey = `${pad(target.year, 4)}-${pad(target.month)}`;
    const isStartingMonth = monthOffset === 0;
    const targetDays = daysInMonth(target.year, target.month);
    const remainingMonthRatio = isStartingMonth
      ? (targetDays - horizonStart.day + 1) / targetDays
      : 1;
    const eventDate = isStartingMonth
      ? horizonStart.iso
      : `${monthKey}-01`;

    for (const average of averages) {
      const key = `${monthKey}\u0000${trendKey(average.kind, average.category)}`;
      const baselineAmount = roundMoney(average.amount * remainingMonthRatio);
      const amount = roundMoney(Math.max(baselineAmount - (explicitTotals.get(key) ?? 0), 0));
      if (amount <= 0) continue;
      result.push({
        id: `trend:${average.kind}:${encodeURIComponent(average.category)}:${monthKey}`,
        itemId: null,
        label: `3-month ${average.kind} baseline remainder — ${average.category}`,
        date: eventDate,
        kind: average.kind,
        source: "Trend",
        amount,
        category: average.category,
      });
    }
  }

  return result;
}

function compareEvents(left: ProjectionEvent, right: ProjectionEvent) {
  return left.date.localeCompare(right.date)
    || left.source.localeCompare(right.source)
    || left.label.localeCompare(right.label)
    || left.id.localeCompare(right.id);
}

function makeEmptyRows(start: CalendarDate, months: ProjectionOptions["months"]): MonthlyProjectionRow[] {
  return Array.from({ length: months }, (_, offset) => {
    const target = shiftYearMonth(start.year, start.month, offset);
    return {
      monthKey: `${pad(target.year, 4)}-${pad(target.month)}`,
      year: target.year,
      month: target.month,
      monthLabel: MONTH_LABELS[target.month - 1],
      openingBalance: 0,
      totalIncome: 0,
      totalExpense: 0,
      totalSavings: 0,
      net: 0,
      netCashFlow: 0,
      closingBalance: 0,
      cumulativeSavings: 0,
      expenseCategories: {},
      events: [],
    };
  });
}

/**
 * Builds a deterministic monthly forecast without reading external state.
 * Savings are reserved cash: they reduce spendable balance and increase the
 * separate cumulative-savings total.
 */
export function buildFutureProjection(
  forecastItems: ForecastItem[],
  historicalActuals: HistoricalActualItem[],
  options: ProjectionOptions,
): FutureProjectionResult {
  if (![12, 24, 36].includes(options.months)) {
    throw new RangeError("Projection months must be 12, 24, or 36.");
  }

  const horizonStart = parseCalendarDate(options.startDate, "Projection startDate");
  const finalMonth = shiftYearMonth(horizonStart.year, horizonStart.month, options.months - 1);
  const horizonEnd = calendarDate(
    finalMonth.year,
    finalMonth.month,
    daysInMonth(finalMonth.year, finalMonth.month),
  );

  const expandedEvents = forecastItems
    .filter((item) => options.includeTrend || item.source !== "Trend")
    .flatMap((item) => expandDates(item, horizonStart, horizonEnd).map((date) => eventFromItem(item, date)))
    .filter((event) => event.amount > 0);
  let events = applyOpeningCardCredits(
    removeLinkedAutoDuplicates(expandedEvents),
    options.openingCardCredits,
  );

  if (options.includeTrend) {
    events = addTrendEvents(
      events,
      calculateTrendAverages(historicalActuals, horizonStart),
      horizonStart,
      options.months,
    );
  }
  events.sort(compareEvents);

  const rows = makeEmptyRows(horizonStart, options.months);
  const rowsByMonth = new Map(rows.map((row) => [row.monthKey, row]));
  const categorySet = new Set<string>();

  for (const event of events) {
    const row = rowsByMonth.get(event.date.slice(0, 7));
    if (!row) continue;
    row.events.push(event);

    if (event.kind === "income") {
      row.totalIncome += event.amount;
    } else if (event.kind === "expense") {
      row.totalExpense += event.amount;
      categorySet.add(event.category);
      row.expenseCategories[event.category] = roundMoney(
        (row.expenseCategories[event.category] ?? 0) + event.amount,
      );
    } else {
      row.totalSavings += event.amount;
    }
  }

  const categories = [...categorySet].sort((left, right) => left.localeCompare(right));
  let balance = roundMoney(options.openingBalance);
  let cumulativeSavings = roundMoney(options.openingSavings);

  for (const row of rows) {
    row.totalIncome = roundMoney(row.totalIncome);
    row.totalExpense = roundMoney(row.totalExpense);
    row.totalSavings = roundMoney(row.totalSavings);
    row.openingBalance = balance;
    row.netCashFlow = roundMoney(row.totalIncome - row.totalExpense - row.totalSavings);
    row.net = row.netCashFlow;
    row.closingBalance = roundMoney(row.openingBalance + row.netCashFlow);
    cumulativeSavings = roundMoney(cumulativeSavings + row.totalSavings);
    row.cumulativeSavings = cumulativeSavings;
    balance = row.closingBalance;

    const categoryAmounts = row.expenseCategories;
    row.expenseCategories = Object.fromEntries(
      categories.map((category) => [category, roundMoney(categoryAmounts[category] ?? 0)]),
    );
  }

  const totalIncome = roundMoney(rows.reduce((total, row) => total + row.totalIncome, 0));
  const totalExpense = roundMoney(rows.reduce((total, row) => total + row.totalExpense, 0));
  const totalSavings = roundMoney(rows.reduce((total, row) => total + row.totalSavings, 0));
  const netCashFlow = roundMoney(totalIncome - totalExpense - totalSavings);

  return {
    categories,
    rows,
    summary: {
      projectedMonths: options.months,
      openingBalance: roundMoney(options.openingBalance),
      openingSavings: roundMoney(options.openingSavings),
      totalIncome,
      totalExpense,
      totalSavings,
      net: netCashFlow,
      netCashFlow,
      closingBalance: balance,
      cumulativeSavings,
    },
    firstShortfallMonth: rows.find((row) => row.closingBalance < 0)?.monthKey ?? null,
  };
}
