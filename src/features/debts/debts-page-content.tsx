"use client";

import { useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";

import { deleteDebt } from "@/app/debts/actions";
import { Icon } from "@/components/ui/icon";
import { ModalShell } from "@/components/ui/modal-shell";
import { ProgressMeter } from "@/components/ui/progress-meter";
import { RecordActions } from "@/components/ui/record-actions";
import { compareSortValues, SortHeader, type SortDirection } from "@/components/ui/sort-header";
import { useToast } from "@/components/ui/toast-provider";
import { formatDisplayDate } from "@/lib/date-format";
import type { DebtRecordWithValues } from "@/lib/debts/supabase";
import type { DebtRecord, DebtStatus, UpcomingDebtPayment } from "@/types/finance";

const statusStyles: Record<DebtStatus, string> = {
  Active: "bg-[#d8e2ff] text-[#004395]",
  Overdue: "bg-[#ffdad6] text-[#93000a]",
  Paid: "bg-[#6ffbbe] text-[#005236]",
};
type DebtSortKey = "monthlyPayment" | "name" | "remainingBalance" | "repaidAmount" | "status" | "totalAmount";

function parseCurrency(value: string) {
  return Number(value.replace(/[^0-9.-]/g, "")) || 0;
}

function DebtProgress({ debt }: { debt: DebtRecord }) {
  const color = debt.status === "Overdue" ? "bg-[#ba1a1a]" : debt.status === "Paid" ? "bg-[#047857]" : "bg-[#0058be]";

  return (
    <div className="mt-3">
      <div className="mb-1 flex items-center justify-between text-xs font-semibold text-[#45464d]">
        <span>Repaid</span>
        <span>{debt.progressPercent}%</span>
      </div>
      <ProgressMeter ariaLabel={`${debt.name} repayment progress`} colorClassName={color} percent={debt.progressPercent} />
    </div>
  );
}

type CalendarEntry = {
  amount: string;
  dateLabel: string;
  debtName: string;
  id: string;
  isOverdue: boolean;
  monthKey: string;
  monthLabel: string;
  timestamp: number;
};

function parseDateInput(value: string) {
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatDateLabel(date: Date) {
  return formatDisplayDate(date);
}

function formatMonthKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function formatMonthLabel(date: Date) {
  return new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric" }).format(date);
}

function buildCalendarEntries(payments: UpcomingDebtPayment[]) {
  const entries = payments.flatMap((payment) => {
    const dueDateValue = payment.dueDateTimeValue?.slice(0, 10) ?? "";
    const dueDate = parseDateInput(dueDateValue);
    if (!dueDate) return [];

    return [{
      amount: payment.amount,
      dateLabel: formatDateLabel(dueDate),
      debtName: payment.debtName,
      id: payment.id,
      isOverdue: Boolean(payment.isOverdue),
      monthKey: formatMonthKey(dueDate),
      monthLabel: formatMonthLabel(dueDate),
      timestamp: dueDate.getTime(),
    }];
  });

  return entries.sort((first, second) => first.timestamp - second.timestamp);
}

function DebtsTable({
  debts,
  onDelete,
  onToggleActiveOnly,
  showActiveOnly,
}: {
  debts: DebtRecord[];
  onDelete: (id: string) => void | Promise<void>;
  onToggleActiveOnly: () => void;
  showActiveOnly: boolean;
}) {
  const [sortKey, setSortKey] = useState<DebtSortKey>("name");
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");
  const sortedDebts = useMemo(() => {
    function value(debt: DebtRecord) {
      if (sortKey === "name") return `${debt.name} ${debt.lender}`.toLowerCase();
      if (sortKey === "status") return debt.status.toLowerCase();
      return parseCurrency(debt[sortKey]);
    }
    return [...debts].sort((first, second) => compareSortValues(value(first), value(second), sortDirection));
  }, [debts, sortDirection, sortKey]);

  function handleSort(key: DebtSortKey) {
    setSortKey((currentKey) => {
      if (currentKey === key) {
        setSortDirection((direction) => (direction === "asc" ? "desc" : "asc"));
        return currentKey;
      }
      setSortDirection(key === "name" || key === "status" ? "asc" : "desc");
      return key;
    });
  }

  return (
    <section className="min-w-0 max-w-full overflow-hidden rounded-lg border border-[#c6c6cd]/70 bg-white shadow-sm">
      <div className="flex min-w-0 items-center justify-between gap-3 border-b border-[#c6c6cd]/60 px-4 py-4">
        <div className="min-w-0">
          <h2 className="break-words text-lg font-semibold text-[#0b1c30] sm:text-xl">{showActiveOnly ? "Active Liabilities" : "All Liabilities"}</h2>
          <p className="mt-1 text-xs font-semibold text-[#45464d]">{showActiveOnly ? "Showing active and overdue debts" : "Showing paid debts too"}</p>
        </div>
        <button
          aria-pressed={showActiveOnly}
          aria-label={showActiveOnly ? "Show all liabilities" : "Show active liabilities only"}
          className={showActiveOnly
            ? "grid size-11 shrink-0 place-items-center rounded-full bg-[#eff6ff] text-[#0058be] transition hover:bg-[#dce9ff] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2170e4]/25"
            : "grid size-11 shrink-0 place-items-center rounded-full text-[#45464d] transition hover:bg-[#eff4ff] hover:text-[#0b1c30] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2170e4]/25"}
          onClick={onToggleActiveOnly}
          title={showActiveOnly ? "Show all liabilities" : "Show active liabilities only"}
          type="button"
        >
          <Icon className="size-4" name="category" />
        </button>
      </div>

      <div className="max-w-full overflow-x-auto [-webkit-overflow-scrolling:touch]">
        <table className="w-full min-w-[1120px] border-collapse text-left">
          <thead>
            <tr className="bg-[#f8f9ff] text-xs font-semibold uppercase text-[#45464d]">
              <th className="border-b border-[#c6c6cd]/60 px-4 py-3"><SortHeader onSort={() => handleSort("name")} sortDirection={sortKey === "name" ? sortDirection : undefined}>Debt Name</SortHeader></th>
              <th className="border-b border-[#c6c6cd]/60 px-4 py-3 text-right"><SortHeader align="right" onSort={() => handleSort("totalAmount")} sortDirection={sortKey === "totalAmount" ? sortDirection : undefined}>Total Amount</SortHeader></th>
              <th className="border-b border-[#c6c6cd]/60 px-4 py-3 text-right"><SortHeader align="right" onSort={() => handleSort("repaidAmount")} sortDirection={sortKey === "repaidAmount" ? sortDirection : undefined}>Repaid Amount</SortHeader></th>
              <th className="border-b border-[#c6c6cd]/60 px-4 py-3 text-right"><SortHeader align="right" onSort={() => handleSort("remainingBalance")} sortDirection={sortKey === "remainingBalance" ? sortDirection : undefined}>Remaining Balance</SortHeader></th>
              <th className="border-b border-[#c6c6cd]/60 px-4 py-3 text-right"><SortHeader align="right" onSort={() => handleSort("monthlyPayment")} sortDirection={sortKey === "monthlyPayment" ? sortDirection : undefined}>Monthly Payment</SortHeader></th>
              <th className="border-b border-[#c6c6cd]/60 px-4 py-3 text-center"><SortHeader onSort={() => handleSort("status")} sortDirection={sortKey === "status" ? sortDirection : undefined}>Status</SortHeader></th>
              <th className="w-36 border-b border-[#c6c6cd]/60 px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#c6c6cd]/40 text-sm">
            {sortedDebts.map((debt) => (
              <tr className="transition hover:bg-[#f8f9ff]" key={debt.id}>
                <td className="px-4 py-4">
                  <div className="flex items-start gap-3">
                    <span className={`grid size-9 shrink-0 place-items-center rounded-md ${debt.bg} ${debt.tone}`}>
                      <Icon className="size-4" name={debt.icon} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-[#0b1c30]">{debt.name}</p>
                      <p className="mt-1 text-xs font-medium text-[#45464d]">{debt.lender}</p>
                      <DebtProgress debt={debt} />
                    </div>
                  </div>
                </td>
                <td className="whitespace-nowrap px-4 py-4 text-right text-[#0b1c30]">{debt.totalAmount}</td>
                <td className="whitespace-nowrap px-4 py-4 text-right font-semibold text-[#047857]">{debt.repaidAmount}</td>
                <td className={`whitespace-nowrap px-4 py-4 text-right font-semibold ${debt.remainingBalance === "MMK 0.00" ? "text-[#047857]" : "text-[#0b1c30]"}`}>
                  {debt.remainingBalance}
                </td>
                <td className="whitespace-nowrap px-4 py-4 text-right text-[#0b1c30]">{debt.monthlyPayment}</td>
                <td className="px-4 py-4 text-center">
                  <span className={`inline-flex rounded px-2 py-1 text-xs font-bold ${statusStyles[debt.status]}`}>{debt.status}</span>
                </td>
                <td className="px-4 py-4">
                  <div className="flex justify-end gap-1">
                    <RecordActions deleteDescription={`Deleting ${debt.name} will remove this debt from your list.`} editHref={`/debts/${debt.id}/edit`} itemId={debt.id} itemLabel={debt.name} onDelete={onDelete} />
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

function UpcomingPayments({ onViewCalendar, payments }: { onViewCalendar: () => void; payments: UpcomingDebtPayment[] }) {
  const currentDueDateKey = payments[0]?.dueDateTimeValue?.split("T")[0] ?? payments[0]?.dueLabel ?? "";
  const currentPayments = payments.filter((payment) => (payment.dueDateTimeValue?.split("T")[0] ?? payment.dueLabel) === currentDueDateKey);

  return (
    <aside className="min-w-0 max-w-full rounded-lg border border-[#c6c6cd]/70 bg-white p-4 shadow-sm sm:p-5">
      <h2 className="mb-5 text-lg font-semibold text-[#0b1c30] sm:text-xl">Upcoming Payments</h2>
      <div className="space-y-4">
        {currentPayments.length > 0 ? currentPayments.map((payment) => (
          <div className="grid min-w-0 gap-3 border-b border-[#c6c6cd]/40 pb-4 last:border-b-0 last:pb-0 sm:grid-cols-[minmax(0,1fr)_minmax(8rem,auto)] sm:items-center" key={payment.id}>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-[#0b1c30]">{payment.debtName}</p>
              <p className={`mt-1 text-xs font-bold ${payment.isOverdue ? "text-[#b42318]" : "text-[#45464d]"}`}>{payment.dueLabel}</p>
            </div>
            <p className="amount-value max-w-full overflow-hidden rounded-md bg-[#f8f9ff] px-3 py-2 text-right text-base font-semibold text-[#0b1c30] sm:text-lg" title={payment.amount}>{payment.amount}</p>
          </div>
        )) : (
          <div className="rounded-lg border border-dashed border-[#c6c6cd] bg-[#f8f9ff] p-4 text-sm font-medium text-[#45464d]">
            No scheduled debt payments yet.
          </div>
        )}
      </div>
      {payments.length > 0 ? (
        <button
          className="mt-5 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-md border border-[#c6c6cd] text-sm font-semibold text-[#45464d] transition hover:bg-[#eff4ff]"
          onClick={onViewCalendar}
          type="button"
        >
          View Full Calendar
          <Icon className="size-4" name="chevronRight" />
        </button>
      ) : null}
    </aside>
  );
}

function DebtPaymentCalendarModal({ entries, isOpen, onClose }: { entries: CalendarEntry[]; isOpen: boolean; onClose: () => void }) {
  const groupedEntries = entries.reduce<{ entries: CalendarEntry[]; monthKey: string; monthLabel: string }[]>((groups, entry) => {
    const existingGroup = groups.find((group) => group.monthKey === entry.monthKey);
    if (existingGroup) {
      existingGroup.entries.push(entry);
      return groups;
    }
    groups.push({ entries: [entry], monthKey: entry.monthKey, monthLabel: entry.monthLabel });
    return groups;
  }, []);

  return (
    <ModalShell
      icon="calendar"
      iconClassName="bg-[#eff6ff] text-[#0058be]"
      isOpen={isOpen}
      maxWidthClassName="sm:max-w-3xl"
      onClose={onClose}
      subtitle={`${entries.length} scheduled payment${entries.length === 1 ? "" : "s"}`}
      title="Debt Payment Calendar"
    >
      {groupedEntries.length > 0 ? (
        <div className="space-y-5">
          {groupedEntries.map((group) => (
            <section className="rounded-lg border border-[#c6c6cd]/60 bg-white" key={group.monthKey}>
              <header className="border-b border-[#c6c6cd]/50 bg-[#f8f9ff] px-4 py-3">
                <h3 className="text-sm font-bold uppercase text-[#45464d]">{group.monthLabel}</h3>
              </header>
              <div className="divide-y divide-[#c6c6cd]/40">
                {group.entries.map((entry) => (
                  <div className="grid min-w-0 grid-cols-1 gap-2 px-4 py-3 sm:grid-cols-[minmax(0,1fr)_minmax(8rem,auto)_auto] sm:items-center" key={entry.id}>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-[#0b1c30]">{entry.debtName}</p>
                      <p className={`mt-1 text-xs font-bold ${entry.isOverdue ? "text-[#b42318]" : "text-[#45464d]"}`}>{entry.dateLabel}</p>
                    </div>
                    <p className="amount-value text-right text-sm font-semibold text-[#0b1c30]" title={entry.amount}>{entry.amount}</p>
                    <span className={`w-fit rounded px-2 py-1 text-xs font-bold ${entry.isOverdue ? "bg-[#ffdad6] text-[#93000a]" : "bg-[#d8e2ff] text-[#004395]"}`}>
                      {entry.isOverdue ? "Overdue" : "Scheduled"}
                    </span>
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>
      ) : (
        <div className="rounded-lg border border-dashed border-[#c6c6cd] bg-[#f8f9ff] p-8 text-center">
          <Icon className="mx-auto size-8 text-[#76777d]" name="calendar" />
          <h3 className="mt-3 text-base font-semibold text-[#0b1c30]">No scheduled payments</h3>
          <p className="mt-1 text-sm text-[#45464d]">Add a next payment date and duration to a debt to see it on the calendar.</p>
        </div>
      )}
    </ModalShell>
  );
}

export function DebtsPageContent({ debts, payments }: { debts: DebtRecordWithValues[]; payments: UpcomingDebtPayment[] }) {
  const { showError, showSuccess } = useToast();
  const searchParams = useSearchParams();
  const [visibleDebts, setVisibleDebts] = useState(debts);
  const [isPending, setIsPending] = useState(false);
  const [isCalendarOpen, setIsCalendarOpen] = useState(false);
  const [showActiveOnly, setShowActiveOnly] = useState(true);
  const search = searchParams.get("q") ?? "";
  const filteredDebts = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();
    return visibleDebts.filter((debt) => {
      const searchable = `${debt.name} ${debt.lender} ${debt.totalAmount} ${debt.repaidAmount} ${debt.remainingBalance} ${debt.monthlyPayment} ${debt.status}`.toLowerCase();
      const statusMatches = !showActiveOnly || debt.status !== "Paid";
      return statusMatches && (normalizedSearch === "" || searchable.includes(normalizedSearch));
    });
  }, [search, showActiveOnly, visibleDebts]);
  const calendarEntries = useMemo(() => buildCalendarEntries(payments), [payments]);

  async function handleDelete(debtId: string) {
    setIsPending(true);
    const result = await deleteDebt(debtId);
    setIsPending(false);
    if (result.error) {
      showError(result.error);
      return;
    }
    setVisibleDebts((items) => items.filter((item) => item.id !== debtId));
    showSuccess("Debt deleted successfully.");
  }

  return (
    <div className="grid min-w-0 grid-cols-1 gap-6 xl:grid-cols-12">
      <div className="min-w-0 xl:col-span-9">
        {isPending ? <p className="mb-4 text-sm font-medium text-[#45464d]">Updating debts…</p> : null}
        {filteredDebts.length > 0 ? (
          <DebtsTable
            debts={filteredDebts}
            onDelete={handleDelete}
            onToggleActiveOnly={() => setShowActiveOnly((value) => !value)}
            showActiveOnly={showActiveOnly}
          />
        ) : (
          <section className="rounded-lg border border-dashed border-[#c6c6cd] bg-white p-6 text-center sm:p-10">
            <Icon className="mx-auto size-8 text-[#76777d]" name="document" />
            <h2 className="mt-3 text-lg font-semibold text-[#0b1c30]">No debts yet</h2>
            <p className="mt-1 text-sm text-[#45464d]">Add a debt to track repayment progress.</p>
          </section>
        )}
      </div>
      <div className="min-w-0 xl:col-span-3">
        <UpcomingPayments onViewCalendar={() => setIsCalendarOpen(true)} payments={payments} />
      </div>
      <DebtPaymentCalendarModal entries={calendarEntries} isOpen={isCalendarOpen} onClose={() => setIsCalendarOpen(false)} />
    </div>
  );
}
