"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import { deleteFutureTransaction } from "@/app/future-planning/actions";
import { SegmentedTabs } from "@/components/app/segmented-tabs";
import { SummaryCards } from "@/components/app/summary-cards";
import { Icon, type IconName } from "@/components/ui/icon";
import { RecordActions } from "@/components/ui/record-actions";
import { SearchField } from "@/components/ui/search-field";
import { SelectFilter } from "@/components/ui/select-filter";
import { useToast } from "@/components/ui/toast-provider";
import type { BudgetRecord } from "@/lib/budgets/supabase";
import { formatMmk, formatMmkPreview } from "@/lib/currency";
import { formatDisplayDate } from "@/lib/date-format";
import { getBudgetComparisons, type BudgetComparison } from "@/lib/future-planning/budget-comparisons";
import {
  buildFutureProjection,
  type ForecastItem,
  type HistoricalActualItem,
  type MonthlyProjectionRow,
  type ProjectionOptions,
} from "@/lib/future-planning/projection";
import type { FutureTransactionRecord } from "@/lib/future-planning/records";
import type { FuturePlanningSourceCounts } from "@/lib/future-planning/supabase";
import type { SummaryMetric } from "@/types/finance";

type FuturePlanningPageContentProps = {
  budgets: BudgetRecord[];
  forecastItems: ForecastItem[];
  historicalActuals: HistoricalActualItem[];
  openingBalance: number;
  openingCardCredits: Record<string, number>;
  openingSavings: number;
  plannedTransactions: FutureTransactionRecord[];
  sourceCounts: FuturePlanningSourceCounts;
  today: string;
};

type PlanningTab = "Forecast" | "Planned Transactions";
type Horizon = ProjectionOptions["months"];

const planningTabs: PlanningTab[] = ["Forecast", "Planned Transactions"];
const horizonOptions: Horizon[] = [12, 24, 36];

const planStatusStyles: Record<FutureTransactionRecord["status"], string> = {
  Active: "bg-[#ecfdf5] text-[#166534]",
  Paused: "bg-[#f3f4f6] text-[#45464d]",
};

function monthLabel(monthKey: string, style: "long" | "short" = "long") {
  const match = /^(\d{4})-(\d{2})$/.exec(monthKey);
  if (!match) return monthKey;
  return new Intl.DateTimeFormat("en-US", { month: style, year: "numeric", timeZone: "UTC" }).format(
    new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, 1)),
  );
}

function tableAmount(value: number) {
  return value === 0 ? "—" : formatMmk(value);
}

function categoryAmount(row: MonthlyProjectionRow, category: string) {
  const directAmount = row.expenseCategories[category];
  if (typeof directAmount === "number") return directAmount;
  const normalizedCategory = category.trim().toLowerCase();
  const match = Object.entries(row.expenseCategories).find(([name]) => name.trim().toLowerCase() === normalizedCategory);
  return match?.[1] ?? 0;
}

function ForecastControls({
  horizon,
  includeTrend,
  onHorizonChange,
  onTrendChange,
}: {
  horizon: Horizon;
  includeTrend: boolean;
  onHorizonChange: (horizon: Horizon) => void;
  onTrendChange: (includeTrend: boolean) => void;
}) {
  return (
    <section className="mb-6 flex min-w-0 flex-col gap-4 rounded-lg border border-[#c6c6cd]/60 bg-white p-4 shadow-sm lg:flex-row lg:items-center lg:justify-between">
      <div className="min-w-0">
        <h2 className="text-lg font-semibold text-[#0b1c30]">Forecast settings</h2>
        <p className="mt-1 text-sm text-[#45464d]">Choose a time horizon and optionally fill gaps above known plans with a three-month baseline.</p>
      </div>
      <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-center">
        <div aria-label="Forecast horizon" className="flex w-full rounded-lg border border-[#c6c6cd] bg-[#f8f9ff] p-1 sm:w-auto" role="group">
          {horizonOptions.map((option) => (
            <button
              aria-pressed={horizon === option}
              className={horizon === option
                ? "min-h-11 flex-1 rounded-md bg-[#dce9ff] px-4 text-sm font-semibold text-[#0b1c30] shadow-sm sm:flex-none"
                : "min-h-11 flex-1 rounded-md px-4 text-sm font-semibold text-[#45464d] transition hover:bg-white sm:flex-none"}
              key={option}
              onClick={() => onHorizonChange(option)}
              type="button"
            >
              {option} months
            </button>
          ))}
        </div>
        <button
          aria-checked={includeTrend}
          className="inline-flex min-h-11 items-center justify-between gap-3 rounded-lg border border-[#c6c6cd] bg-white px-3 text-sm font-semibold text-[#0b1c30] transition hover:bg-[#f8f9ff] sm:min-w-48"
          onClick={() => onTrendChange(!includeTrend)}
          role="switch"
          type="button"
        >
          Include 3-month trend
          <span className={`relative h-6 w-11 shrink-0 rounded-full transition ${includeTrend ? "bg-[#0058be]" : "bg-[#c6c6cd]"}`}>
            <span className={`absolute top-0.5 size-5 rounded-full bg-white shadow-sm transition ${includeTrend ? "left-[1.375rem]" : "left-0.5"}`} />
          </span>
        </button>
      </div>
    </section>
  );
}

