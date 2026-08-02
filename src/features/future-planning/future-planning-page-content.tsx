"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, type FormEvent } from "react";

import {
  archiveFuturePlanningColumn,
  createFuturePlanningColumn,
  moveFuturePlanningColumn,
  saveFuturePlanningAmount,
  saveFuturePlanningYears,
} from "@/app/future-planning/settings-actions";
import { Icon } from "@/components/ui/icon";
import { SelectInput, TextInput } from "@/components/ui/form-controls";
import { useToast } from "@/components/ui/toast-provider";
import { cleanAmountInputValue, formatAmountInputValue, formatMmk, parseAmountInputValue } from "@/lib/currency";
import type { CategoryRecord } from "@/lib/categories/supabase";
import { planningControlStatus } from "@/lib/future-planning/category-controls";
import {
  buildManualFuturePlanningTable,
  normalizePlanningYears,
  type FuturePlanningAmount,
  type FuturePlanningColumn,
  type FuturePlanningColumnDirection,
  type FuturePlanningColumnMoveDirection,
} from "@/lib/future-planning/manual-table";
import { categoryTypeLabel, planningDirectionLabel } from "@/lib/transactions/terminology";

type FuturePlanningPageContentProps = {
  amounts: FuturePlanningAmount[];
  categories: CategoryRecord[];
  columns: FuturePlanningColumn[];
  selectedYears: number[];
};

const stickyYearColumnWidth = 84;
const stickyMonthColumnWidth = 144;

