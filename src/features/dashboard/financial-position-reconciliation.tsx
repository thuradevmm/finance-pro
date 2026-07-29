import { ResponsiveAmount } from "@/components/ui/responsive-amount";
import { FinancialPositionDateFilter } from "@/features/dashboard/financial-position-date-filter";
import { formatMmk } from "@/lib/currency";
import { formatDisplayDate } from "@/lib/date-format";
import type { FinancialReconciliation } from "@/lib/reconciliation";

type FinancialPositionReconciliationProps = {
  dateFrom: string;
  dateTo: string;
  defaultDateFrom: string;
  defaultDateTo: string;
  reconciliation: FinancialReconciliation;
};

function positionDateLabel(dateValue: string) {
  return formatDisplayDate(`${dateValue}T00:00:00`);
}

export function FinancialPositionReconciliation({
  dateFrom,
  dateTo,
  defaultDateFrom,
  defaultDateTo,
  reconciliation,
}: FinancialPositionReconciliationProps) {
  const isReconciled = Math.abs(reconciliation.difference) <= 0.005;
  const periodLabel = `${positionDateLabel(dateFrom)} – ${positionDateLabel(dateTo)}`;
  const positionLabel = positionDateLabel(dateTo);
  const performanceRows = [
    ["Economic income", reconciliation.income],
    ["Economic expenses", -reconciliation.expenses],
    ["Net income", reconciliation.net],
  ] as const;
  const positionRows = [
    ["Cash & card-credit assets", reconciliation.cashAndCardCredit],
    ["Lending receivables", reconciliation.lendingReceivables],
    ["Card liabilities", -reconciliation.cardLiabilities],
    ["Borrowing liabilities", -reconciliation.borrowingLiabilities],
  ] as const;

  return (
    <section className="min-w-0 overflow-hidden rounded-xl border border-[#c6c6cd]/70 bg-white shadow-[0_8px_28px_rgba(15,23,42,0.06)]">
      <div className="border-b border-[#c6c6cd]/50 bg-gradient-to-r from-[#eff6ff] via-white to-[#ecfdf5] p-4 sm:p-6">
        <div className="flex flex-col gap-2 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.12em] text-[#0058be]">Balance-sheet control</p>
            <h2 className="mt-1 text-xl font-semibold text-[#0b1c30]">Financial Position & Reconciliation</h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-[#45464d]">
              The ending date controls the financial position. Income and expenses use the complete selected period, with lending and debt principal kept on the balance sheet.
            </p>
          </div>
          <div className={`inline-flex w-fit items-center rounded-full border px-3 py-1.5 text-xs font-bold ${isReconciled ? "border-[#86efac] bg-[#ecfdf5] text-[#166534]" : "border-[#fecaca] bg-[#fff1f0] text-[#991b1b]"}`}>
            {isReconciled ? "Reconciled" : "Review required"} · {formatMmk(reconciliation.difference)}
          </div>
        </div>
        <div className="mt-5 rounded-lg border border-[#bfdbfe]/80 bg-white/90 p-4">
          <FinancialPositionDateFilter
            dateFrom={dateFrom}
            dateTo={dateTo}
            defaultDateFrom={defaultDateFrom}
            defaultDateTo={defaultDateTo}
          />
          <p className="mt-2 text-xs font-medium text-[#45464d]">Selected period: {periodLabel}</p>
        </div>
      </div>

      <div className="p-4 sm:p-6">
        <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-lg border border-[#c6c6cd]/50 bg-[#f8f9ff] p-4">
            <dt className="text-xs font-bold uppercase text-[#76777d]">Total Assets</dt>
            <dd><ResponsiveAmount className="mt-2 font-semibold text-[#0b1c30]" maxSizeRem={1.125}>{formatMmk(reconciliation.totalAssets)}</ResponsiveAmount></dd>
            <p className="mt-2 text-xs text-[#76777d]">As of {positionLabel}</p>
          </div>
          <div className="rounded-lg border border-[#fecaca] bg-[#fff8f7] p-4">
            <dt className="text-xs font-bold uppercase text-[#991b1b]">Total Liabilities</dt>
            <dd><ResponsiveAmount className="mt-2 font-semibold text-[#b42318]" maxSizeRem={1.125}>{formatMmk(-reconciliation.totalLiabilities)}</ResponsiveAmount></dd>
            <p className="mt-2 text-xs text-[#991b1b]">As of {positionLabel}</p>
          </div>
          <div className="rounded-lg border border-[#bfdbfe] bg-[#eff6ff] p-4">
            <dt className="text-xs font-bold uppercase text-[#0058be]">Closing Net Worth</dt>
            <dd><ResponsiveAmount className={`mt-2 font-bold ${reconciliation.netWorth < 0 ? "text-[#b42318]" : "text-[#0058be]"}`} maxSizeRem={1.125}>{formatMmk(reconciliation.netWorth)}</ResponsiveAmount></dd>
            <p className="mt-2 text-xs text-[#0058be]">Assets less liabilities</p>
          </div>
          <div className={`rounded-lg border p-4 ${isReconciled ? "border-[#bbf7d0] bg-[#ecfdf5]" : "border-[#fecaca] bg-[#fff8f7]"}`}>
            <dt className={`text-xs font-bold uppercase ${isReconciled ? "text-[#166534]" : "text-[#991b1b]"}`}>Reconciliation Difference</dt>
            <dd><ResponsiveAmount className={`mt-2 font-bold ${isReconciled ? "text-[#047857]" : "text-[#b42318]"}`} maxSizeRem={1.125}>{formatMmk(reconciliation.difference)}</ResponsiveAmount></dd>
            <p className={`mt-2 text-xs ${isReconciled ? "text-[#166534]" : "text-[#991b1b]"}`}>{isReconciled ? "No unexplained difference" : "Difference needs review"}</p>
          </div>
        </dl>

        <div className="mt-5 grid min-w-0 gap-4 xl:grid-cols-2">
          <section className="rounded-lg border border-[#c6c6cd]/60 bg-white p-4">
            <div>
              <h3 className="text-sm font-bold uppercase text-[#45464d]">Period Performance</h3>
              <p className="mt-1 text-xs font-medium text-[#76777d]">{periodLabel} · finalized economic activity</p>
            </div>
            <dl className="mt-4 space-y-3">
              {performanceRows.map(([label, value]) => (
                <div className="flex min-w-0 items-center justify-between gap-4 border-b border-[#c6c6cd]/35 pb-3 last:border-0 last:pb-0" key={label}>
                  <dt className="text-sm font-medium text-[#45464d]">{label}</dt>
                  <dd className={`text-right text-sm font-bold ${value < 0 ? "text-[#b42318]" : "text-[#0b1c30]"}`}>{formatMmk(value)}</dd>
                </div>
              ))}
            </dl>
          </section>

          <section className="rounded-lg border border-[#c6c6cd]/60 bg-white p-4">
            <div>
              <h3 className="text-sm font-bold uppercase text-[#45464d]">Position Composition</h3>
              <p className="mt-1 text-xs font-medium text-[#76777d]">Balances and outstanding obligations as of {positionLabel}</p>
            </div>
            <dl className="mt-4 space-y-3">
              {positionRows.map(([label, value]) => (
                <div className="flex min-w-0 items-center justify-between gap-4 border-b border-[#c6c6cd]/35 pb-3 last:border-0 last:pb-0" key={label}>
                  <dt className="text-sm font-medium text-[#45464d]">{label}</dt>
                  <dd className={`text-right text-sm font-bold ${value < 0 ? "text-[#b42318]" : "text-[#0b1c30]"}`}>{formatMmk(value)}</dd>
                </div>
              ))}
            </dl>
          </section>
        </div>

        <div className="mt-5 grid gap-3 rounded-lg border border-[#c6c6cd]/60 bg-[#f8f9ff] p-4 sm:grid-cols-3">
          <div>
            <p className="text-xs font-bold uppercase text-[#76777d]">Opening Position & Adjustments</p>
            <p className="mt-1 text-sm font-bold text-[#0b1c30]">{formatMmk(reconciliation.openingPositionAndAdjustments)}</p>
          </div>
          <div>
            <p className="text-xs font-bold uppercase text-[#76777d]">Plus Period Net Income</p>
            <p className={`mt-1 text-sm font-bold ${reconciliation.net < 0 ? "text-[#b42318]" : "text-[#047857]"}`}>{formatMmk(reconciliation.net)}</p>
          </div>
          <div>
            <p className="text-xs font-bold uppercase text-[#76777d]">Reconciled Closing Net Worth</p>
            <p className={`mt-1 text-sm font-bold ${reconciliation.reconciledClosingNetWorth < 0 ? "text-[#b42318]" : "text-[#0058be]"}`}>{formatMmk(reconciliation.reconciledClosingNetWorth)}</p>
          </div>
        </div>

        <p className="mt-4 text-xs font-medium leading-5 text-[#45464d]">
          Credit limits are excluded, card debt is counted once, and debt principal or lending movements are financing rather than income or expense. Pending items remain in working account balances but not finalized period performance, so they are captured in the opening-and-adjustment bridge instead of being misclassified.
        </p>
      </div>
    </section>
  );
}
