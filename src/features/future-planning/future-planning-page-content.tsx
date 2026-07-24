"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, type FormEvent } from "react";

import {
  archiveFuturePlanningColumn,
  createFuturePlanningColumn,
  saveFuturePlanningAmount,
  saveFuturePlanningYears,
} from "@/app/future-planning/settings-actions";
import { SelectInput, TextInput } from "@/components/ui/form-controls";
import { useToast } from "@/components/ui/toast-provider";
import { cleanAmountInputValue, formatAmountInputValue, formatMmk, parseAmountInputValue } from "@/lib/currency";
import {
  buildManualFuturePlanningTable,
  normalizePlanningYears,
  type FuturePlanningAmount,
  type FuturePlanningColumn,
  type FuturePlanningColumnDirection,
} from "@/lib/future-planning/manual-table";

type FuturePlanningPageContentProps = {
  amounts: FuturePlanningAmount[];
  columns: FuturePlanningColumn[];
  selectedYears: number[];
};

const directionLabels = ["Income", "Expense", "Saving"];

function directionLabel(direction: FuturePlanningColumnDirection) {
  return `${direction[0].toUpperCase()}${direction.slice(1)}`;
}

function amountKey(columnId: string, monthKey: string) {
  return `${columnId}:${monthKey}`;
}

function comparison(actual: number, planned: number) {
  const variance = actual - planned;
  return (
    <span className="mt-1 block text-[11px] font-semibold text-[#45464d]">
      Actual {formatMmk(actual)} · <span className={variance > 0 ? "text-[#b42318]" : variance < 0 ? "text-[#047857]" : ""}>Δ {formatMmk(variance)}</span>
    </span>
  );
}

function ManualPlanningSettings({
  columns,
  onArchiveColumn,
  selectedYears,
}: {
  columns: FuturePlanningColumn[];
  onArchiveColumn: (columnId: string) => Promise<void>;
  selectedYears: number[];
}) {
  const router = useRouter();
  const { showError, showSuccess } = useToast();
  const [yearInput, setYearInput] = useState(selectedYears.join(", "));
  const [columnName, setColumnName] = useState("");
  const [direction, setDirection] = useState("Expense");
  const [isSavingYears, setIsSavingYears] = useState(false);
  const [isAddingColumn, setIsAddingColumn] = useState(false);

  async function handleSaveYears(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const years = normalizePlanningYears(yearInput.split(/[\s,;]+/).map(Number));
    setIsSavingYears(true);
    const result = await saveFuturePlanningYears(years);
    setIsSavingYears(false);
    if (result.error) return showError(result.error);
    setYearInput(years.join(", "));
    showSuccess("Planning years updated.");
    router.refresh();
  }

  async function handleAddColumn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsAddingColumn(true);
    const result = await createFuturePlanningColumn({
      direction: direction.toLowerCase() as FuturePlanningColumnDirection,
      name: columnName,
    });
    setIsAddingColumn(false);
    if (result.error) return showError(result.error);
    setColumnName("");
    showSuccess("Planning type added.");
    router.refresh();
  }

  return (
    <section className="mb-6 grid min-w-0 gap-4 xl:grid-cols-2" aria-label="Plan table settings">
      <form className="rounded-lg border border-[#c6c6cd]/60 bg-white p-4 shadow-sm sm:p-5" onSubmit={handleSaveYears}>
        <h2 className="text-lg font-semibold text-[#0b1c30]">Planning years</h2>
        <p className="mb-4 mt-1 text-sm leading-6 text-[#45464d]">Choose the years you want to maintain. Non-consecutive years are supported.</p>
        <TextInput label="Years (comma separated)" onChange={setYearInput} placeholder="2026, 2027" value={yearInput} />
        <button className="mt-4 inline-flex min-h-11 items-center justify-center rounded-md bg-[#0b1c30] px-4 text-sm font-semibold text-white disabled:opacity-60" disabled={isSavingYears} type="submit">
          {isSavingYears ? "Saving…" : "Save years"}
        </button>
      </form>

      <form className="rounded-lg border border-[#c6c6cd]/60 bg-white p-4 shadow-sm sm:p-5" onSubmit={handleAddColumn}>
        <h2 className="text-lg font-semibold text-[#0b1c30]">Planning types</h2>
        <p className="mb-4 mt-1 text-sm leading-6 text-[#45464d]">Create as many income, expense, or saving types as you need. They are independent and never pull amounts from another page.</p>
        <div className="grid gap-4 sm:grid-cols-2">
          <TextInput label="Type name" onChange={setColumnName} placeholder="Salary, Rent, Emergency fund…" value={columnName} />
          <SelectInput label="Total group" onChange={setDirection} options={directionLabels} value={direction} />
        </div>
        <button className="mt-4 inline-flex min-h-11 items-center justify-center rounded-md bg-[#0b1c30] px-4 text-sm font-semibold text-white disabled:opacity-60" disabled={isAddingColumn} type="submit">
          {isAddingColumn ? "Adding…" : "Add planning type"}
        </button>
        {columns.length > 0 ? (
          <div className="mt-4 flex flex-wrap gap-2 border-t border-[#c6c6cd]/50 pt-4">
            {columns.map((column) => (
              <span className="inline-flex min-h-9 items-center gap-2 rounded-md border border-[#c6c6cd] bg-[#f8f9ff] pl-3 text-xs font-semibold text-[#0b1c30]" key={column.id}>
                {column.name} · {directionLabel(column.direction)}
                <button className="min-h-9 rounded-r-md px-3 text-[#b42318] hover:bg-[#fff1f0]" onClick={() => onArchiveColumn(column.id)} type="button">Remove</button>
              </span>
            ))}
          </div>
        ) : null}
      </form>
    </section>
  );
}

