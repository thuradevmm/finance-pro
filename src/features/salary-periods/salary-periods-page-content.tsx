"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { saveSalaryPeriodSettings } from "@/app/salary-periods/actions";
import { SummaryCards } from "@/components/app/summary-cards";
import { Icon } from "@/components/ui/icon";
import { LoadingButton } from "@/components/ui/loading-state";
import { ProgressMeter } from "@/components/ui/progress-meter";
import { useToast } from "@/components/ui/toast-provider";
import { formatMmk } from "@/lib/currency";
import {
  SALARY_USED_EXPLANATION,
  salaryChangeSentiment,
  type SalaryComparisonMetric,
} from "@/lib/salary-periods/calculations";
import type { SalaryPeriodData } from "@/lib/salary-periods/supabase";
import type { SummaryMetric } from "@/types/finance";

function changeLabel(change: { amount: number; percent: number | null }) {
  if (change.amount === 0) return "No change";
  const direction = change.amount > 0 ? "+" : "−";
  const amount = formatMmk(Math.abs(change.amount));
  return change.percent == null
    ? `${direction}${amount}`
    : `${direction}${amount} (${Math.abs(change.percent)}%)`;
}

function changeTone(metric: SalaryComparisonMetric, amount: number) {
  const sentiment = salaryChangeSentiment(metric, amount);
  if (sentiment === "favorable") return "text-[#047857]";
  if (sentiment === "adverse") return "text-[#b42318]";
  return "text-[#45464d]";
}

function transactionHref(startDate: string, endDate: string, type?: "Expense" | "Income") {
  const params = new URLSearchParams({ dateFrom: startDate, dateTo: endDate });
  if (type) params.set("type", type);
  return `/transactions?${params.toString()}`;
}

