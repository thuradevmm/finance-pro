"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, type FormEvent } from "react";

import { deleteFutureTransaction } from "@/app/future-planning/actions";
import { archiveFuturePlanningColumn, createFuturePlanningColumn, saveFuturePlanningYears } from "@/app/future-planning/settings-actions";
import { SegmentedTabs } from "@/components/app/segmented-tabs";
import { FilterActions, FilterForm } from "@/components/ui/filter-actions";
import { SelectInput, TextInput } from "@/components/ui/form-controls";
import { Icon } from "@/components/ui/icon";
import { RecordActions } from "@/components/ui/record-actions";
import { SearchField } from "@/components/ui/search-field";
import { SelectFilter } from "@/components/ui/select-filter";
import { useToast } from "@/components/ui/toast-provider";
import type { CategoryRecord } from "@/lib/categories/supabase";
import { formatMmk, formatMmkPreview } from "@/lib/currency";
import { formatDisplayDate } from "@/lib/date-format";
import { buildManualFuturePlanningTable, normalizePlanningYears, type FuturePlanningColumn, type FuturePlanningColumnDirection } from "@/lib/future-planning/manual-table";
import type { FutureTransactionRecord } from "@/lib/future-planning/records";

type PlanningTab = "Plan Table" | "Planned Transactions";

type FuturePlanningPageContentProps = {
  categories: CategoryRecord[];
  columns: FuturePlanningColumn[];
  plannedTransactions: FutureTransactionRecord[];
  selectedYears: number[];
};

type ColumnSourceChoice = {
  direction: FuturePlanningColumnDirection;
  id: string;
  label: string;
  type: "asset" | "budget" | "category" | "debt" | "savings_goal" | "subscription";
};

const planningTabs: PlanningTab[] = ["Plan Table", "Planned Transactions"];
const noColumnSource = "Choose source";
const directionLabels = ["Expense", "Income", "Saving", "Neutral"];

const planStatusStyles: Record<FutureTransactionRecord["status"], string> = {
  Active: "bg-[#ecfdf5] text-[#166534]",
  Paused: "bg-[#f3f4f6] text-[#45464d]",
};

