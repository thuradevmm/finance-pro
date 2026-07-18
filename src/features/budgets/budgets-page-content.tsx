"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";

import { deleteBudget } from "@/app/budgets/actions";
import { SummaryCards } from "@/components/app/summary-cards";
import { Icon } from "@/components/ui/icon";
import { ProgressMeter } from "@/components/ui/progress-meter";
import { RecordActions } from "@/components/ui/record-actions";
import { compareSortValues, SortHeader, type SortDirection } from "@/components/ui/sort-header";
import { useToast } from "@/components/ui/toast-provider";
import { budgetOverlapsSelection, currentBudgetRecords } from "@/lib/budgets/calculations";
import { formatMmk } from "@/lib/currency";
import { getBudgetSummaries, type BudgetRecord } from "@/lib/budgets/supabase";
import type { BudgetCategory, BudgetPeriod, BudgetStatus } from "@/types/finance";

const periods: BudgetPeriod[] = ["Monthly", "Yearly"];
type BudgetSortKey = "actual" | "budget" | "category" | "remaining" | "status" | "usage";

const budgetSortOptions: { label: string; value: BudgetSortKey }[] = [
  { label: "Category", value: "category" },
  { label: "Budget", value: "budget" },
  { label: "Actual", value: "actual" },
  { label: "Remaining", value: "remaining" },
  { label: "Usage", value: "usage" },
  { label: "Status", value: "status" },
];

const statusStyles: Record<BudgetStatus, string> = {
  "Under Budget": "bg-[#ecfdf5] text-[#166534]",
  "Near Limit": "bg-[#fffbeb] text-[#92400e]",
  "Over Budget": "bg-[#ffdad6] text-[#93000a]",
};

function parseCurrency(value: string) {
  return Number(value.replace(/[^0-9.-]/g, ""));
}

function formatCurrency(value: number) {
  return formatMmk(value);
}

function BudgetPeriodControls({
  activePeriod,
  onNavigate,
  onPeriodChange,
  selectedDate,
}: {
  activePeriod: BudgetPeriod;
  onNavigate: (direction: -1 | 1) => void;
  onPeriodChange: (period: BudgetPeriod) => void;
  selectedDate: Date;
}) {
  const selectedLabel = activePeriod === "Monthly"
    ? new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric" }).format(selectedDate)
    : `Year ${selectedDate.getFullYear()}`;

  return (
    <div className="mb-6 flex min-w-0 flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex w-full items-center rounded-lg border border-[#c6c6cd] bg-white p-1 shadow-sm sm:w-fit">
        <button
          aria-label="Previous period"
          className="grid size-11 shrink-0 place-items-center rounded-md text-[#45464d] transition hover:bg-[#eff4ff] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2170e4]/25"
          onClick={() => onNavigate(-1)}
          type="button"
        >
          <Icon className="size-4" name="chevronLeft" />
        </button>
        <span className="min-w-0 flex-1 px-3 text-center text-sm font-semibold text-[#0b1c30] sm:min-w-32">
          {selectedLabel}
        </span>
        <button
          aria-label="Next period"
          className="grid size-11 shrink-0 place-items-center rounded-md text-[#45464d] transition hover:bg-[#eff4ff] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2170e4]/25"
          onClick={() => onNavigate(1)}
          type="button"
        >
          <Icon className="size-4" name="chevronRight" />
        </button>
      </div>

      <div className="flex w-full rounded-lg border border-[#c6c6cd] bg-white p-1 shadow-sm sm:w-fit">
        {periods.map((period) => (
          <button
            aria-pressed={period === activePeriod}
            className={
              period === activePeriod
                ? "min-h-11 flex-1 rounded-md bg-[#dce9ff] px-4 text-sm font-semibold text-[#0b1c30] sm:flex-none"
                : "min-h-11 flex-1 rounded-md px-4 text-sm font-semibold text-[#45464d] transition hover:bg-[#eff4ff] sm:flex-none"
            }
            key={period}
            onClick={() => onPeriodChange(period)}
            type="button"
          >
            {period}
          </button>
        ))}
      </div>
    </div>
  );
}

