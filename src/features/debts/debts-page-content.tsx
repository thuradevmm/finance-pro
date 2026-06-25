"use client";

import { useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";

import { deleteDebt } from "@/app/debts/actions";
import { Icon } from "@/components/ui/icon";
import { ModalShell } from "@/components/ui/modal-shell";
import { RecordActions } from "@/components/ui/record-actions";
import { formatMmk } from "@/lib/currency";
import type { DebtRecordWithValues } from "@/lib/debts/supabase";
import type { DebtRecord, DebtStatus, UpcomingDebtPayment } from "@/types/finance";

const statusStyles: Record<DebtStatus, string> = {
  Active: "bg-[#d8e2ff] text-[#004395]",
  Overdue: "bg-[#ffdad6] text-[#93000a]",
  Paid: "bg-[#6ffbbe] text-[#005236]",
};

function DebtProgress({ debt }: { debt: DebtRecord }) {
  const color = debt.status === "Overdue" ? "bg-[#ba1a1a]" : debt.status === "Paid" ? "bg-[#047857]" : "bg-[#0058be]";

  return (
    <div className="mt-3">
      <div className="mb-1 flex items-center justify-between text-xs font-semibold text-[#45464d]">
        <span>Repaid</span>
        <span>{debt.progressPercent}%</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-[#dce9ff]">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${Math.min(debt.progressPercent, 100)}%` }} />
      </div>
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
  return new Intl.DateTimeFormat("en-US", { day: "2-digit", month: "short", year: "numeric" }).format(date);
}

function formatMonthKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function formatMonthLabel(date: Date) {
  return new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric" }).format(date);
}

function addMonths(date: Date, monthCount: number) {
  const next = new Date(date);
  const day = next.getDate();
  next.setMonth(next.getMonth() + monthCount);
  if (next.getDate() !== day) next.setDate(0);
  return next;
}

function addMonthsPreservingDay(startDate: string, monthCount: number) {
  const start = parseDateInput(startDate);
  if (!start || !Number.isFinite(monthCount) || monthCount <= 0) return null;
  return addMonths(start, monthCount);
}

function daysBetween(startDate: Date, endDate: Date) {
  return Math.max(Math.round((endDate.getTime() - startDate.getTime()) / 86_400_000), 0);
}

function roundMoney(value: number) {
  return Math.round(value * 100) / 100;
}

function calculateTotalRepayment(debt: DebtRecordWithValues) {
  const principal = debt.totalAmountValue;
  const interestRate = debt.interestRateValue;
  const numberOfMonths = debt.durationMonths;
  const regularInstallment = debt.monthlyPaymentValue;
  const startedAt = parseDateInput(debt.startDate);

  if (!Number.isFinite(principal) || principal <= 0 || numberOfMonths <= 0 || !regularInstallment || !startedAt) {
    return roundMoney(regularInstallment * Math.max(numberOfMonths, 0));
  }

  let balance = principal;
  let previousDate = startedAt;
  let totalInterest = 0;
  let totalPrincipal = 0;

  for (let month = 1; month <= numberOfMonths; month += 1) {
    const dueDate = addMonthsPreservingDay(debt.startDate, month);
    if (!dueDate) break;
    dueDate.setDate(dueDate.getDate() - 1);

    const rawInterestAmount = debt.interestRatePeriod === "Monthly"
      ? balance * (interestRate / 100)
      : balance * (interestRate / 100) * (daysBetween(previousDate, dueDate) / 365);
    const interestAmount = roundMoney(rawInterestAmount);
    const installmentAmount = month === numberOfMonths ? roundMoney(balance + interestAmount) : regularInstallment;
    const principalAmount = month === numberOfMonths ? balance : roundMoney(installmentAmount - interestAmount);

    balance = roundMoney(balance - principalAmount);
    totalInterest += rawInterestAmount;
    totalPrincipal = roundMoney(totalPrincipal + principalAmount);
    previousDate = dueDate;
  }

  return roundMoney(totalPrincipal + totalInterest);
}

function paymentAmountForMonth(debt: DebtRecordWithValues, monthIndex: number, entryCount: number, totalRepayment: number) {
  if (monthIndex !== entryCount - 1) return debt.monthlyPaymentValue;
  const previousPayments = debt.monthlyPaymentValue * Math.max(entryCount - 1, 0);
  const finalPayment = roundMoney(totalRepayment - previousPayments);
  return finalPayment > 0 ? finalPayment : debt.monthlyPaymentValue;
}

function buildCalendarEntries(debts: DebtRecordWithValues[]) {
  const today = Date.now();
  const entries = debts.flatMap((debt) => {
    if (debt.status === "Paid" || !debt.nextPaymentDateValue) return [];

    const firstPaymentDate = parseDateInput(debt.nextPaymentDateValue);
    if (!firstPaymentDate) return [];

    const payoffDate = debt.payoffDate ? parseDateInput(debt.payoffDate) : null;
    const entryCount = Math.max(Math.min(debt.durationMonths || 12, 60), 1);
    const totalRepayment = calculateTotalRepayment(debt);

    return Array.from({ length: entryCount }, (_, index) => {
      const paymentDate = addMonths(firstPaymentDate, index);
      if (payoffDate && paymentDate > payoffDate) return null;
      const paymentAmount = paymentAmountForMonth(debt, index, entryCount, totalRepayment);

      return {
        amount: formatMmk(paymentAmount),
        dateLabel: formatDateLabel(paymentDate),
        debtName: debt.name,
        id: `${debt.id}-${formatMonthKey(paymentDate)}-${paymentDate.getDate()}`,
        isOverdue: paymentDate.getTime() < today,
        monthKey: formatMonthKey(paymentDate),
        monthLabel: formatMonthLabel(paymentDate),
        timestamp: paymentDate.getTime(),
      };
    }).filter((entry): entry is CalendarEntry => entry != null);
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
  return (
    <section className="overflow-hidden rounded-lg border border-[#c6c6cd]/70 bg-white shadow-sm">
      <div className="flex items-center justify-between border-b border-[#c6c6cd]/60 px-4 py-4">
        <div>
          <h2 className="text-xl font-semibold text-[#0b1c30]">{showActiveOnly ? "Active Liabilities" : "All Liabilities"}</h2>
          <p className="mt-1 text-xs font-semibold text-[#45464d]">{showActiveOnly ? "Showing active and overdue debts" : "Showing paid debts too"}</p>
        </div>
        <button
          aria-pressed={showActiveOnly}
          aria-label={showActiveOnly ? "Show all liabilities" : "Show active liabilities only"}
          className={showActiveOnly
            ? "grid size-9 place-items-center rounded-full bg-[#eff6ff] text-[#0058be] transition hover:bg-[#dce9ff]"
            : "grid size-9 place-items-center rounded-full text-[#45464d] transition hover:bg-[#eff4ff] hover:text-[#0b1c30]"}
          onClick={onToggleActiveOnly}
          title={showActiveOnly ? "Show all liabilities" : "Show active liabilities only"}
          type="button"
        >
          <Icon className="size-4" name="category" />
        </button>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[1040px] border-collapse text-left">
          <thead>
            <tr className="bg-[#f8f9ff] text-xs font-semibold uppercase text-[#45464d]">
              <th className="border-b border-[#c6c6cd]/60 px-4 py-3">Debt Name</th>
              <th className="border-b border-[#c6c6cd]/60 px-4 py-3 text-right">Total Amount</th>
              <th className="border-b border-[#c6c6cd]/60 px-4 py-3 text-right">Repaid Amount</th>
              <th className="border-b border-[#c6c6cd]/60 px-4 py-3 text-right">Remaining Balance</th>
              <th className="border-b border-[#c6c6cd]/60 px-4 py-3 text-right">Monthly Payment</th>
              <th className="border-b border-[#c6c6cd]/60 px-4 py-3 text-center">Status</th>
              <th className="border-b border-[#c6c6cd]/60 px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#c6c6cd]/40 text-sm">
            {debts.map((debt) => (
              <tr className="transition hover:bg-[#f8f9ff]" key={debt.id}>
                <td className="px-4 py-4">
                  <div className="flex items-start gap-3">
                    <span className={`grid size-9 shrink-0 place-items-center rounded-md ${debt.bg} ${debt.tone}`}>
                      <Icon className="size-4" name={debt.icon} />
                    </span>
                    <div className="min-w-0">
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
  return (
    <aside className="rounded-lg border border-[#c6c6cd]/70 bg-white p-5 shadow-sm">
      <h2 className="mb-5 text-xl font-semibold text-[#0b1c30]">Upcoming Payments</h2>
      <div className="space-y-4">
        {payments.length > 0 ? payments.map((payment) => (
          <div className="flex items-center justify-between gap-4 border-b border-[#c6c6cd]/40 pb-4 last:border-b-0 last:pb-0" key={payment.id}>
            <div>
              <p className="text-sm font-semibold text-[#0b1c30]">{payment.debtName}</p>
              <p className={`mt-1 text-xs font-bold ${payment.isOverdue ? "text-[#b42318]" : "text-[#45464d]"}`}>{payment.dueLabel}</p>
            </div>
            <p className="whitespace-nowrap text-lg font-semibold text-[#0b1c30]">{payment.amount}</p>
          </div>
        )) : (
          <div className="rounded-lg border border-dashed border-[#c6c6cd] bg-[#f8f9ff] p-4 text-sm font-medium text-[#45464d]">
            No scheduled debt payments yet.
          </div>
        )}
      </div>
      <button
        className="mt-5 inline-flex h-10 w-full items-center justify-center gap-2 rounded-md border border-[#c6c6cd] text-sm font-semibold text-[#45464d] transition hover:bg-[#eff4ff]"
        onClick={onViewCalendar}
        type="button"
      >
        View Full Calendar
        <Icon className="size-4" name="chevronRight" />
      </button>
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
                  <div className="grid grid-cols-1 gap-2 px-4 py-3 sm:grid-cols-[minmax(0,1fr)_auto_auto] sm:items-center" key={entry.id}>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-[#0b1c30]">{entry.debtName}</p>
                      <p className={`mt-1 text-xs font-bold ${entry.isOverdue ? "text-[#b42318]" : "text-[#45464d]"}`}>{entry.dateLabel}</p>
                    </div>
                    <p className="whitespace-nowrap text-sm font-semibold text-[#0b1c30]">{entry.amount}</p>
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
  const searchParams = useSearchParams();
  const [visibleDebts, setVisibleDebts] = useState(debts);
  const [error, setError] = useState("");
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
  const calendarEntries = useMemo(() => buildCalendarEntries(visibleDebts), [visibleDebts]);

  async function handleDelete(debtId: string) {
    setError("");
    setIsPending(true);
    const result = await deleteDebt(debtId);
    setIsPending(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    setVisibleDebts((items) => items.filter((item) => item.id !== debtId));
  }

  return (
    <div className="grid grid-cols-1 gap-6 xl:grid-cols-12">
      <div className="xl:col-span-9">
        {error ? <div className="mb-4 rounded-md border border-[#fecaca] bg-[#fff1f0] px-4 py-3 text-sm font-medium text-[#991b1b]" role="alert">{error}</div> : null}
        {isPending ? <p className="mb-4 text-sm font-medium text-[#45464d]">Updating debts…</p> : null}
        {filteredDebts.length > 0 ? (
          <DebtsTable
            debts={filteredDebts}
            onDelete={handleDelete}
            onToggleActiveOnly={() => setShowActiveOnly((value) => !value)}
            showActiveOnly={showActiveOnly}
          />
        ) : (
          <section className="rounded-lg border border-dashed border-[#c6c6cd] bg-white p-10 text-center">
            <Icon className="mx-auto size-8 text-[#76777d]" name="document" />
            <h2 className="mt-3 text-lg font-semibold text-[#0b1c30]">No debts yet</h2>
            <p className="mt-1 text-sm text-[#45464d]">Add a debt to track repayment progress.</p>
          </section>
        )}
      </div>
      <div className="xl:col-span-3">
        <UpcomingPayments onViewCalendar={() => setIsCalendarOpen(true)} payments={payments} />
      </div>
      <DebtPaymentCalendarModal entries={calendarEntries} isOpen={isCalendarOpen} onClose={() => setIsCalendarOpen(false)} />
    </div>
  );
}
