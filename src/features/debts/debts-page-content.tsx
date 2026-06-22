"use client";

import { useState } from "react";

import { Icon } from "@/components/ui/icon";
import { RecordActions } from "@/components/ui/record-actions";
import { getTransactionDerivedDebts } from "@/lib/transactions/derived-data";
import { transactions as fallbackTransactions } from "@/lib/transactions/mock-data";
import { useStoredTransactions } from "@/lib/transactions/transaction-store";
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

function DebtsTable({ debts, onDelete }: { debts: DebtRecord[]; onDelete: (id: string) => void }) {
  return (
    <section className="overflow-hidden rounded-lg border border-[#c6c6cd]/70 bg-white shadow-sm">
      <div className="flex items-center justify-between border-b border-[#c6c6cd]/60 px-4 py-4">
        <h2 className="text-xl font-semibold text-[#0b1c30]">Active Liabilities</h2>
        <button className="grid size-9 place-items-center rounded-full text-[#45464d] transition hover:bg-[#eff4ff] hover:text-[#0b1c30]" type="button">
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
                    <RecordActions editHref={`/debts/${debt.id}/edit`} itemId={debt.id} itemLabel={debt.name} onDelete={onDelete} />
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

function UpcomingPayments({ payments }: { payments: UpcomingDebtPayment[] }) {
  return (
    <aside className="rounded-lg border border-[#c6c6cd]/70 bg-white p-5 shadow-sm">
      <h2 className="mb-5 text-xl font-semibold text-[#0b1c30]">Upcoming Payments</h2>
      <div className="space-y-4">
        {payments.map((payment) => (
          <div className="flex items-center justify-between gap-4 border-b border-[#c6c6cd]/40 pb-4 last:border-b-0 last:pb-0" key={payment.id}>
            <div>
              <p className="text-sm font-semibold text-[#0b1c30]">{payment.debtName}</p>
              <p className={`mt-1 text-xs font-bold ${payment.isOverdue ? "text-[#b42318]" : "text-[#45464d]"}`}>{payment.dueLabel}</p>
            </div>
            <p className="whitespace-nowrap text-lg font-semibold text-[#0b1c30]">{payment.amount}</p>
          </div>
        ))}
      </div>
      <button
        className="mt-5 inline-flex h-10 w-full items-center justify-center gap-2 rounded-md border border-[#c6c6cd] text-sm font-semibold text-[#45464d] transition hover:bg-[#eff4ff]"
        type="button"
      >
        View Full Calendar
        <Icon className="size-4" name="chevronRight" />
      </button>
    </aside>
  );
}

export function DebtsPageContent({ debts, payments }: { debts: DebtRecord[]; payments: UpcomingDebtPayment[] }) {
  const storedTransactions = useStoredTransactions(fallbackTransactions);
  const transactionDerivedDebts = getTransactionDerivedDebts(storedTransactions);
  const [visibleDebts, setVisibleDebts] = useState(debts);
  const visibleDebtIds = new Set(visibleDebts.map((debt) => debt.id));

  return (
    <div className="grid grid-cols-1 gap-6 xl:grid-cols-12">
      <div className="xl:col-span-9">
        <DebtsTable debts={transactionDerivedDebts.filter((debt) => visibleDebtIds.has(debt.id))} onDelete={(id) => setVisibleDebts((items) => items.filter((item) => item.id !== id))} />
      </div>
      <div className="xl:col-span-3">
        <UpcomingPayments payments={payments} />
      </div>
    </div>
  );
}