export function SalaryPeriodsPageContent({ data }: { data: SalaryPeriodData }) {
  const router = useRouter();
  const { showError, showSuccess } = useToast();
  const [enabled, setEnabled] = useState(data.settings.enabled);
  const [defaultView, setDefaultView] = useState(data.settings.defaultView);
  const [startDay, setStartDay] = useState(String(data.settings.startDay));
  const [isSaving, setIsSaving] = useState(false);

  const summaries: SummaryMetric[] = [
    { bg: "bg-[#ecfdf5]", icon: "trendingUp", label: "Salary Received", tone: "text-[#047857]", value: formatMmk(data.current.salaryIncome) },
    { bg: "bg-[#eef2ff]", icon: "plus", label: "Other Income", tone: "text-[#4f46e5]", value: formatMmk(data.current.otherIncome) },
    { bg: "bg-[#fff1f0]", icon: "trendingDown", label: "Period Spending", tone: "text-[#b42318]", value: formatMmk(data.current.spending) },
    { bg: "bg-[#eff6ff]", icon: "savings", label: "Safe To Spend", tone: "text-[#0058be]", value: formatMmk(data.current.safeToSpend) },
  ];

  async function handleSaveSettings() {
    const day = Number(startDay);
    if (!Number.isInteger(day) || day < 1 || day > 31) {
      showError("Payday must be from day 1 through day 31.");
      return;
    }
    setIsSaving(true);
    try {
      const result = await saveSalaryPeriodSettings({ defaultView, enabled, startDay: day });
      if (result.error) {
        showError(result.error);
        return;
      }
      showSuccess("Salary-period settings saved.");
      router.refresh();
    } catch {
      showError("Salary-period settings could not be saved.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <>
      <section className="mb-6 rounded-lg border border-[#c6c6cd]/60 bg-white p-4 shadow-sm sm:p-5">
        <div className="flex min-w-0 flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="min-w-0">
            <h2 className="text-lg font-semibold text-[#0b1c30]">Salary cycle settings</h2>
            <p className="mt-1 max-w-2xl text-sm leading-6 text-[#45464d]">Your period starts on payday and ends the day before the next payday. Day 29–31 automatically uses the last valid day in shorter months.</p>
          </div>
          <div className="grid min-w-0 gap-3 sm:grid-cols-[9rem_auto_auto] sm:items-end">
            <label className="min-w-0 text-xs font-bold uppercase text-[#45464d]">
              Payday / start day
              <input className="mt-2 h-11 w-full rounded-lg border border-[#c6c6cd] bg-white px-3 text-sm font-semibold text-[#0b1c30] outline-none focus:border-[#2170e4] focus:ring-2 focus:ring-[#2170e4]/20" max={31} min={1} onChange={(event) => setStartDay(event.target.value)} type="number" value={startDay} />
            </label>
            <label className="flex min-h-11 items-center gap-2 rounded-lg border border-[#c6c6cd] px-3 text-sm font-semibold text-[#0b1c30]">
              <input checked={enabled} className="size-4 accent-[#0058be]" onChange={(event) => setEnabled(event.target.checked)} type="checkbox" />
              Enable
            </label>
            <label className="flex min-h-11 items-center gap-2 rounded-lg border border-[#c6c6cd] px-3 text-sm font-semibold text-[#0b1c30]">
              <input checked={defaultView} className="size-4 accent-[#0058be]" disabled={!enabled} onChange={(event) => setDefaultView(event.target.checked)} type="checkbox" />
              Default focus
            </label>
            <LoadingButton className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md bg-[#0b1c30] px-4 text-sm font-semibold text-white sm:col-span-3" isLoading={isSaving} loadingLabel="Saving…" onClick={handleSaveSettings} type="button">
              <Icon className="size-4" name="check" /> Save settings
            </LoadingButton>
          </div>
        </div>
      </section>

      {!data.hasSalaryCategories ? (
        <section className="mb-6 rounded-lg border border-[#fcd34d] bg-[#fffbeb] p-4 text-sm leading-6 text-[#78350f]" role="status">
          <p className="font-semibold">Choose at least one salary category.</p>
          <p className="mt-1">Edit an income category and mark its reporting role as Salary. Other income categories remain separate automatically.</p>
          <Link className="mt-3 inline-flex min-h-11 items-center gap-2 font-semibold text-[#92400e] hover:underline" href="/categories">Manage categories <Icon className="size-4" name="chevronRight" /></Link>
        </section>
      ) : null}

      <div className={!enabled ? "pointer-events-none opacity-55" : ""} aria-disabled={!enabled}>
        <div className="mb-4 flex min-w-0 flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-bold uppercase text-[#0058be]">Current salary period</p>
            <h2 className="mt-1 text-xl font-semibold text-[#0b1c30]">{data.current.period.label}</h2>
            <p className="mt-1 text-sm text-[#45464d]">Calculated through {data.referenceDate} in {data.timezone}.</p>
          </div>
          <Link className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md border border-[#c6c6cd] bg-white px-4 text-sm font-semibold text-[#0058be]" href={transactionHref(data.current.period.startDate, data.referenceDate)}>
            View period transactions <Icon className="size-4" name="chevronRight" />
          </Link>
        </div>

        <SummaryCards summaries={summaries} />

        <div className="mb-6 grid min-w-0 gap-4 lg:grid-cols-2">
          <section className="rounded-lg border border-[#c6c6cd]/60 bg-white p-5 shadow-sm">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-lg font-semibold text-[#0b1c30]">Salary used</h2>
                <p className="mt-1 text-sm text-[#45464d]">{formatMmk(data.current.salaryUsed)} of {formatMmk(data.current.salaryIncome)}</p>
              </div>
              <span className="rounded bg-[#eff6ff] px-2 py-1 text-xs font-bold text-[#0058be]">{data.current.salaryUsagePercent}%</span>
            </div>
            <ProgressMeter ariaLabel="Salary usage" className="mt-4 h-3" colorClassName={data.current.salaryUsagePercent >= 90 ? "bg-[#ba1a1a]" : "bg-[#0058be]"} percent={data.current.salaryUsagePercent} />
            <p className="mt-4 text-xs leading-5 text-[#45464d]">{SALARY_USED_EXPLANATION}</p>
          </section>

          <section className="rounded-lg border border-[#c6c6cd]/60 bg-white p-5 shadow-sm">
            <h2 className="text-lg font-semibold text-[#0b1c30]">Same-point comparison</h2>
            <p className="mt-1 text-sm text-[#45464d]">Compared with the same elapsed days in {data.previousComparable.period.label}.</p>
            <dl className="mt-4 grid gap-3 sm:grid-cols-3">
              {([
                ["Salary", "salaryIncome", data.comparison.salaryIncome],
                ["Other income", "otherIncome", data.comparison.otherIncome],
                ["Spending", "spending", data.comparison.spending],
              ] as const).map(([label, metric, change]) => (
                <div className="rounded-md bg-[#f8f9ff] p-3" key={label}>
                  <dt className="text-xs font-bold uppercase text-[#45464d]">{label}</dt>
                  <dd className={`mt-1 text-sm font-semibold ${changeTone(metric, change.amount)}`}>{changeLabel(change)}</dd>
                </div>
              ))}
            </dl>
          </section>
        </div>

        <section className="mb-6 min-w-0 overflow-hidden rounded-lg border border-[#c6c6cd]/70 bg-white shadow-sm">
          <div className="border-b border-[#c6c6cd]/60 bg-[#f8f9ff] px-4 py-4">
            <h2 className="text-lg font-semibold text-[#0b1c30]">Salary-period history</h2>
            <p className="mt-1 text-sm text-[#45464d]">The current row is partial; earlier rows cover complete salary periods.</p>
          </div>
          <div className="max-w-full overflow-x-auto">
            <table className="w-full min-w-[760px] border-collapse text-left text-sm">
              <thead><tr className="border-b border-[#c6c6cd]/60 bg-[#eff4ff] text-xs font-semibold uppercase text-[#45464d]">
                <th className="px-4 py-3">Period</th><th className="px-4 py-3 text-right">Salary</th><th className="px-4 py-3 text-right">Other Income</th><th className="px-4 py-3 text-right">Spending</th><th className="px-4 py-3 text-right">Safe To Spend</th><th className="px-4 py-3 text-right">Transactions</th>
              </tr></thead>
              <tbody className="divide-y divide-[#c6c6cd]/40">{data.history.map((summary, index) => (
                <tr className="transition hover:bg-[#f8f9ff]" key={summary.period.key}>
                  <td className="px-4 py-3 font-semibold text-[#0b1c30]">{summary.period.label}{index === 0 ? <span className="ml-2 rounded bg-[#dce9ff] px-2 py-0.5 text-[10px] uppercase text-[#004395]">Current</span> : null}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-right text-[#047857]">{formatMmk(summary.salaryIncome)}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-right text-[#4f46e5]">{formatMmk(summary.otherIncome)}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-right text-[#b42318]">{formatMmk(summary.spending)}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-right font-semibold text-[#0058be]">{formatMmk(summary.safeToSpend)}</td>
                  <td className="px-4 py-3 text-right"><Link className="font-semibold text-[#0058be] hover:underline" href={transactionHref(summary.period.startDate, index === 0 ? data.referenceDate : summary.period.endDate)}>{summary.transactionCount}</Link></td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        </section>

        <section className="rounded-lg border border-[#c6c6cd]/60 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-semibold text-[#0b1c30]">Top spending in this period</h2>
          {Object.entries(data.current.expenseByCategory).length > 0 ? (
            <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{Object.entries(data.current.expenseByCategory).slice(0, 8).map(([category, amount]) => (
              <Link className="rounded-md border border-[#c6c6cd]/60 bg-[#f8f9ff] p-3 transition hover:border-[#93c5fd]" href={`${transactionHref(data.current.period.startDate, data.referenceDate, "Expense")}&category=${encodeURIComponent(category)}`} key={category}>
                <p className="truncate text-sm font-semibold text-[#0b1c30]">{category}</p><p className="mt-1 text-sm font-semibold text-[#b42318]">{formatMmk(amount)}</p>
              </Link>
            ))}</div>
          ) : <p className="mt-3 text-sm text-[#45464d]">No finalized spending has been recorded in this salary period.</p>}
        </section>
      </div>
    </>
  );
}