function ProjectionInsight({ firstShortfallMonth, rows }: { firstShortfallMonth: string | null; rows: MonthlyProjectionRow[] }) {
  const shortfallRow = firstShortfallMonth ? rows.find((row) => row.monthKey === firstShortfallMonth) : undefined;
  const finalRow = rows.at(-1);

  if (shortfallRow) {
    return (
      <section className="mb-6 flex min-w-0 items-start gap-3 rounded-lg border border-[#fecaca] bg-[#fff1f0] p-4" role="status">
        <span className="grid size-10 shrink-0 place-items-center rounded-full bg-white text-[#b42318]">
          <Icon className="size-5" name="trendingDown" />
        </span>
        <div className="min-w-0">
          <h2 className="font-semibold text-[#7f1d1d]">Cash shortfall projected in {monthLabel(shortfallRow.monthKey)}</h2>
          <p className="mt-1 text-sm leading-6 text-[#991b1b]">
            The projected balance reaches {formatMmk(shortfallRow.closingBalance)}. Review planned expenses, contribution timing, or incoming cash before this month.
          </p>
        </div>
      </section>
    );
  }

  return (
    <section className="mb-6 flex min-w-0 items-start gap-3 rounded-lg border border-[#bbf7d0] bg-[#f0fdf4] p-4" role="status">
      <span className="grid size-10 shrink-0 place-items-center rounded-full bg-white text-[#047857]">
        <Icon className="size-5" name="check" />
      </span>
      <div className="min-w-0">
        <h2 className="font-semibold text-[#14532d]">No negative cash balance in this forecast</h2>
        <p className="mt-1 text-sm leading-6 text-[#166534]">
          Your rolling balance stays above zero through {finalRow ? monthLabel(finalRow.monthKey) : "the selected horizon"}. Keep linked schedules current as plans change.
        </p>
      </div>
    </section>
  );
}

