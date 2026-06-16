"use client";

import { useMemo, useState } from "react";

import { Icon } from "@/components/ui/icon";
import type { BudgetCategory, BudgetPeriod, BudgetStatus } from "@/types/finance";

const periods: BudgetPeriod[] = ["Monthly", "Yearly"];

const statusStyles: Record<BudgetStatus, string> = {
  "Under Budget": "bg-[#ecfdf5] text-[#166534]",
  "Near Limit": "bg-[#fffbeb] text-[#92400e]",
  "Over Budget": "bg-[#ffdad6] text-[#93000a]",
};

function parseCurrency(value: string) {
  return Number(value.replace(/[^0-9.-]/g, ""));
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-US", { currency: "USD", maximumFractionDigits: 0, style: "currency" }).format(value);
}

function BudgetPeriodControls({
  activePeriod,
  onPeriodChange,
}: {
  activePeriod: BudgetPeriod;
  onPeriodChange: (period: BudgetPeriod) => void;
}) {
  return (
    <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="inline-flex w-fit items-center rounded-lg border border-[#c6c6cd] bg-white p-1 shadow-sm">
        <button
          aria-label="Previous period"
          className="grid size-8 place-items-center rounded-md text-[#45464d] transition hover:bg-[#eff4ff]"
          type="button"
        >
          <Icon className="size-4" name="chevronLeft" />
        </button>
        <span className="min-w-32 px-3 text-center text-sm font-semibold text-[#0b1c30]">
          {activePeriod === "Monthly" ? "June 2026" : "Year 2026"}
        </span>
        <button
          aria-label="Next period"
          className="grid size-8 place-items-center rounded-md text-[#45464d] transition hover:bg-[#eff4ff]"
          type="button"
        >
          <Icon className="size-4" name="chevronRight" />
        </button>
      </div>

      <div className="inline-flex w-fit rounded-lg border border-[#c6c6cd] bg-white p-1 shadow-sm">
        {periods.map((period) => (
          <button
            aria-pressed={period === activePeriod}
            className={
              period === activePeriod
                ? "h-9 rounded-md bg-[#dce9ff] px-4 text-sm font-semibold text-[#0b1c30]"
                : "h-9 rounded-md px-4 text-sm font-semibold text-[#45464d] transition hover:bg-[#eff4ff]"
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

function OverallBudgetUsage({ budgets }: { budgets: BudgetCategory[] }) {
  const totalBudget = budgets.reduce((sum, budget) => sum + parseCurrency(budget.budget), 0);
  const totalActual = budgets.reduce((sum, budget) => sum + parseCurrency(budget.actual), 0);
  const usagePercent = totalBudget > 0 ? Math.round((totalActual / totalBudget) * 100) : 0;

  return (
    <section className="mb-6 rounded-lg border border-[#c6c6cd]/60 bg-white p-5 shadow-[0_4px_20px_rgba(15,23,42,0.04)]">
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-xl font-semibold text-[#0b1c30]">Overall Budget Usage</h2>
          <p className="mt-1 text-sm text-[#45464d]">You have spent {usagePercent}% of your current limit.</p>
        </div>
        <div className="text-left sm:text-right">
          <span className="text-2xl font-bold text-[#0b1c30]">{formatCurrency(totalActual)}</span>
          <span className="text-base text-[#45464d]"> / {formatCurrency(totalBudget)}</span>
        </div>
      </div>

      <div className="relative h-4 overflow-hidden rounded-full bg-[#dce9ff]">
        <div
          className={`h-full rounded-full transition-all ${usagePercent > 100 ? "bg-[#ba1a1a]" : "bg-[#0058be]"}`}
          style={{ width: `${Math.min(usagePercent, 100)}%` }}
        />
        <div className="absolute bottom-0 top-0 w-0.5 bg-[#45464d]/50" style={{ left: "80%" }} />
      </div>
      <div className="mt-2 flex justify-between text-xs font-semibold uppercase text-[#45464d]">
        <span>$0</span>
        <span>Target 80%</span>
        <span>{formatCurrency(totalBudget)}</span>
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
      <div className="h-1.5 w-24 overflow-hidden rounded-full bg-[#dce9ff]">
        <div className={`h-full rounded-full ${meterColor}`} style={{ width: `${Math.min(budget.usagePercent, 100)}%` }} />
      </div>
    </div>
  );
}

function BudgetBreakdownTable({ budgets }: { budgets: BudgetCategory[] }) {
  return (
    <section className="overflow-hidden rounded-lg border border-[#c6c6cd]/70 bg-white shadow-[0_4px_20px_rgba(15,23,42,0.04)]">
      <div className="flex items-center justify-between border-b border-[#c6c6cd]/50 bg-[#f8f9ff] px-4 py-3">
        <h2 className="text-sm font-bold uppercase text-[#45464d]">Category Breakdown</h2>
        <button className="inline-flex h-9 items-center gap-2 rounded-md px-3 text-sm font-semibold text-[#0058be] transition hover:bg-[#eff4ff]" type="button">
          <Icon className="size-4" name="category" />
          Filter
        </button>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[960px] border-collapse text-left">
          <thead>
            <tr className="border-b border-[#c6c6cd]/50 bg-white">
              <th className="px-4 py-3 text-xs font-semibold uppercase text-[#45464d]">Category</th>
              <th className="px-4 py-3 text-xs font-semibold uppercase text-[#45464d]">Budget</th>
              <th className="px-4 py-3 text-xs font-semibold uppercase text-[#45464d]">Actual</th>
              <th className="px-4 py-3 text-xs font-semibold uppercase text-[#45464d]">Remaining</th>
              <th className="px-4 py-3 text-xs font-semibold uppercase text-[#45464d]">Usage</th>
              <th className="px-4 py-3 text-xs font-semibold uppercase text-[#45464d]">Status</th>
              <th className="w-28 px-4 py-3 text-right text-xs font-semibold uppercase text-[#45464d]">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#c6c6cd]/40 text-sm">
            {budgets.map((budget) => (
              <tr className={budget.status === "Over Budget" ? "bg-[#fff1f0]/50 transition hover:bg-[#fff1f0]" : "transition hover:bg-[#f8f9ff]"} key={budget.id}>
                <td className="px-4 py-4">
                  <div className="flex items-center gap-3">
                    <span className={`grid size-9 place-items-center rounded-md ${budget.bg} ${budget.tone}`}>
                      <Icon className="size-4" name={budget.icon} />
                    </span>
                    <span className="font-semibold text-[#0b1c30]">{budget.category}</span>
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
                    <button
                      aria-label={`Edit ${budget.category} budget`}
                      className="grid size-8 place-items-center rounded-full text-[#45464d] transition hover:bg-[#eff4ff] hover:text-[#0b1c30]"
                      title="Edit budget"
                      type="button"
                    >
                      <Icon className="size-4" name="edit" />
                    </button>
                    <button
                      aria-label={`Delete ${budget.category} budget`}
                      className="grid size-8 place-items-center rounded-full text-[#b42318] transition hover:bg-[#fff1f0]"
                      title="Delete budget"
                      type="button"
                    >
                      <Icon className="size-4" name="trash" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export function BudgetsPageContent({ budgets }: { budgets: BudgetCategory[] }) {
  const [activePeriod, setActivePeriod] = useState<BudgetPeriod>("Monthly");
  const filteredBudgets = useMemo(() => budgets.filter((budget) => budget.period === activePeriod), [activePeriod, budgets]);

  return (
    <>
      <BudgetPeriodControls activePeriod={activePeriod} onPeriodChange={setActivePeriod} />
      <OverallBudgetUsage budgets={filteredBudgets} />
      <BudgetBreakdownTable budgets={filteredBudgets} />
    </>
  );
}