function ManualPlanTable({
  amounts,
  columns,
  selectedYears,
}: FuturePlanningPageContentProps) {
  const router = useRouter();
  const { showError, showSuccess } = useToast();
  const rows = useMemo(
    () => buildManualFuturePlanningTable([], columns, selectedYears, amounts),
    [amounts, columns, selectedYears],
  );
  const initialDrafts = useMemo(() => Object.fromEntries(amounts.map((amount) => [
    amountKey(amount.columnId, amount.periodMonth.slice(0, 7)),
    amount.amount === 0 ? "" : String(amount.amount),
  ])), [amounts]);
  const [drafts, setDrafts] = useState<Record<string, string>>(initialDrafts);
  const [savingKey, setSavingKey] = useState("");
  const plannedTotals = {
    expense: rows.reduce((sum, row) => sum + row.totalExpense, 0),
    income: rows.reduce((sum, row) => sum + row.totalIncome, 0),
    saving: rows.reduce((sum, row) => sum + row.totalSaving, 0),
  };
  const actualTotals = {
    expense: rows.reduce((sum, row) => sum + row.actualExpense, 0),
    income: rows.reduce((sum, row) => sum + row.actualIncome, 0),
    saving: rows.reduce((sum, row) => sum + row.actualSaving, 0),
  };
  const tableWidth = Math.max(1040, 760 + columns.length * 210);

  async function persistAmount(columnId: string, monthKey: string) {
    const key = amountKey(columnId, monthKey);
    const value = drafts[key]?.trim() ? parseAmountInputValue(drafts[key]) : 0;
    if (!Number.isFinite(value) || value < 0) return showError("Enter a valid planned amount of zero or more.");
    setSavingKey(key);
    const result = await saveFuturePlanningAmount({ amount: value, columnId, periodMonth: `${monthKey}-01` });
    setSavingKey("");
    if (result.error) return showError(result.error);
    showSuccess("Planned amount saved.");
    router.refresh();
  }

  if (columns.length === 0) {
    return (
      <section className="rounded-lg border border-dashed border-[#c6c6cd] bg-white p-8 text-center">
        <h2 className="text-lg font-semibold text-[#0b1c30]">Add your first planning type</h2>
        <p className="mt-1 text-sm text-[#45464d]">Create an income, expense, or saving type above, then enter its monthly predefined amounts here.</p>
      </section>
    );
  }

  return (
    <section className="min-w-0 max-w-full overflow-hidden rounded-lg border border-[#c6c6cd]/70 bg-white shadow-sm" aria-labelledby="manual-plan-table-title">
      <div className="border-b border-[#c6c6cd]/60 bg-[#f8f9ff] px-4 py-4">
        <h2 className="text-lg font-semibold text-[#0b1c30]" id="manual-plan-table-title">Planned versus actual</h2>
        <p className="mt-1 text-sm leading-6 text-[#45464d]">Edit predefined amounts directly. Actual values come only from transactions explicitly linked to that monthly amount and may be higher or lower.</p>
      </div>
      <div className="max-w-full overflow-x-auto [-webkit-overflow-scrolling:touch]">
        <table className="border-collapse text-left text-sm" style={{ minWidth: `${tableWidth}px`, width: "100%" }}>
          <thead>
            <tr className="border-b border-[#c6c6cd]/60 bg-[#eff4ff] text-xs font-semibold uppercase text-[#45464d]">
              <th className="sticky left-0 z-20 w-[76px] bg-[#eff4ff] px-4 py-3">Year</th>
              <th className="sticky left-[76px] z-20 min-w-32 bg-[#eff4ff] px-4 py-3">Month</th>
              <th className="px-4 py-3 text-right">Total income</th>
              <th className="px-4 py-3 text-right">Total expense</th>
              <th className="px-4 py-3 text-right">Total saving</th>
              {columns.map((column) => <th className="min-w-52 px-4 py-3 text-right" key={column.id}>{column.name}<span className="block text-[10px] normal-case text-[#76777d]">{directionLabel(column.direction)}</span></th>)}
              <th className="px-4 py-3 text-right">Net</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#c6c6cd]/40">
            {rows.map((row) => (
              <tr className="hover:bg-[#f8f9ff]" key={row.monthKey}>
                <th className="sticky left-0 z-30 w-[76px] border-r border-[#c6c6cd]/60 bg-white px-4 py-3 shadow-[8px_0_12px_-12px_rgba(11,28,48,0.35)]">{row.year}</th>
                <td className="sticky left-[76px] z-30 min-w-32 border-r border-[#c6c6cd]/60 bg-white px-4 py-3 font-medium shadow-[8px_0_12px_-12px_rgba(11,28,48,0.35)]">{row.monthLabel}</td>
                <td className="whitespace-nowrap px-4 py-3 text-right text-[#047857]">{formatMmk(row.totalIncome)}{comparison(row.actualIncome, row.totalIncome)}</td>
                <td className="whitespace-nowrap px-4 py-3 text-right text-[#b42318]">{formatMmk(row.totalExpense)}{comparison(row.actualExpense, row.totalExpense)}</td>
                <td className="whitespace-nowrap px-4 py-3 text-right text-[#0058be]">{formatMmk(row.totalSaving)}{comparison(row.actualSaving, row.totalSaving)}</td>
                {columns.map((column) => {
                  const key = amountKey(column.id, row.monthKey);
                  const planned = row.columnAmounts[column.id] ?? 0;
                  const actual = row.actualColumnAmounts[column.id] ?? 0;
                  return (
                    <td className="px-4 py-3 text-right" key={column.id}>
                      <input
                        aria-label={`${column.name} planned amount for ${row.monthLabel} ${row.year}`}
                        className="h-10 w-36 rounded-md border border-[#c6c6cd] bg-white px-3 text-right font-semibold text-[#0b1c30] outline-none focus:border-[#2170e4] focus:ring-2 focus:ring-[#2170e4]/20"
                        onBlur={() => persistAmount(column.id, row.monthKey)}
                        onChange={(event) => setDrafts((current) => ({ ...current, [key]: cleanAmountInputValue(event.target.value) }))}
                        placeholder="0"
                        inputMode="decimal"
                        type="text"
                        value={formatAmountInputValue(drafts[key] ?? (planned === 0 ? "" : String(planned)))}
                      />
                      {savingKey === key ? <span className="mt-1 block text-[11px] font-semibold text-[#0058be]">Saving…</span> : comparison(actual, planned)}
                    </td>
                  );
                })}
                <td className="whitespace-nowrap px-4 py-3 text-right font-semibold">{formatMmk(row.netAmount)}{comparison(row.actualNetAmount, row.netAmount)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-[#c6c6cd] bg-[#f8f9ff] font-bold">
              <th className="sticky left-0 z-30 border-r border-[#c6c6cd]/60 bg-[#f8f9ff] px-4 py-3 shadow-[8px_0_12px_-12px_rgba(11,28,48,0.35)]" colSpan={2}>Selected total</th>
              {(["income", "expense", "saving"] as const).map((group) => (
                <td className="whitespace-nowrap px-4 py-3 text-right" key={group}>
                  {formatMmk(plannedTotals[group])}
                  {comparison(actualTotals[group], plannedTotals[group])}
                </td>
              ))}
              {columns.map((column) => {
                const planned = rows.reduce((sum, row) => sum + (row.columnAmounts[column.id] ?? 0), 0);
                const actual = rows.reduce((sum, row) => sum + (row.actualColumnAmounts[column.id] ?? 0), 0);
                return <td className="whitespace-nowrap px-4 py-3 text-right" key={column.id}>{formatMmk(planned)}{comparison(actual, planned)}</td>;
              })}
              <td className="whitespace-nowrap px-4 py-3 text-right">{formatMmk(plannedTotals.income - plannedTotals.expense - plannedTotals.saving)}{comparison(actualTotals.income - actualTotals.expense - actualTotals.saving, plannedTotals.income - plannedTotals.expense - plannedTotals.saving)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </section>
  );
}

export function FuturePlanningPageContent({ amounts, columns, selectedYears }: FuturePlanningPageContentProps) {
  const router = useRouter();
  const { showError, showSuccess } = useToast();
  const [archivedColumnIds, setArchivedColumnIds] = useState<string[]>([]);
  const visibleColumns = columns.filter((column) => !archivedColumnIds.includes(column.id));

  async function handleArchiveColumn(columnId: string) {
    const result = await archiveFuturePlanningColumn(columnId);
    if (result.error) return showError(result.error);
    setArchivedColumnIds((ids) => [...ids, columnId]);
    showSuccess("Planning type removed.");
    router.refresh();
  }

  return (
    <>
      <ManualPlanningSettings columns={visibleColumns} onArchiveColumn={handleArchiveColumn} selectedYears={selectedYears} />
      <ManualPlanTable amounts={amounts} columns={visibleColumns} selectedYears={selectedYears} />
    </>
  );
}