function OverallBudgetUsage({ budgets }: { budgets: BudgetRecord[] }) {
  const totalBudget = budgets.reduce((sum, budget) => sum + parseCurrency(budget.budget), 0);
  const totalActual = budgets.reduce((sum, budget) => sum + parseCurrency(budget.actual), 0);
  const usagePercent = totalBudget > 0 ? Math.round((totalActual / totalBudget) * 100) : 0;
  const alertPercent = totalBudget > 0
    ? Math.round(budgets.reduce((sum, budget) => sum + budget.amountValue * budget.alertPercentage, 0) / totalBudget)
    : 0;

  return (
    <section className="mb-6 min-w-0 rounded-lg border border-[#c6c6cd]/60 bg-white p-4 shadow-[0_4px_20px_rgba(15,23,42,0.04)] sm:p-5">
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-xl font-semibold text-[#0b1c30]">Overall Budget Usage</h2>
          <p className="mt-1 text-sm text-[#45464d]">You have spent {usagePercent}% of your current limit.</p>
        </div>
        <div className="min-w-0 text-left sm:text-right">
          <span className="amount-value block text-2xl font-bold text-[#0b1c30]">{formatCurrency(totalActual)}</span>
          <span className="amount-value mt-1 block text-base text-[#45464d]">/ {formatCurrency(totalBudget)}</span>
        </div>
      </div>

      <ProgressMeter
        ariaLabel="Overall budget usage"
        className="h-4"
        colorClassName={usagePercent > 100 ? "bg-[#ba1a1a]" : "bg-[#0058be]"}
        markerPercent={alertPercent}
        percent={usagePercent}
      />
      <div className="mt-2 grid min-w-0 grid-cols-1 gap-1 text-xs font-semibold uppercase text-[#45464d] sm:grid-cols-3 sm:gap-2">
        <span>{formatMmk(0)}</span>
        <span className="sm:text-center">Alert {alertPercent}%</span>
        <span className="amount-value min-w-0 text-left sm:text-right">{formatCurrency(totalBudget)}</span>
      </div>
    </section>
  );
}

function UsageMeter({ budget }: { budget: BudgetCategory }) {
  const meterColor =
    budget.status === "Over Budget" ? "bg-[#ba1a1a]" : budget.status === "Near Limit" ? "bg-[#92400e]" : "bg-[#047857]";

  return (
    <div className="flex items-center gap-2">
      <span className={`w-10 text-right text-xs font-bold ${budget.status === "Over Budget" ? "text-[#b42318]" : "text-[#0b1c30]"}`}>
        {budget.usagePercent}%
      </span>
      <ProgressMeter ariaLabel={`${budget.category} budget usage`} className="h-1.5 w-24 shrink-0" colorClassName={meterColor} percent={budget.usagePercent} />
    </div>
  );
}

function BudgetBreakdownTable({ budgets, onDelete }: { budgets: BudgetRecord[]; onDelete: (id: string) => void }) {
  const [sortKey, setSortKey] = useState<BudgetSortKey>("category");
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");
  const sortedBudgets = useMemo(() => {
    function value(budget: BudgetRecord) {
      if (sortKey === "category" || sortKey === "status") return String(budget[sortKey]).toLowerCase();
      if (sortKey === "usage") return budget.usagePercent;
      return parseCurrency(budget[sortKey]);
    }
    return [...budgets].sort((first, second) => compareSortValues(value(first), value(second), sortDirection));
  }, [budgets, sortDirection, sortKey]);

  function handleSort(key: BudgetSortKey) {
    setSortKey((currentKey) => {
      if (currentKey === key) {
        setSortDirection((direction) => (direction === "asc" ? "desc" : "asc"));
        return currentKey;
      }
      setSortDirection(key === "category" || key === "status" ? "asc" : "desc");
      return key;
    });
  }

  return (
    <section className="min-w-0 max-w-full overflow-hidden rounded-lg border border-[#c6c6cd]/70 bg-white shadow-[0_4px_20px_rgba(15,23,42,0.04)]">
      <div className="flex flex-col items-stretch gap-2 border-b border-[#c6c6cd]/50 bg-[#f8f9ff] px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="text-sm font-bold uppercase text-[#45464d]">Category Breakdown</h2>
        <button className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-md px-3 text-sm font-semibold text-[#0058be] transition hover:bg-[#eff4ff] sm:w-auto" type="button">
          <Icon className="size-4" name="category" />
          Filter
        </button>
      </div>
      <div className="hidden max-w-full overflow-x-auto [-webkit-overflow-scrolling:touch] xl:block">
        <table className="w-full min-w-[1040px] border-collapse text-left">
          <thead>
            <tr className="border-b border-[#c6c6cd]/50 bg-white">
              <th className="px-4 py-3 uppercase"><SortHeader onSort={() => handleSort("category")} sortDirection={sortKey === "category" ? sortDirection : undefined}>Category</SortHeader></th>
              <th className="px-4 py-3 uppercase"><SortHeader onSort={() => handleSort("budget")} sortDirection={sortKey === "budget" ? sortDirection : undefined}>Budget</SortHeader></th>
              <th className="px-4 py-3 uppercase"><SortHeader onSort={() => handleSort("actual")} sortDirection={sortKey === "actual" ? sortDirection : undefined}>Actual</SortHeader></th>
              <th className="px-4 py-3 uppercase"><SortHeader onSort={() => handleSort("remaining")} sortDirection={sortKey === "remaining" ? sortDirection : undefined}>Remaining</SortHeader></th>
              <th className="px-4 py-3 uppercase"><SortHeader onSort={() => handleSort("usage")} sortDirection={sortKey === "usage" ? sortDirection : undefined}>Usage</SortHeader></th>
              <th className="px-4 py-3 uppercase"><SortHeader onSort={() => handleSort("status")} sortDirection={sortKey === "status" ? sortDirection : undefined}>Status</SortHeader></th>
              <th className="w-36 px-4 py-3 text-right text-xs font-semibold uppercase text-[#45464d]">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#c6c6cd]/40 text-sm">
            {sortedBudgets.map((budget) => (
              <tr className={budget.status === "Over Budget" ? "bg-[#fff1f0]/50 transition hover:bg-[#fff1f0]" : "transition hover:bg-[#f8f9ff]"} key={budget.id}>
                <td className="px-4 py-4">
                  <div className="flex items-center gap-3">
                    <span className={`grid size-9 place-items-center rounded-md ${budget.bg} ${budget.tone}`}>
                      <Icon className="size-4" name={budget.icon} />
                    </span>
                    <span className="font-semibold text-[#0b1c30]">{budget.category}</span>
                    {budget.planStatus === "Paused" ? <span className="rounded bg-[#f3f4f6] px-2 py-1 text-[10px] font-bold uppercase text-[#45464d]">Paused</span> : null}
                  </div>
                </td>
                <td className="whitespace-nowrap px-4 py-4 font-medium text-[#0b1c30]">{budget.budget}</td>
                <td className={`whitespace-nowrap px-4 py-4 font-semibold ${budget.status === "Over Budget" ? "text-[#b42318]" : "text-[#0b1c30]"}`}>
                  {budget.actual}
                </td>
                <td className={`whitespace-nowrap px-4 py-4 font-medium ${budget.remaining.startsWith("-") ? "text-[#b42318]" : "text-[#047857]"}`}>
                  {budget.remaining}
                </td>
                <td className="px-4 py-4">
                  <UsageMeter budget={budget} />
                </td>
                <td className="px-4 py-4">
                  <span className={`inline-flex rounded px-2 py-1 text-xs font-bold uppercase ${statusStyles[budget.status]}`}>
                    {budget.status}
                  </span>
                </td>
                <td className="px-4 py-4">
                  <div className="flex justify-end gap-1">
                    <RecordActions editHref={`/budgets/${budget.id}/edit`} itemId={budget.id} itemLabel={`${budget.category} budget`} onDelete={onDelete} />
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="grid min-w-0 grid-cols-1 gap-2 border-b border-[#c6c6cd]/40 bg-white p-3 min-[420px]:grid-cols-[minmax(0,1fr)_auto] sm:p-4 xl:hidden">
        <label className="min-w-0">
          <span className="mb-1 block text-xs font-bold uppercase text-[#45464d]">Sort by</span>
          <span className="relative block min-w-0">
            <select
              aria-label="Sort budget cards by"
              className="h-11 w-full appearance-none rounded-md border border-[#c6c6cd] bg-white px-3 pr-10 text-sm font-semibold text-[#0b1c30] outline-none transition focus:border-[#2170e4] focus:ring-2 focus:ring-[#2170e4]/20"
              onChange={(event) => handleSort(event.target.value as BudgetSortKey)}
              value={sortKey}
            >
              {budgetSortOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
            <Icon className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-[#76777d]" name="chevronDown" />
          </span>
        </label>
        <button
          aria-label={`Sort budget cards ${sortDirection === "asc" ? "descending" : "ascending"}`}
          className="inline-flex min-h-11 w-full items-center justify-center gap-2 self-end rounded-md border border-[#c6c6cd] bg-white px-3 text-sm font-semibold text-[#45464d] transition hover:bg-[#eff4ff] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2170e4]/25 min-[420px]:w-auto"
          onClick={() => handleSort(sortKey)}
          type="button"
        >
          <Icon className="size-4" name={sortDirection === "asc" ? "trendingUp" : "trendingDown"} />
          {sortDirection === "asc" ? "Ascending" : "Descending"}
        </button>
      </div>
      <div className="grid min-w-0 gap-3 p-3 sm:grid-cols-2 sm:p-4 xl:hidden">
        {sortedBudgets.map((budget) => (
          <article className={`min-w-0 rounded-lg border p-4 ${budget.status === "Over Budget" ? "border-[#fecaca] bg-[#fffafa]" : "border-[#c6c6cd]/60 bg-white"}`} key={`mobile-${budget.id}`}>
            <div className="flex min-w-0 flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
              <div className="flex min-w-0 items-center gap-3">
                <span className={`grid size-10 shrink-0 place-items-center rounded-md ${budget.bg} ${budget.tone}`}>
                  <Icon className="size-4" name={budget.icon} />
                </span>
                <div className="min-w-0">
                  <h3 className="break-words font-semibold text-[#0b1c30]">{budget.category}</h3>
                  {budget.planStatus === "Paused" ? <span className="mt-1 inline-flex rounded bg-[#f3f4f6] px-2 py-1 text-[10px] font-bold uppercase text-[#45464d]">Paused</span> : null}
                </div>
              </div>
              <span className={`w-fit shrink-0 rounded px-2 py-1 text-xs font-bold uppercase ${statusStyles[budget.status]}`}>{budget.status}</span>
            </div>

            <dl className="mt-4 grid min-w-0 grid-cols-1 gap-3">
              <div className="min-w-0 rounded-md bg-[#f8f9ff] p-3">
                <dt className="text-xs font-bold uppercase text-[#45464d]">Budget</dt>
                <dd className="amount-value mt-1 font-semibold text-[#0b1c30]" title={budget.budget}>{budget.budget}</dd>
              </div>
              <div className="grid min-w-0 grid-cols-1 gap-3 min-[420px]:grid-cols-2">
                <div className="min-w-0 rounded-md bg-[#f8f9ff] p-3">
                  <dt className="text-xs font-bold uppercase text-[#45464d]">Actual</dt>
                  <dd className={`amount-value mt-1 font-semibold ${budget.status === "Over Budget" ? "text-[#b42318]" : "text-[#0b1c30]"}`} title={budget.actual}>{budget.actual}</dd>
                </div>
                <div className="min-w-0 rounded-md bg-[#f8f9ff] p-3">
                  <dt className="text-xs font-bold uppercase text-[#45464d]">Remaining</dt>
                  <dd className={`amount-value mt-1 font-semibold ${budget.remaining.startsWith("-") ? "text-[#b42318]" : "text-[#047857]"}`} title={budget.remaining}>{budget.remaining}</dd>
                </div>
              </div>
            </dl>

            <div className="mt-4 rounded-md border border-[#c6c6cd]/40 bg-white p-3">
              <div className="mb-2 flex items-center justify-between gap-3 text-xs font-bold uppercase text-[#45464d]">
                <span>Usage</span>
                <span>{budget.usagePercent}%</span>
              </div>
              <ProgressMeter
                ariaLabel={`${budget.category} budget usage`}
                className="h-2"
                colorClassName={budget.status === "Over Budget" ? "bg-[#ba1a1a]" : budget.status === "Near Limit" ? "bg-[#92400e]" : "bg-[#047857]"}
                percent={budget.usagePercent}
              />
            </div>

            <div className="mt-4 flex justify-end border-t border-[#c6c6cd]/40 pt-3">
              <RecordActions editHref={`/budgets/${budget.id}/edit`} itemId={budget.id} itemLabel={`${budget.category} budget`} onDelete={onDelete} />
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

export function BudgetsPageContent({ budgets }: { budgets: BudgetRecord[] }) {
  const { showError, showSuccess } = useToast();
  const searchParams = useSearchParams();
  const [activePeriod, setActivePeriod] = useState<BudgetPeriod>("Monthly");
  const [selectedDate, setSelectedDate] = useState(() => new Date());
  const [visibleBudgets, setVisibleBudgets] = useState(budgets);
  const [isPending, setIsPending] = useState(false);
  const search = searchParams.get("q") ?? "";
  const periodBudgets = useMemo(
    () => {
      return visibleBudgets.filter((budget) => {
        return budget.period === activePeriod
          && budgetOverlapsSelection(budget, selectedDate);
      });
    },
    [activePeriod, selectedDate, visibleBudgets],
  );
  const filteredBudgets = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();
    return periodBudgets.filter((budget) => {
      const searchable = `${budget.category} ${budget.period} ${budget.budget} ${budget.actual} ${budget.remaining} ${budget.status}`.toLowerCase();
      return normalizedSearch === "" || searchable.includes(normalizedSearch);
    });
  }, [periodBudgets, search]);
  const activeBudgets = useMemo(
    () => currentBudgetRecords(visibleBudgets, selectedDate, activePeriod),
    [activePeriod, selectedDate, visibleBudgets],
  );
  const summaries = useMemo(() => getBudgetSummaries(activeBudgets, selectedDate), [activeBudgets, selectedDate]);

  function navigatePeriod(direction: -1 | 1) {
    setSelectedDate((current) => {
      const next = new Date(current);
      next.setDate(1);
      if (activePeriod === "Monthly") next.setMonth(next.getMonth() + direction);
      else next.setFullYear(next.getFullYear() + direction);
      return next;
    });
  }

  async function handleDelete(id: string) {
    setIsPending(true);
    const result = await deleteBudget(id);
    setIsPending(false);
    if (result.error) {
      showError(result.error);
      return;
    }
    setVisibleBudgets((items) => items.filter((item) => item.id !== id));
    showSuccess("Budget deleted successfully.");
  }

  return (
    <>
      <BudgetPeriodControls activePeriod={activePeriod} onNavigate={navigatePeriod} onPeriodChange={setActivePeriod} selectedDate={selectedDate} />
      <SummaryCards summaries={summaries} />
      {isPending ? <p className="mb-4 text-sm font-medium text-[#45464d]">Updating budgets…</p> : null}
      <OverallBudgetUsage budgets={activeBudgets} />
      {filteredBudgets.length > 0 ? <BudgetBreakdownTable budgets={filteredBudgets} onDelete={handleDelete} /> : (
        <section className="rounded-lg border border-dashed border-[#c6c6cd] bg-white p-6 text-center sm:p-10">
          <Icon className="mx-auto size-8 text-[#76777d]" name="savings" />
          <h2 className="mt-3 text-lg font-semibold text-[#0b1c30]">No {activePeriod.toLowerCase()} budgets yet</h2>
          <p className="mt-1 text-sm text-[#45464d]">Create a budget to start tracking spending limits.</p>
          <Link className="mt-5 inline-flex min-h-11 items-center justify-center rounded-md bg-[#0b1c30] px-4 text-sm font-semibold text-white" href="/budgets/add">Create Budget</Link>
        </section>
      )}
    </>
  );
}