function CashFlowChart({ rows }: { rows: MonthlyProjectionRow[] }) {
  const chartRows = rows.slice(0, 12);
  const largestAmount = Math.max(
    1,
    ...chartRows.flatMap((row) => [row.totalIncome, row.totalExpense + row.totalSavings]),
  );

  return (
    <section className="min-w-0 rounded-lg border border-[#c6c6cd]/60 bg-white p-4 shadow-sm sm:p-5">
      <div className="mb-5 flex min-w-0 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h2 className="text-lg font-semibold text-[#0b1c30]">Cash-flow outlook</h2>
          <p className="mt-1 text-sm text-[#45464d]">Income compared with expenses and reserved savings for the next 12 months.</p>
        </div>
        <div className="flex shrink-0 flex-wrap gap-3 text-xs font-semibold text-[#45464d]" aria-label="Chart legend">
          <span className="inline-flex items-center gap-1.5"><span className="size-2.5 rounded-sm bg-[#047857]" />Income</span>
          <span className="inline-flex items-center gap-1.5"><span className="size-2.5 rounded-sm bg-[#d97706]" />Outflow</span>
        </div>
      </div>

      <div className="max-w-full overflow-x-auto pb-1 [-webkit-overflow-scrolling:touch]">
        <div
          aria-label="Monthly income and outflow bar chart"
          className="grid h-64 min-w-[720px] grid-cols-12 gap-2 border-b border-[#c6c6cd]/70 px-2"
          role="img"
        >
          {chartRows.map((row) => {
            const incomeHeight = row.totalIncome > 0 ? Math.max(3, (row.totalIncome / largestAmount) * 100) : 0;
            const outflow = row.totalExpense + row.totalSavings;
            const outflowHeight = outflow > 0 ? Math.max(3, (outflow / largestAmount) * 100) : 0;
            return (
              <div className="flex min-w-0 flex-col justify-end" key={row.monthKey}>
                <div className="flex h-[13.25rem] items-end justify-center gap-1">
                  <div
                    aria-label={`${monthLabel(row.monthKey)} income ${formatMmk(row.totalIncome)}`}
                    className="w-3 rounded-t bg-[#047857] transition-[height] sm:w-4"
                    style={{ height: `${incomeHeight}%` }}
                    title={`${monthLabel(row.monthKey)} income: ${formatMmk(row.totalIncome)}`}
                  />
                  <div
                    aria-label={`${monthLabel(row.monthKey)} outflow ${formatMmk(outflow)}`}
                    className="w-3 rounded-t bg-[#d97706] transition-[height] sm:w-4"
                    style={{ height: `${outflowHeight}%` }}
                    title={`${monthLabel(row.monthKey)} outflow: ${formatMmk(outflow)}`}
                  />
                </div>
                <span className="mt-2 truncate pb-2 text-center text-[11px] font-semibold text-[#45464d]">{row.monthLabel.slice(0, 3)}</span>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function BudgetWatch({ comparisons }: { comparisons: BudgetComparison[] }) {
  const visibleComparisons = comparisons.slice(0, 4);
  const attentionCount = comparisons.filter((comparison) => comparison.status !== "On track").length;

  return (
    <section className="min-w-0 rounded-lg border border-[#c6c6cd]/60 bg-white p-4 shadow-sm sm:p-5">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-lg font-semibold text-[#0b1c30]">Budget watch</h2>
          <p className="mt-1 text-sm text-[#45464d]">Future category spending compared with the remaining active budget.</p>
        </div>
        <span className={`inline-flex shrink-0 rounded px-2 py-1 text-xs font-bold uppercase ${attentionCount > 0 ? "bg-[#fff1f0] text-[#991b1b]" : "bg-[#ecfdf5] text-[#166534]"}`}>
          {attentionCount} alert{attentionCount === 1 ? "" : "s"}
        </span>
      </div>

      {visibleComparisons.length > 0 ? (
        <div className="space-y-4">
          {visibleComparisons.map((comparison) => {
            const warning = comparison.status === "Needs attention";
            const watch = comparison.status === "Watch";
            const meterColor = warning ? "bg-[#ba1a1a]" : watch ? "bg-[#d97706]" : "bg-[#047857]";
            return (
              <article key={comparison.budget.id}>
                <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-[#0b1c30]">{comparison.budget.category}</p>
                    <p className="mt-1 text-xs text-[#45464d]">
                      {formatMmk(comparison.projectedAmount)} planned · {formatMmk(comparison.availableAmount)} available
                    </p>
                  </div>
                  <span className={`shrink-0 text-xs font-bold ${warning ? "text-[#b42318]" : watch ? "text-[#9a3412]" : "text-[#047857]"}`}>
                    {comparison.usagePercent > 999 ? "999%+" : `${comparison.usagePercent}%`}
                  </span>
                </div>
                <div
                  aria-label={`${comparison.budget.category} future budget use`}
                  aria-valuemax={100}
                  aria-valuemin={0}
                  aria-valuenow={Math.min(comparison.usagePercent, 100)}
                  className="mt-2 h-2 overflow-hidden rounded-full bg-[#e5e7eb]"
                  role="progressbar"
                >
                  <div className={`h-full rounded-full ${meterColor}`} style={{ width: `${Math.min(comparison.usagePercent, 100)}%` }} />
                </div>
              </article>
            );
          })}
          <Link className="inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-[#0058be] hover:underline" href="/budgets">
            Review all budgets
            <Icon className="size-4" name="chevronRight" />
          </Link>
        </div>
      ) : (
        <div className="rounded-md border border-dashed border-[#c6c6cd] bg-[#f8f9ff] p-4">
          <p className="text-sm font-medium text-[#45464d]">No active budget overlaps this forecast.</p>
          <Link className="mt-3 inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-[#0058be] hover:underline" href="/budgets/add">
            Create a budget
            <Icon className="size-4" name="chevronRight" />
          </Link>
        </div>
      )}
    </section>
  );
}

function LinkedSources({ counts }: { counts: FuturePlanningSourceCounts }) {
  const sources: Array<{ count: number; description: string; href: string; icon: IconName; label: string; tone: string }> = [
    { count: counts.plannedTransactions, description: "Manual income and expense schedule", href: "/future-planning/add", icon: "calendar", label: "Planned transactions", tone: "bg-[#eff6ff] text-[#0058be]" },
    { count: counts.subscriptions, description: "Active recurring billing schedules", href: "/subscriptions", icon: "subscriptions", label: "Subscriptions", tone: "bg-[#eef2ff] text-[#4f46e5]" },
    { count: counts.debtPayments, description: "Upcoming repayment obligations", href: "/debts", icon: "credit", label: "Debt payments", tone: "bg-[#fff7ed] text-[#9a3412]" },
    { count: counts.savingsGoals, description: "Monthly goal contributions", href: "/savings-goals", icon: "target", label: "Savings goals", tone: "bg-[#ecfdf5] text-[#047857]" },
  ];

  return (
    <section className="my-6 min-w-0">
      <div className="mb-3">
        <h2 className="text-lg font-semibold text-[#0b1c30]">Linked forecast sources</h2>
        <p className="mt-1 text-sm text-[#45464d]">Changes in these modules flow into the projection automatically.</p>
      </div>
      <div className="grid min-w-0 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {sources.map((source) => (
          <Link
            aria-label={`Open ${source.label}`}
            className="group flex min-w-0 items-center gap-3 rounded-lg border border-[#c6c6cd]/60 bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:border-[#93c5fd] hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2170e4]/25"
            href={source.href}
            key={source.label}
          >
            <span className={`grid size-11 shrink-0 place-items-center rounded-lg ${source.tone}`}>
              <Icon className="size-5" name={source.icon} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="flex min-w-0 items-center justify-between gap-2">
                <span className="truncate text-sm font-semibold text-[#0b1c30]">{source.label}</span>
                <span className="shrink-0 rounded-full bg-[#f3f4f6] px-2 py-0.5 text-xs font-bold text-[#45464d]">{source.count}</span>
              </span>
              <span className="mt-1 block text-xs leading-5 text-[#45464d]">{source.description}</span>
            </span>
            <Icon className="size-4 shrink-0 text-[#76777d] transition group-hover:translate-x-0.5 group-hover:text-[#0058be]" name="chevronRight" />
          </Link>
        ))}
      </div>
    </section>
  );
}

function ForecastMatrix({ categories, rows }: { categories: string[]; rows: MonthlyProjectionRow[] }) {
  const categoryTotals = useMemo(
    () => Object.fromEntries(categories.map((category) => [category, rows.reduce((total, row) => total + categoryAmount(row, category), 0)])),
    [categories, rows],
  );
  const totalIncome = rows.reduce((total, row) => total + row.totalIncome, 0);
  const totalExpense = rows.reduce((total, row) => total + row.totalExpense, 0);
  const totalSavings = rows.reduce((total, row) => total + row.totalSavings, 0);
  const totalNet = rows.reduce((total, row) => total + row.netCashFlow, 0);
  const finalRow = rows.at(-1);
  const tableWidth = Math.max(1120, 880 + categories.length * 150);

  return (
    <section className="min-w-0 max-w-full overflow-hidden rounded-lg border border-[#c6c6cd]/70 bg-white shadow-sm" aria-labelledby="monthly-forecast-title">
      <div className="flex min-w-0 flex-col gap-2 border-b border-[#c6c6cd]/60 bg-[#f8f9ff] px-4 py-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h2 className="text-lg font-semibold text-[#0b1c30]" id="monthly-forecast-title">Monthly forecast table</h2>
          <p className="mt-1 text-sm text-[#45464d]" id="monthly-forecast-description">
            A spreadsheet-style view based on the supplied year/month format. Savings are reserved separately and reduce spendable cash.
          </p>
        </div>
        <span className="shrink-0 rounded bg-[#dce9ff] px-2 py-1 text-xs font-bold uppercase text-[#004395]">{rows.length} months</span>
      </div>
      <div className="max-w-full overflow-x-auto [-webkit-overflow-scrolling:touch]">
        <table aria-describedby="monthly-forecast-description" className="border-collapse text-left text-sm" style={{ minWidth: `${tableWidth}px`, width: "100%" }}>
          <thead>
            <tr className="border-b border-[#c6c6cd]/60 bg-[#eff4ff] text-xs font-semibold uppercase text-[#45464d]">
              <th className="sticky left-0 z-20 w-[76px] bg-[#eff4ff] px-4 py-3" scope="col">Year</th>
              <th className="sticky left-[76px] z-20 min-w-32 bg-[#eff4ff] px-4 py-3" scope="col">Month</th>
              <th className="whitespace-nowrap px-4 py-3 text-right" scope="col">Total Earn</th>
              <th className="whitespace-nowrap px-4 py-3 text-right" scope="col">Saving</th>
              {categories.map((category) => <th className="min-w-36 whitespace-nowrap px-4 py-3 text-right" key={category} scope="col">{category}</th>)}
              <th className="whitespace-nowrap px-4 py-3 text-right" scope="col">Total Expense</th>
              <th className="whitespace-nowrap px-4 py-3 text-right" scope="col">Monthly Net</th>
              <th className="whitespace-nowrap px-4 py-3 text-right" scope="col">Projected Balance</th>
              <th className="whitespace-nowrap px-4 py-3 text-right" scope="col">Total Savings</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#c6c6cd]/40">
            {rows.map((row) => (
              <tr className={row.closingBalance < 0 ? "bg-[#fff1f0]/60" : "transition hover:bg-[#f8f9ff]"} key={row.monthKey}>
                <th className={`sticky left-0 z-10 w-[76px] px-4 py-3 font-semibold text-[#0b1c30] ${row.closingBalance < 0 ? "bg-[#fff1f0]" : "bg-white"}`} scope="row">{row.year}</th>
                <td className={`sticky left-[76px] z-10 min-w-32 px-4 py-3 font-medium text-[#45464d] ${row.closingBalance < 0 ? "bg-[#fff1f0]" : "bg-white"}`}>{row.monthLabel}</td>
                <td className="whitespace-nowrap px-4 py-3 text-right font-semibold text-[#047857]" title={formatMmk(row.totalIncome)}>{tableAmount(row.totalIncome)}</td>
                <td className="whitespace-nowrap px-4 py-3 text-right font-semibold text-[#0058be]" title={formatMmk(row.totalSavings)}>{tableAmount(row.totalSavings)}</td>
                {categories.map((category) => {
                  const amount = categoryAmount(row, category);
                  return <td className="whitespace-nowrap px-4 py-3 text-right text-[#45464d]" key={category} title={formatMmk(amount)}>{tableAmount(amount)}</td>;
                })}
                <td className="whitespace-nowrap px-4 py-3 text-right font-semibold text-[#b45309]" title={formatMmk(row.totalExpense)}>{tableAmount(row.totalExpense)}</td>
                <td className={`whitespace-nowrap px-4 py-3 text-right font-semibold ${row.netCashFlow >= 0 ? "text-[#047857]" : "text-[#b42318]"}`} title={formatMmk(row.netCashFlow)}>{formatMmk(row.netCashFlow)}</td>
                <td className={`whitespace-nowrap px-4 py-3 text-right font-bold ${row.closingBalance >= 0 ? "text-[#0b1c30]" : "text-[#b42318]"}`} title={formatMmk(row.closingBalance)}>{formatMmk(row.closingBalance)}</td>
                <td className="whitespace-nowrap px-4 py-3 text-right font-semibold text-[#0058be]" title={formatMmk(row.cumulativeSavings)}>{formatMmk(row.cumulativeSavings)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-[#9ca3af] bg-[#f8f9ff] font-semibold text-[#0b1c30]">
              <th className="sticky left-0 z-10 bg-[#f8f9ff] px-4 py-3" colSpan={2} scope="row">Forecast total</th>
              <td className="whitespace-nowrap px-4 py-3 text-right text-[#047857]">{formatMmk(totalIncome)}</td>
              <td className="whitespace-nowrap px-4 py-3 text-right text-[#0058be]">{formatMmk(totalSavings)}</td>
              {categories.map((category) => <td className="whitespace-nowrap px-4 py-3 text-right" key={category}>{formatMmk(categoryTotals[category] ?? 0)}</td>)}
              <td className="whitespace-nowrap px-4 py-3 text-right text-[#b45309]">{formatMmk(totalExpense)}</td>
              <td className={`whitespace-nowrap px-4 py-3 text-right ${totalNet >= 0 ? "text-[#047857]" : "text-[#b42318]"}`}>{formatMmk(totalNet)}</td>
              <td className={`whitespace-nowrap px-4 py-3 text-right ${finalRow && finalRow.closingBalance < 0 ? "text-[#b42318]" : ""}`}>{formatMmk(finalRow?.closingBalance ?? 0)}</td>
              <td className="whitespace-nowrap px-4 py-3 text-right text-[#0058be]">{formatMmk(finalRow?.cumulativeSavings ?? 0)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </section>
  );
}

function PlanTypeBadge({ type }: { type: FutureTransactionRecord["type"] }) {
  return (
    <span className={`inline-flex rounded px-2 py-1 text-xs font-bold uppercase ${type === "Income" ? "bg-[#ecfdf5] text-[#166534]" : "bg-[#fff7ed] text-[#9a3412]"}`}>
      {type}
    </span>
  );
}

function PlanStatusBadge({ status }: { status: FutureTransactionRecord["status"] }) {
  return <span className={`inline-flex rounded px-2 py-1 text-xs font-bold uppercase ${planStatusStyles[status]}`}>{status}</span>;
}

function PlannedTransactionsPanel({
  isDeleting,
  onDelete,
  plans,
}: {
  isDeleting: boolean;
  onDelete: (id: string) => Promise<void>;
  plans: FutureTransactionRecord[];
}) {
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("All types");
  const [statusFilter, setStatusFilter] = useState("All statuses");
  const filteredPlans = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();
    return plans.filter((plan) => {
      const searchable = `${plan.date} ${plan.title} ${plan.type} ${plan.category} ${plan.account} ${plan.accountAmountType} ${plan.status} ${plan.note}`.toLowerCase();
      return (normalizedSearch === "" || searchable.includes(normalizedSearch))
        && (typeFilter === "All types" || plan.type === typeFilter)
        && (statusFilter === "All statuses" || plan.status === statusFilter);
    });
  }, [plans, search, statusFilter, typeFilter]);

  return (
    <section className="min-w-0">
      <div className="mb-4 flex min-w-0 flex-col gap-3 rounded-lg border border-[#c6c6cd]/60 bg-white p-4 shadow-sm lg:flex-row lg:items-center lg:justify-between">
        <div className="flex min-w-0 flex-1 flex-col gap-3 sm:flex-row sm:flex-wrap">
          <SearchField className="lg:max-w-md" label="Search planned transactions" onChange={setSearch} placeholder="Search title, category, account..." value={search} />
          <SelectFilter label="Filter by transaction type" onChange={setTypeFilter} options={["All types", "Income", "Expense"]} value={typeFilter} />
          <SelectFilter label="Filter by plan status" onChange={setStatusFilter} options={["All statuses", "Active", "Paused"]} value={statusFilter} />
        </div>
        <Link className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-md bg-[#0b1c30] px-4 text-sm font-semibold text-white transition hover:bg-[#1f2937]" href="/future-planning/add">
          <Icon className="size-4" name="plus" />
          Add plan
        </Link>
      </div>

      <div className="mb-3 flex min-w-0 items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-[#0b1c30]">Planned transactions</h2>
          <p className="mt-1 text-sm text-[#45464d]">{filteredPlans.length} of {plans.length} scheduled occurrence{plans.length === 1 ? "" : "s"}</p>
        </div>
        {isDeleting ? <span className="text-sm font-semibold text-[#45464d]" role="status">Deleting…</span> : null}
      </div>

      {filteredPlans.length > 0 ? (
        <>
          <div className="hidden max-w-full overflow-hidden rounded-lg border border-[#c6c6cd]/70 bg-white shadow-sm xl:block">
            <div className="max-w-full overflow-x-auto [-webkit-overflow-scrolling:touch]">
              <table className="w-full min-w-[1120px] border-collapse text-left text-sm">
                <thead>
                  <tr className="border-b border-[#c6c6cd]/60 bg-[#f8f9ff] text-xs font-semibold uppercase text-[#45464d]">
                    <th className="px-4 py-3" scope="col">Date</th>
                    <th className="px-4 py-3" scope="col">Plan</th>
                    <th className="px-4 py-3" scope="col">Type</th>
                    <th className="px-4 py-3" scope="col">Category</th>
                    <th className="px-4 py-3" scope="col">Account</th>
                    <th className="px-4 py-3 text-right" scope="col">Amount</th>
                    <th className="px-4 py-3" scope="col">Status</th>
                    <th className="w-36 px-4 py-3 text-right" scope="col">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#c6c6cd]/40">
                  {filteredPlans.map((plan) => (
                    <tr className="transition hover:bg-[#f8f9ff]" key={plan.id}>
                      <td className="whitespace-nowrap px-4 py-4 text-[#45464d]">{formatDisplayDate(plan.dateValue)}</td>
                      <td className="max-w-64 px-4 py-4">
                        <p className="truncate font-semibold text-[#0b1c30]" title={plan.title}>{plan.title}</p>
                        <p className="mt-1 truncate text-xs text-[#76777d]" title={plan.note}>{plan.note || "No note"}</p>
                      </td>
                      <td className="px-4 py-4"><PlanTypeBadge type={plan.type} /></td>
                      <td className="whitespace-nowrap px-4 py-4 text-[#45464d]">{plan.category}</td>
                      <td className="px-4 py-4">
                        <p className="whitespace-nowrap font-medium text-[#0b1c30]">{plan.account}</p>
                        <p className="mt-1 whitespace-nowrap text-xs text-[#76777d]">{plan.accountAmountType}</p>
                      </td>
                      <td className={`whitespace-nowrap px-4 py-4 text-right font-semibold ${plan.type === "Income" ? "text-[#047857]" : "text-[#b42318]"}`}>
                        {formatMmkPreview(plan.amountValue, plan.type === "Income" ? "positive" : "negative")}
                      </td>
                      <td className="px-4 py-4"><PlanStatusBadge status={plan.status} /></td>
                      <td className="px-4 py-4">
                        <div className="flex justify-end gap-1">
                          <RecordActions
                            deleteDescription={`Deleting ${plan.title} will remove this occurrence from the future forecast.`}
                            deleteTitle="Delete Planned Transaction"
                            editHref={`/future-planning/${plan.id}/edit`}
                            itemId={plan.id}
                            itemLabel={plan.title}
                            onDelete={onDelete}
                          />
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="grid min-w-0 gap-3 xl:hidden">
            {filteredPlans.map((plan) => (
              <article className="min-w-0 rounded-lg border border-[#c6c6cd]/60 bg-white p-4 shadow-sm" key={plan.id}>
                <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <p className="truncate font-semibold text-[#0b1c30]">{plan.title}</p>
                    <p className="mt-1 text-xs font-medium text-[#45464d]">{formatDisplayDate(plan.dateValue)}</p>
                  </div>
                  <p className={`amount-value w-full text-left text-sm font-semibold sm:w-auto sm:text-right ${plan.type === "Income" ? "text-[#047857]" : "text-[#b42318]"}`}>
                    {formatMmkPreview(plan.amountValue, plan.type === "Income" ? "positive" : "negative")}
                  </p>
                </div>
                <div className="mt-4 flex min-w-0 flex-wrap items-center gap-2">
                  <PlanTypeBadge type={plan.type} />
                  <PlanStatusBadge status={plan.status} />
                  <span className="inline-flex max-w-full rounded border border-[#c6c6cd]/60 px-2 py-1 text-xs font-semibold text-[#45464d]">{plan.category}</span>
                  <span className="inline-flex max-w-full rounded border border-[#c6c6cd]/60 px-2 py-1 text-xs font-semibold text-[#45464d]">{plan.account} · {plan.accountAmountType}</span>
                </div>
                {plan.note ? <p className="mt-3 line-clamp-2 text-sm leading-6 text-[#45464d]">{plan.note}</p> : null}
                <div className="mt-4 flex justify-end border-t border-[#c6c6cd]/40 pt-3">
                  <RecordActions
                    deleteDescription={`Deleting ${plan.title} will remove this occurrence from the future forecast.`}
                    deleteTitle="Delete Planned Transaction"
                    editHref={`/future-planning/${plan.id}/edit`}
                    itemId={plan.id}
                    itemLabel={plan.title}
                    onDelete={onDelete}
                  />
                </div>
              </article>
            ))}
          </div>
        </>
      ) : (
        <section className="rounded-lg border border-dashed border-[#c6c6cd] bg-white p-6 text-center sm:p-10">
          <Icon className="mx-auto size-9 text-[#76777d]" name="calendar" />
          <h2 className="mt-3 text-lg font-semibold text-[#0b1c30]">{plans.length === 0 ? "No planned transactions yet" : "No plans match these filters"}</h2>
          <p className="mt-1 text-sm text-[#45464d]">{plans.length === 0 ? "Add future income or expenses to make the forecast more precise." : "Try a different search, type, or status."}</p>
          {plans.length === 0 ? (
            <Link className="mt-5 inline-flex min-h-11 items-center justify-center gap-2 rounded-md bg-[#0b1c30] px-4 text-sm font-semibold text-white" href="/future-planning/add">
              <Icon className="size-4" name="plus" />
              Add planned transaction
            </Link>
          ) : null}
        </section>
      )}
    </section>
  );
}

export function FuturePlanningPageContent({
  budgets,
  forecastItems,
  historicalActuals,
  openingBalance,
  openingCardCredits,
  openingSavings,
  plannedTransactions,
  sourceCounts,
  today,
}: FuturePlanningPageContentProps) {
  const { showError, showSuccess } = useToast();
  const [activeTab, setActiveTab] = useState<PlanningTab>("Forecast");
  const [horizon, setHorizon] = useState<Horizon>(12);
  const [includeTrend, setIncludeTrend] = useState(true);
  const [plans, setPlans] = useState(plannedTransactions);
  const [deletedPlanIds, setDeletedPlanIds] = useState<string[]>([]);
  const [isDeleting, setIsDeleting] = useState(false);

  const projection = useMemo(
    () => buildFutureProjection(
      forecastItems.filter((item) => !deletedPlanIds.includes(item.id)),
      historicalActuals,
      { includeTrend, months: horizon, openingBalance, openingCardCredits, openingSavings, startDate: today },
    ),
    [deletedPlanIds, forecastItems, historicalActuals, horizon, includeTrend, openingBalance, openingCardCredits, openingSavings, today],
  );
  const budgetComparisons = useMemo(() => getBudgetComparisons(budgets, projection.rows), [budgets, projection.rows]);
  const summaries = useMemo<SummaryMetric[]>(() => {
    const totalOutflow = projection.summary.totalExpense + projection.summary.totalSavings;
    return [
      { bg: "bg-[#ecfdf5]", icon: "trendingUp", label: "Forecast Income", tone: "text-[#047857]", value: formatMmk(projection.summary.totalIncome) },
      { bg: "bg-[#fff7ed]", icon: "trendingDown", label: "Forecast Outflow", tone: "text-[#b45309]", value: formatMmk(totalOutflow) },
      { bg: projection.summary.netCashFlow >= 0 ? "bg-[#ecfdf5]" : "bg-[#fff1f0]", icon: projection.summary.netCashFlow >= 0 ? "chart" : "bell", label: "Net Cash Flow", tone: projection.summary.netCashFlow >= 0 ? "text-[#047857]" : "text-[#b42318]", value: formatMmk(projection.summary.netCashFlow) },
      { bg: projection.summary.closingBalance >= 0 ? "bg-[#eff6ff]" : "bg-[#fff1f0]", icon: "account", label: "Projected Balance", tone: projection.summary.closingBalance >= 0 ? "text-[#0058be]" : "text-[#b42318]", value: formatMmk(projection.summary.closingBalance) },
    ];
  }, [projection.summary]);

  async function handleDelete(planId: string) {
    setIsDeleting(true);
    try {
      const result = await deleteFutureTransaction(planId);
      if (result.error) {
        showError(result.error);
        return;
      }
      setPlans((items) => items.filter((item) => item.id !== planId));
      setDeletedPlanIds((ids) => [...ids, planId]);
      showSuccess("Planned transaction deleted successfully.");
    } catch {
      showError("The planned transaction could not be deleted. Please try again.");
    } finally {
      setIsDeleting(false);
    }
  }

  return (
    <>
      <SegmentedTabs activeTab={activeTab} onTabChange={(tab) => setActiveTab(tab as PlanningTab)} tabs={planningTabs} />

      {activeTab === "Forecast" ? (
        <>
          <ForecastControls horizon={horizon} includeTrend={includeTrend} onHorizonChange={setHorizon} onTrendChange={setIncludeTrend} />
          <SummaryCards summaries={summaries} />
          <ProjectionInsight firstShortfallMonth={projection.firstShortfallMonth} rows={projection.rows} />
          <div className="grid min-w-0 gap-4 xl:grid-cols-[minmax(0,1.7fr)_minmax(20rem,0.8fr)]">
            <CashFlowChart rows={projection.rows} />
            <BudgetWatch comparisons={budgetComparisons} />
          </div>
          <LinkedSources counts={{ ...sourceCounts, plannedTransactions: plans.length }} />
          <ForecastMatrix categories={projection.categories} rows={projection.rows} />
        </>
      ) : (
        <PlannedTransactionsPanel isDeleting={isDeleting} onDelete={handleDelete} plans={plans} />
      )}
    </>
  );
}