function tableAmount(value: number) {
  return value === 0 ? "—" : formatMmk(value);
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
  const [columnName, setColumnName] = useState("");
  const [sourceLabel, setSourceLabel] = useState(noColumnSource);
  const [directionLabel, setDirectionLabel] = useState("Expense");
  const [isSavingYears, setIsSavingYears] = useState(false);
  const [isAddingColumn, setIsAddingColumn] = useState(false);

  const sourceChoices = useMemo<ColumnSourceChoice[]>(() => [
    ...categories
      .filter((category) => category.status === "Active" && category.scopes.includes("Transactions") && (category.type === "Expense" || category.type === "Income"))
      .map((category): ColumnSourceChoice => ({
        direction: category.type === "Income" ? "income" : "expense",
        id: category.id,
        label: `Category · ${category.name}`,
        type: "category",
      })),
    { direction: "expense", id: "asset", label: "Linked records · Assets", type: "asset" },
    { direction: "expense", id: "budget", label: "Linked records · Budgets", type: "budget" },
    { direction: "expense", id: "debt", label: "Linked records · Debts", type: "debt" },
    { direction: "saving", id: "savings_goal", label: "Linked records · Savings goals", type: "savings_goal" },
    { direction: "expense", id: "subscription", label: "Linked records · Subscriptions", type: "subscription" },
  ], [categories]);

  async function handleSaveYears(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const years = normalizePlanningYears(yearInput.split(/[\s,;]+/).map(Number));
    setIsSavingYears(true);
    const result = await saveFuturePlanningYears(years);
    setIsSavingYears(false);
    if (result.error) {
      showError(result.error);
      return;
    }
    setYearInput(years.join(", "));
    showSuccess("Planning years updated.");
    router.refresh();
  }

  async function handleAddColumn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const source = sourceChoices.find((choice) => choice.label === sourceLabel);
    if (!source) {
      showError("Choose the records that should fill this column.");
      return;
    }
    setIsAddingColumn(true);
    const result = await createFuturePlanningColumn({
      direction: directionLabel.toLowerCase() as FuturePlanningColumnDirection,
      name: columnName,
      sourceId: source.id,
      sourceType: source.type,
    });
    setIsAddingColumn(false);
    if (result.error) {
      showError(result.error);
      return;
    }
    setColumnName("");
    showSuccess("Planning column added.");
    router.refresh();
  }

  function handleSourceChange(label: string) {
    setSourceLabel(label);
    const choice = sourceChoices.find((item) => item.label === label);
    if (choice) setDirectionLabel(`${choice.direction[0].toUpperCase()}${choice.direction.slice(1)}`);
  }

  return (
    <section className="mb-6 grid min-w-0 gap-4 xl:grid-cols-2" aria-label="Plan table settings">
      <form className="rounded-lg border border-[#c6c6cd]/60 bg-white p-4 shadow-sm sm:p-5" onSubmit={handleSaveYears}>
        <h2 className="text-lg font-semibold text-[#0b1c30]">Planning years</h2>
        <p className="mb-4 mt-1 text-sm leading-6 text-[#45464d]">Use one year or mix non-consecutive years. The table is not limited to a rolling 12-month forecast.</p>
        <TextInput label="Years (comma separated)" onChange={setYearInput} placeholder="2026, 2027" value={yearInput} />
        <button className="mt-4 inline-flex min-h-11 items-center justify-center rounded-md bg-[#0b1c30] px-4 text-sm font-semibold text-white disabled:opacity-60" disabled={isSavingYears} type="submit">
          {isSavingYears ? "Saving…" : "Save years"}
        </button>
      </form>

      <form className="rounded-lg border border-[#c6c6cd]/60 bg-white p-4 shadow-sm sm:p-5" onSubmit={handleAddColumn}>
        <h2 className="text-lg font-semibold text-[#0b1c30]">Custom columns</h2>
        <p className="mb-4 mt-1 text-sm leading-6 text-[#45464d]">Name a column, then choose which manually scheduled category or linked module records should fill it. The first matching column controls whether a plan counts as income, expense, saving, or neutral; neutral amounts remain visible without changing net.</p>
        <div className="grid gap-4 sm:grid-cols-2">
          <TextInput label="Column name" onChange={setColumnName} placeholder="College fees" value={columnName} />
          <SelectInput label="Data source" onChange={handleSourceChange} options={[noColumnSource, ...sourceChoices.map((choice) => choice.label)]} value={sourceLabel} />
          <SelectInput label="Amount direction" onChange={setDirectionLabel} options={directionLabels} value={directionLabel} />
        </div>
        <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <button className="inline-flex min-h-11 items-center justify-center rounded-md bg-[#0b1c30] px-4 text-sm font-semibold text-white disabled:opacity-60" disabled={isAddingColumn} type="submit">
            {isAddingColumn ? "Adding…" : "Add column"}
          </button>
          {columns.length > 0 ? <p className="text-xs font-semibold text-[#45464d]">{columns.length} custom column{columns.length === 1 ? "" : "s"}</p> : null}
        </div>
        {columns.length > 0 ? (
          <div className="mt-4 flex flex-wrap gap-2 border-t border-[#c6c6cd]/50 pt-4">
            {columns.map((column) => (
              <span className="inline-flex min-h-9 items-center gap-2 rounded-md border border-[#c6c6cd] bg-[#f8f9ff] pl-3 text-xs font-semibold text-[#0b1c30]" key={column.id}>
                {column.name}
                <button className="min-h-9 rounded-r-md px-3 text-[#b42318] hover:bg-[#fff1f0]" onClick={() => onArchiveColumn(column.id)} type="button">Remove</button>
              </span>
            ))}
          </div>
        ) : null}
      </form>
    </section>
  );
}