function directionLabel(direction: FuturePlanningColumnDirection) {
  return planningDirectionLabel(direction);
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

function controlComparison(actual: number, planned: number, direction: FuturePlanningColumnDirection) {
  const control = planningControlStatus(actual, planned, direction);
  const statusTone = control.label === "Over plan" || control.label === "Below target" || control.label === "Plan needed"
    ? "text-[#b42318]"
    : control.label === "Near limit"
      ? "text-[#92400e]"
      : "text-[#047857]";
  return (
    <span className="mt-1 block text-[11px] font-semibold text-[#45464d]">
      Actual {formatMmk(actual)} · <span className={statusTone}>{control.label}</span>
      {planned > 0 ? <span className="block">{control.usagePercent}% used · {formatMmk(control.remaining)} remaining</span> : null}
    </span>
  );
}

function ManualPlanningSettings({
  categories,
  columns,
  onArchiveColumn,
  selectedYears,
}: {
  categories: CategoryRecord[];
  columns: FuturePlanningColumn[];
  onArchiveColumn: (columnId: string) => Promise<void>;
  selectedYears: number[];
}) {
  const router = useRouter();
  const { showError, showSuccess } = useToast();
  const [yearInput, setYearInput] = useState(selectedYears.join(", "));
  const eligibleCategories = categories.filter((category) => category.status === "Active"
    && ["Expense", "Income", "Savings Goal"].includes(category.type)
    && !columns.some((column) => column.categoryId === category.id));
  const categoryOptions = eligibleCategories.map((category) => `${categoryTypeLabel(category.type)} · ${category.name}`);
  const [categoryOption, setCategoryOption] = useState(categoryOptions[0] ?? "No available categories");
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
    const effectiveCategoryOption = categoryOptions.includes(categoryOption) ? categoryOption : categoryOptions[0];
    const category = eligibleCategories.find((item) => `${categoryTypeLabel(item.type)} · ${item.name}` === effectiveCategoryOption);
    if (!category) return showError("Create or restore a Credit, Debit, or Savings Goal category first.");
    setIsAddingColumn(true);
    const result = await createFuturePlanningColumn({ categoryId: category.id });
    setIsAddingColumn(false);
    if (result.error) return showError(result.error);
    showSuccess("Category added to Future Planning.");
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
        <h2 className="text-lg font-semibold text-[#0b1c30]">Planning categories</h2>
        <p className="mb-4 mt-1 text-sm leading-6 text-[#45464d]">Choose an existing category. Names and Credit, Debit, or Saving behavior stay synchronized with Categories.</p>
        <SelectInput
          disabled={eligibleCategories.length === 0}
          label="Category"
          onChange={setCategoryOption}
          options={categoryOptions.length > 0 ? categoryOptions : ["No available categories"]}
          value={categoryOptions.includes(categoryOption) ? categoryOption : categoryOptions[0] ?? "No available categories"}
        />
        <button className="mt-4 inline-flex min-h-11 items-center justify-center rounded-md bg-[#0b1c30] px-4 text-sm font-semibold text-white disabled:opacity-60" disabled={isAddingColumn} type="submit">
          {isAddingColumn ? "Adding…" : "Add category"}
        </button>
        {columns.length > 0 ? (
          <div className="mt-4 flex flex-wrap gap-2 border-t border-[#c6c6cd]/50 pt-4">
            {columns.map((column) => (
              <span className="inline-flex min-h-9 items-center gap-2 rounded-md border border-[#c6c6cd] bg-[#f8f9ff] pl-3 text-xs font-semibold text-[#0b1c30]" key={column.id}>
                {column.name} · {directionLabel(column.direction)}
                <button className="min-h-9 rounded-r-md px-3 text-[#b42318] hover:bg-[#fff1f0]" onClick={() => onArchiveColumn(column.id)} type="button">Remove from plan</button>
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
  movingColumnId,
  onMoveColumn,
  selectedYears,
}: Omit<FuturePlanningPageContentProps, "categories"> & {
  movingColumnId: string;
  onMoveColumn: (columnId: string, direction: FuturePlanningColumnMoveDirection) => Promise<void>;
}) {
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
  const [isScrolledHorizontally, setIsScrolledHorizontally] = useState(false);
  const [savingKey, setSavingKey] = useState("");
  const stickyColumnShadowClass = isScrolledHorizontally ? "shadow-[8px_0_12px_-12px_rgba(11,28,48,0.45)]" : "";
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

  async function persistAmount(columnId: string, monthKey: string, overrideValue?: number) {
    const key = amountKey(columnId, monthKey);
    const value = overrideValue ?? (drafts[key]?.trim() ? parseAmountInputValue(drafts[key]) : 0);
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
        <h2 className="text-lg font-semibold text-[#0b1c30]">Add your first planning category</h2>
        <p className="mt-1 text-sm text-[#45464d]">Choose a category above, then enter its monthly budget-control amount here.</p>
      </section>
    );
  }

  return (
    <section className="min-w-0 max-w-full overflow-hidden rounded-lg border border-[#c6c6cd]/70 bg-white shadow-sm" aria-labelledby="manual-plan-table-title">
      <div className="border-b border-[#c6c6cd]/60 bg-[#f8f9ff] px-4 py-4">
        <h2 className="text-lg font-semibold text-[#0b1c30]" id="manual-plan-table-title">Planned versus actual</h2>
        <p className="mt-1 text-sm leading-6 text-[#45464d]">Planned amounts are your monthly controls. Actual usage rolls up automatically by category; the six-month average helps you set a realistic amount.</p>
      </div>
      <div
        className="relative isolate max-w-full overflow-x-auto [-webkit-overflow-scrolling:touch]"
        onScroll={(event) => setIsScrolledHorizontally(event.currentTarget.scrollLeft > 1)}
      >
        <table className="border-separate border-spacing-0 text-left text-sm" style={{ minWidth: `${tableWidth}px`, width: "100%" }}>
          <colgroup>
            <col style={{ width: `${stickyYearColumnWidth}px` }} />
            <col style={{ width: `${stickyMonthColumnWidth}px` }} />
          </colgroup>
          <thead>
            <tr className="border-b border-[#c6c6cd]/60 bg-[#eff4ff] text-xs font-semibold uppercase text-[#45464d]">
              <th className="sticky left-0 z-40 box-border border-b border-r border-[#c6c6cd]/60 bg-[#eff4ff] px-4 py-3" style={{ width: `${stickyYearColumnWidth}px`, minWidth: `${stickyYearColumnWidth}px`, maxWidth: `${stickyYearColumnWidth}px` }}>Year</th>
              <th className={`sticky z-40 box-border border-b border-r border-[#c6c6cd]/60 bg-[#eff4ff] px-4 py-3 ${stickyColumnShadowClass}`} style={{ left: `${stickyYearColumnWidth}px`, width: `${stickyMonthColumnWidth}px`, minWidth: `${stickyMonthColumnWidth}px`, maxWidth: `${stickyMonthColumnWidth}px` }}>Month</th>
              <th className="px-4 py-3 text-right">Total Credit</th>
              <th className="px-4 py-3 text-right">Total Debit</th>
              <th className="px-4 py-3 text-right">Total saving</th>
              {columns.map((column, columnIndex) => (
                <th className="min-w-52 px-4 py-3 text-right" key={column.id}>
                  <span className="flex items-start justify-end gap-2">
                    <span>
                      {column.name}
                      <span className="block text-[10px] normal-case text-[#76777d]">
                        {movingColumnId === column.id ? "Moving…" : directionLabel(column.direction)}
                      </span>
                      <span className="mt-1 block text-[10px] normal-case text-[#0058be]">6-mo avg {formatMmk(column.monthlyAverage)}</span>
                      {column.linkedSavingsGoals.length > 0 ? (
                        <span className="mt-1 block max-w-52 text-[10px] normal-case leading-4 text-[#4f46e5]">
                          Goals: {column.linkedSavingsGoals.map((goal) => goal.name).join(", ")}
                        </span>
                      ) : null}
                    </span>
                    <span className="inline-flex overflow-hidden rounded-md border border-[#c6c6cd] bg-white">
                      <button
                        aria-label={`Move ${column.name} left`}
                        className="grid size-8 place-items-center text-[#45464d] transition hover:bg-[#eff4ff] disabled:cursor-not-allowed disabled:opacity-35"
                        disabled={columnIndex === 0 || Boolean(movingColumnId)}
                        onClick={() => onMoveColumn(column.id, "left")}
                        title="Move planning type left"
                        type="button"
                      >
                        <Icon className="size-4" name="chevronLeft" />
                      </button>
                      <button
                        aria-label={`Move ${column.name} right`}
                        className="grid size-8 place-items-center border-l border-[#c6c6cd] text-[#45464d] transition hover:bg-[#eff4ff] disabled:cursor-not-allowed disabled:opacity-35"
                        disabled={columnIndex === columns.length - 1 || Boolean(movingColumnId)}
                        onClick={() => onMoveColumn(column.id, "right")}
                        title="Move planning type right"
                        type="button"
                      >
                        <Icon className="size-4" name="chevronRight" />
                      </button>
                    </span>
                  </span>
                </th>
              ))}
              <th className="px-4 py-3 text-right">Net</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#c6c6cd]/40">
            {rows.map((row) => (
              <tr className="hover:bg-[#f8f9ff]" key={row.monthKey}>
                <th className="sticky left-0 z-30 box-border border-r border-[#c6c6cd]/60 bg-white px-4 py-3" style={{ width: `${stickyYearColumnWidth}px`, minWidth: `${stickyYearColumnWidth}px`, maxWidth: `${stickyYearColumnWidth}px` }}>{row.year}</th>
                <td className={`sticky z-30 box-border border-r border-[#c6c6cd]/60 bg-white px-4 py-3 font-medium ${stickyColumnShadowClass}`} style={{ left: `${stickyYearColumnWidth}px`, width: `${stickyMonthColumnWidth}px`, minWidth: `${stickyMonthColumnWidth}px`, maxWidth: `${stickyMonthColumnWidth}px` }}>{row.monthLabel}</td>
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
                      {column.monthlyAverage > 0 ? (
                        <button
                          className="mt-1 text-[11px] font-semibold text-[#0058be] hover:underline"
                          onClick={() => {
                            setDrafts((current) => ({ ...current, [key]: String(column.monthlyAverage) }));
                            void persistAmount(column.id, row.monthKey, column.monthlyAverage);
                          }}
                          type="button"
                        >Use 6-mo average</button>
                      ) : null}
                      {savingKey === key ? <span className="mt-1 block text-[11px] font-semibold text-[#0058be]">Saving…</span> : controlComparison(actual, planned, column.direction)}
                    </td>
                  );
                })}
                <td className="whitespace-nowrap px-4 py-3 text-right font-semibold">{formatMmk(row.netAmount)}{comparison(row.actualNetAmount, row.netAmount)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-[#c6c6cd] bg-[#f8f9ff] font-bold">
              <th className={`sticky left-0 z-30 box-border border-r border-t-2 border-[#c6c6cd]/60 bg-[#f8f9ff] px-4 py-3 ${stickyColumnShadowClass}`} colSpan={2} style={{ width: `${stickyYearColumnWidth + stickyMonthColumnWidth}px`, minWidth: `${stickyYearColumnWidth + stickyMonthColumnWidth}px` }}>Selected total</th>
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

export function FuturePlanningPageContent({ amounts, categories, columns, selectedYears }: FuturePlanningPageContentProps) {
  const router = useRouter();
  const { showError, showSuccess } = useToast();
  const [archivedColumnIds, setArchivedColumnIds] = useState<string[]>([]);
  const [columnOrder, setColumnOrder] = useState(columns.map((column) => column.id));
  const [movingColumnId, setMovingColumnId] = useState("");
  const orderByColumnId = new Map(columnOrder.map((columnId, index) => [columnId, index]));
  const visibleColumns = columns
    .filter((column) => !archivedColumnIds.includes(column.id))
    .sort((first, second) => {
      const firstOrder = orderByColumnId.get(first.id);
      const secondOrder = orderByColumnId.get(second.id);
      if (firstOrder != null && secondOrder != null) return firstOrder - secondOrder;
      if (firstOrder != null) return -1;
      if (secondOrder != null) return 1;
      return first.sortOrder - second.sortOrder;
    });

  async function handleArchiveColumn(columnId: string) {
    const result = await archiveFuturePlanningColumn(columnId);
    if (result.error) return showError(result.error);
    setArchivedColumnIds((ids) => [...ids, columnId]);
    showSuccess("Planning type removed.");
    router.refresh();
  }

  async function handleMoveColumn(columnId: string, direction: FuturePlanningColumnMoveDirection) {
    setMovingColumnId(columnId);
    const result = await moveFuturePlanningColumn({ columnId, direction });
    setMovingColumnId("");
    if (result.error) return showError(result.error);
    if (result.orderedColumnIds) setColumnOrder(result.orderedColumnIds);
    showSuccess(`Planning type moved ${direction}.`);
    router.refresh();
  }

  return (
    <>
      <ManualPlanningSettings categories={categories} columns={visibleColumns} onArchiveColumn={handleArchiveColumn} selectedYears={selectedYears} />
      <ManualPlanTable
        amounts={amounts}
        columns={visibleColumns}
        movingColumnId={movingColumnId}
        onMoveColumn={handleMoveColumn}
        selectedYears={selectedYears}
      />
    </>
  );
}