function ManualPlanTable({ columns, plans, selectedYears }: { columns: FuturePlanningColumn[]; plans: FutureTransactionRecord[]; selectedYears: number[] }) {
  const rows = useMemo(() => buildManualFuturePlanningTable(plans, columns, selectedYears), [columns, plans, selectedYears]);
  const columnTotals = Object.fromEntries(columns.map((column) => [column.id, rows.reduce((sum, row) => sum + row.columnAmounts[column.id], 0)]));
  const incomeTotal = rows.reduce((sum, row) => sum + row.totalIncome, 0);
  const expenseTotal = rows.reduce((sum, row) => sum + row.totalExpense, 0);
  const savingTotal = rows.reduce((sum, row) => sum + row.totalSaving, 0);
  const netTotal = rows.reduce((sum, row) => sum + row.netAmount, 0);
  const tableWidth = Math.max(900, 650 + columns.length * 160);

  return (
    <section className="min-w-0 max-w-full overflow-hidden rounded-lg border border-[#c6c6cd]/70 bg-white shadow-sm" aria-labelledby="manual-plan-table-title">
      <div className="flex min-w-0 flex-col gap-2 border-b border-[#c6c6cd]/60 bg-[#f8f9ff] px-4 py-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h2 className="text-lg font-semibold text-[#0b1c30]" id="manual-plan-table-title">Future planning table</h2>
          <p className="mt-1 text-sm leading-6 text-[#45464d]" id="manual-plan-table-description">Only active planned transactions you entered are included. Linked amounts are snapshots and do not silently change with another module.</p>
        </div>
        <span className="shrink-0 rounded bg-[#dce9ff] px-2 py-1 text-xs font-bold uppercase text-[#004395]">{rows.length} months</span>
      </div>
      <div className="max-w-full overflow-x-auto [-webkit-overflow-scrolling:touch]">
        <table aria-describedby="manual-plan-table-description" className="border-collapse text-left text-sm" style={{ minWidth: `${tableWidth}px`, width: "100%" }}>
          <thead>
            <tr className="border-b border-[#c6c6cd]/60 bg-[#eff4ff] text-xs font-semibold uppercase text-[#45464d]">
              <th className="sticky left-0 z-20 w-[76px] bg-[#eff4ff] px-4 py-3" scope="col">Year</th>
              <th className="sticky left-[76px] z-20 min-w-32 bg-[#eff4ff] px-4 py-3" scope="col">Month</th>
              <th className="whitespace-nowrap px-4 py-3 text-right" scope="col">Total Earn</th>
              <th className="whitespace-nowrap px-4 py-3 text-right" scope="col">Saving</th>
              {columns.map((column) => <th className="min-w-36 whitespace-nowrap px-4 py-3 text-right" key={column.id} scope="col">{column.name}</th>)}
              <th className="whitespace-nowrap px-4 py-3 text-right" scope="col">Total Expense</th>
              <th className="whitespace-nowrap px-4 py-3 text-right" scope="col">Monthly Net</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#c6c6cd]/40">
            {rows.map((row) => (
              <tr className="transition hover:bg-[#f8f9ff]" key={row.monthKey}>
                <th className="sticky left-0 z-10 w-[76px] bg-white px-4 py-3 font-semibold text-[#0b1c30]" scope="row">{row.year}</th>
                <td className="sticky left-[76px] z-10 min-w-32 bg-white px-4 py-3 font-medium text-[#45464d]">{row.monthLabel}</td>
                <td className="whitespace-nowrap px-4 py-3 text-right font-semibold text-[#047857]">{tableAmount(row.totalIncome)}</td>
                <td className="whitespace-nowrap px-4 py-3 text-right font-semibold text-[#0058be]">{tableAmount(row.totalSaving)}</td>
                {columns.map((column) => <td className="whitespace-nowrap px-4 py-3 text-right text-[#45464d]" key={column.id}>{tableAmount(row.columnAmounts[column.id] ?? 0)}</td>)}
                <td className="whitespace-nowrap px-4 py-3 text-right font-semibold text-[#b45309]">{tableAmount(row.totalExpense)}</td>
                <td className={`whitespace-nowrap px-4 py-3 text-right font-semibold ${row.netAmount >= 0 ? "text-[#047857]" : "text-[#b42318]"}`}>{tableAmount(row.netAmount)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-[#c6c6cd] bg-[#f8f9ff] font-bold text-[#0b1c30]">
              <th className="sticky left-0 z-10 bg-[#f8f9ff] px-4 py-3" colSpan={2} scope="row">Selected total</th>
              <td className="whitespace-nowrap px-4 py-3 text-right text-[#047857]">{formatMmk(incomeTotal)}</td>
              <td className="whitespace-nowrap px-4 py-3 text-right text-[#0058be]">{formatMmk(savingTotal)}</td>
              {columns.map((column) => <td className="whitespace-nowrap px-4 py-3 text-right" key={column.id}>{formatMmk(columnTotals[column.id] ?? 0)}</td>)}
              <td className="whitespace-nowrap px-4 py-3 text-right text-[#b45309]">{formatMmk(expenseTotal)}</td>
              <td className={`whitespace-nowrap px-4 py-3 text-right ${netTotal >= 0 ? "text-[#047857]" : "text-[#b42318]"}`}>{formatMmk(netTotal)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </section>
  );
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
  const [draftSearch, setDraftSearch] = useState("");
  const [draftType, setDraftType] = useState("All types");
  const [draftStatus, setDraftStatus] = useState("All statuses");
  const [appliedSearch, setAppliedSearch] = useState("");
  const [appliedType, setAppliedType] = useState("All types");
  const [appliedStatus, setAppliedStatus] = useState("All statuses");
  const filteredPlans = useMemo(() => {
    const normalizedSearch = appliedSearch.trim().toLowerCase();
    return plans.filter((plan) => {
      const searchable = `${plan.date} ${plan.title} ${plan.type} ${plan.category} ${plan.account} ${plan.accountAmountType} ${plan.status} ${plan.note}`.toLowerCase();
      return (normalizedSearch === "" || searchable.includes(normalizedSearch))
        && (appliedType === "All types" || plan.type === appliedType)
        && (appliedStatus === "All statuses" || plan.status === appliedStatus);
    });
  }, [appliedSearch, appliedStatus, appliedType, plans]);

  function applyFilters(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setAppliedSearch(draftSearch);
    setAppliedType(draftType);
    setAppliedStatus(draftStatus);
  }

  function resetFilters() {
    setDraftSearch("");
    setDraftType("All types");
    setDraftStatus("All statuses");
    setAppliedSearch("");
    setAppliedType("All types");
    setAppliedStatus("All statuses");
  }

  return (
    <section className="min-w-0">
      <FilterForm className="mb-4 flex min-w-0 flex-col gap-3 rounded-lg border border-[#c6c6cd]/60 bg-white p-4 shadow-sm lg:flex-row lg:items-center lg:justify-between" onSubmit={applyFilters}>
        <div className="flex min-w-0 flex-1 flex-col gap-3 sm:flex-row sm:flex-wrap">
          <SearchField className="lg:max-w-md" label="Search planned transactions" onChange={setDraftSearch} placeholder="Search title, category, account..." value={draftSearch} />
          <SelectFilter label="Filter by transaction type" onChange={setDraftType} options={["All types", "Income", "Expense"]} value={draftType} />
          <SelectFilter label="Filter by plan status" onChange={setDraftStatus} options={["All statuses", "Active", "Paused"]} value={draftStatus} />
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <FilterActions onReset={resetFilters} />
          <Link className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-md bg-[#0b1c30] px-4 text-sm font-semibold text-white transition hover:bg-[#1f2937]" href="/future-planning/add">
            <Icon className="size-4" name="plus" />
            Add plan
          </Link>
        </div>
      </FilterForm>

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
                        <p className="mt-1 truncate text-xs text-[#76777d]" title={plan.relatedEntityLabel || plan.note}>{plan.relatedEntityLabel ? `Linked: ${plan.relatedEntityLabel}` : plan.note || "No note"}</p>
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
                          <RecordActions deleteDescription={`Deleting ${plan.title} will remove this occurrence from the future plan.`} deleteTitle="Delete Planned Transaction" editHref={`/future-planning/${plan.id}/edit`} itemId={plan.id} itemLabel={plan.title} onDelete={onDelete} />
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
                {plan.relatedEntityLabel ? <p className="mt-3 truncate text-xs font-semibold text-[#0058be]">Linked: {plan.relatedEntityLabel}</p> : null}
                <div className="mt-4 flex justify-end border-t border-[#c6c6cd]/40 pt-3">
                  <RecordActions deleteDescription={`Deleting ${plan.title} will remove this occurrence from the future plan.`} deleteTitle="Delete Planned Transaction" editHref={`/future-planning/${plan.id}/edit`} itemId={plan.id} itemLabel={plan.title} onDelete={onDelete} />
                </div>
              </article>
            ))}
          </div>
        </>
      ) : (
        <section className="rounded-lg border border-dashed border-[#c6c6cd] bg-white p-6 text-center sm:p-10">
          <Icon className="mx-auto size-9 text-[#76777d]" name="calendar" />
          <h2 className="mt-3 text-lg font-semibold text-[#0b1c30]">{plans.length === 0 ? "No planned transactions yet" : "No plans match these filters"}</h2>
          <p className="mt-1 text-sm text-[#45464d]">{plans.length === 0 ? "Add future income or expenses to build the table." : "Try a different search, type, or status."}</p>
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

export function FuturePlanningPageContent({ categories, columns, plannedTransactions, selectedYears }: FuturePlanningPageContentProps) {
  const router = useRouter();
  const { showError, showSuccess } = useToast();
  const [activeTab, setActiveTab] = useState<PlanningTab>("Plan Table");
  const [plans, setPlans] = useState(plannedTransactions);
  const [archivedColumnIds, setArchivedColumnIds] = useState<string[]>([]);
  const [isDeleting, setIsDeleting] = useState(false);
  const visibleColumns = columns.filter((column) => !archivedColumnIds.includes(column.id));

  async function handleDelete(planId: string) {
    setIsDeleting(true);
    try {
      const result = await deleteFutureTransaction(planId);
      if (result.error) {
        showError(result.error);
        return;
      }
      setPlans((items) => items.filter((item) => item.id !== planId));
      showSuccess("Planned transaction deleted successfully.");
    } catch {
      showError("The planned transaction could not be deleted. Please try again.");
    } finally {
      setIsDeleting(false);
    }
  }

  async function handleArchiveColumn(columnId: string) {
    const result = await archiveFuturePlanningColumn(columnId);
    if (result.error) {
      showError(result.error);
      return;
    }
    setArchivedColumnIds((ids) => [...ids, columnId]);
    showSuccess("Planning column removed. Existing plans were not changed.");
    router.refresh();
  }

  return (
    <>
      <SegmentedTabs activeTab={activeTab} onTabChange={(tab) => setActiveTab(tab as PlanningTab)} tabs={planningTabs} />
      {activeTab === "Plan Table" ? (
        <>
          <ManualPlanningSettings categories={categories} columns={visibleColumns} onArchiveColumn={handleArchiveColumn} selectedYears={selectedYears} />
          <ManualPlanTable columns={visibleColumns} plans={plans} selectedYears={selectedYears} />
        </>
      ) : (
        <PlannedTransactionsPanel isDeleting={isDeleting} onDelete={handleDelete} plans={plans} />
      )}
    </>
  );
}
