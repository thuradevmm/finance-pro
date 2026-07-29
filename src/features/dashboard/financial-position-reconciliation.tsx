import { ResponsiveAmount } from "@/components/ui/responsive-amount";
import { FinancialPositionDateFilter } from "@/features/dashboard/financial-position-date-filter";
import { formatCurrencyAmount } from "@/lib/currency";
import { formatDisplayDate } from "@/lib/date-format";
import { reconciliationSeverity, type FinancialReconciliation } from "@/lib/reconciliation";

type FinancialPositionReconciliationProps = {
  baseCurrency: string;
  dateFrom: string;
  dateTo: string;
  defaultDateFrom: string;
  defaultDateTo: string;
  reconciliation: FinancialReconciliation;
};

type FinancialTableRow = {
  amount: number;
  explanation: string;
  group: "Period activity" | "Current position" | "Reconciliation";
  label: string;
  subtotal?: boolean;
};

function positionDateLabel(dateValue: string) {
  return formatDisplayDate(`${dateValue}T00:00:00`);
}

export function FinancialPositionReconciliation({
  baseCurrency,
  dateFrom,
  dateTo,
  defaultDateFrom,
  defaultDateTo,
  reconciliation,
}: FinancialPositionReconciliationProps) {
  const formatAmount = (value: number) => formatCurrencyAmount(value, baseCurrency);
  const severity = reconciliationSeverity(reconciliation.difference);
  const isReconciled = severity === "balanced";
  const periodLabel = `${positionDateLabel(dateFrom)} – ${positionDateLabel(dateTo)}`;
  const positionLabel = positionDateLabel(dateTo);

  /**
   * Accounting row order and formulas (keep aligned with docs/accounting-rules.md):
   * 1. Period activity: Credits − Debits = Net activity.
   * 2. Current position: liquid assets + receivables, then card + borrowing
   *    liabilities, followed by Assets − Liabilities = Closing net worth.
   * 3. Reconciliation: Opening net worth + Net activity = Expected close;
   *    Actual close − Expected close = Difference.
   * Activity and position are deliberately separated by group labels because
   * they describe a period and a point in time respectively.
   */
  const rows: FinancialTableRow[] = [
    { amount: reconciliation.income, explanation: "Finalized operating Credits in the selected period", group: "Period activity", label: "Money credited" },
    { amount: -reconciliation.expenses, explanation: "Finalized operating Debits in the selected period", group: "Period activity", label: "Money debited / spent" },
    { amount: reconciliation.net, explanation: "Credits − Debits", group: "Period activity", label: "Net activity", subtotal: true },
    { amount: reconciliation.cashAndCardCredit, explanation: "Cash accounts + card overpayment credits", group: "Current position", label: "Cash and card credits" },
    { amount: reconciliation.lendingReceivables, explanation: "Money other people owe you", group: "Current position", label: "Money owed to you" },
    { amount: reconciliation.totalAssets, explanation: "Cash and card credits + money owed to you", group: "Current position", label: "Total assets", subtotal: true },
    { amount: -reconciliation.cardLiabilities, explanation: "Outstanding card balances", group: "Current position", label: "Credit-card balances owed" },
    { amount: -reconciliation.borrowingLiabilities, explanation: "Other outstanding borrowing", group: "Current position", label: "Other debt owed" },
    { amount: -reconciliation.totalLiabilities, explanation: "Credit-card balances + other debt", group: "Current position", label: "Total liabilities", subtotal: true },
    { amount: reconciliation.netWorth, explanation: "Total assets − total liabilities", group: "Current position", label: "Closing net worth", subtotal: true },
    { amount: reconciliation.openingPositionAndAdjustments, explanation: `Net worth immediately before ${positionDateLabel(dateFrom)}`, group: "Reconciliation", label: "Opening net worth" },
    { amount: reconciliation.net, explanation: "Credits − Debits during this period", group: "Reconciliation", label: "Plus net activity" },
    { amount: reconciliation.reconciledClosingNetWorth, explanation: "Opening net worth + net activity", group: "Reconciliation", label: "Expected closing net worth", subtotal: true },
    { amount: reconciliation.netWorth, explanation: `Assets − liabilities as of ${positionLabel}`, group: "Reconciliation", label: "Actual closing net worth", subtotal: true },
  ];

  return (
    <section className="min-w-0 overflow-hidden rounded-xl border border-[#c6c6cd]/70 bg-white shadow-[0_8px_28px_rgba(15,23,42,0.06)]">
      <div className="border-b border-[#c6c6cd]/50 bg-gradient-to-r from-[#eff6ff] via-white to-[#ecfdf5] p-4 sm:p-6">
        <div className="flex flex-col gap-2 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.12em] text-[#0058be]">Financial overview</p>
            <h2 className="mt-1 text-xl font-semibold text-[#0b1c30]">Activity, Position & Reconciliation</h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-[#45464d]">
              Period activity explains what changed; current position shows what you own and owe at the ending date.
            </p>
          </div>
          <div className={`inline-flex w-fit items-center rounded-full border px-3 py-1.5 text-xs font-bold ${isReconciled ? "border-[#86efac] bg-[#ecfdf5] text-[#166534]" : "border-[#fecaca] bg-[#fff1f0] text-[#991b1b]"}`}>
            {isReconciled ? "Balanced" : `${severity === "minor" ? "Minor difference" : "Review required"} · ${formatAmount(reconciliation.difference)}`}
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
        <dl className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="rounded-lg border border-[#c6c6cd]/50 bg-[#f8f9ff] p-4">
            <dt className="text-xs font-bold uppercase text-[#76777d]">Total Assets</dt>
            <dd><ResponsiveAmount className="mt-2 font-semibold text-[#0b1c30]" maxSizeRem={1.125}>{formatAmount(reconciliation.totalAssets)}</ResponsiveAmount></dd>
            <p className="mt-2 text-xs text-[#76777d]">As of {positionLabel}</p>
          </div>
          <div className="rounded-lg border border-[#fecaca] bg-[#fff8f7] p-4">
            <dt className="text-xs font-bold uppercase text-[#991b1b]">Total Liabilities</dt>
            <dd><ResponsiveAmount className="mt-2 font-semibold text-[#b42318]" maxSizeRem={1.125}>{formatAmount(-reconciliation.totalLiabilities)}</ResponsiveAmount></dd>
            <p className="mt-2 text-xs text-[#991b1b]">As of {positionLabel}</p>
          </div>
          <div className="rounded-lg border border-[#bfdbfe] bg-[#eff6ff] p-4">
            <dt className="text-xs font-bold uppercase text-[#0058be]">Closing Net Worth</dt>
            <dd><ResponsiveAmount className={`mt-2 font-bold ${reconciliation.netWorth < 0 ? "text-[#b42318]" : "text-[#0058be]"}`} maxSizeRem={1.125}>{formatAmount(reconciliation.netWorth)}</ResponsiveAmount></dd>
            <p className="mt-2 text-xs text-[#0058be]">Assets − liabilities</p>
          </div>
        </dl>

        <div className="mt-5 overflow-hidden rounded-lg border border-[#c6c6cd]/60">
          <div className="overflow-x-auto [-webkit-overflow-scrolling:touch]">
            <table className="w-full min-w-[720px] border-collapse text-left">
              <thead className="bg-[#f8f9ff]">
                <tr className="border-b border-[#c6c6cd]/60">
                  <th className="px-4 py-3 text-xs font-bold uppercase text-[#45464d]">Section</th>
                  <th className="px-4 py-3 text-xs font-bold uppercase text-[#45464d]">What it means</th>
                  <th className="px-4 py-3 text-xs font-bold uppercase text-[#45464d]">Formula / source</th>
                  <th className="px-4 py-3 text-right text-xs font-bold uppercase text-[#45464d]">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#c6c6cd]/35 text-sm">
                {rows.map((row, index) => {
                  const showGroup = index === 0 || rows[index - 1]?.group !== row.group;
                  return (
                    <tr className={row.subtotal ? "bg-[#f8f9ff] font-semibold" : "bg-white"} key={`${row.group}:${row.label}`}>
                      <td className="px-4 py-3 align-top font-bold text-[#0058be]">{showGroup ? row.group : ""}</td>
                      <td className="px-4 py-3 text-[#0b1c30]">{row.label}</td>
                      <td className="px-4 py-3 text-xs leading-5 text-[#45464d]">{row.explanation}</td>
                      <td className={`whitespace-nowrap px-4 py-3 text-right font-bold ${row.amount < 0 ? "text-[#b42318]" : "text-[#0b1c30]"}`}>{formatAmount(row.amount)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        <div className={`mt-5 rounded-lg border p-4 ${isReconciled ? "border-[#bbf7d0] bg-[#ecfdf5]" : "border-[#fecaca] bg-[#fff8f7]"}`}>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className={`text-sm font-bold ${isReconciled ? "text-[#166534]" : "text-[#991b1b]"}`}>
                {isReconciled ? "Balanced — no unexplained difference" : `${severity === "minor" ? "Minor reconciliation difference" : "Reconciliation needs review"}`}
              </p>
              {!isReconciled ? (
                <p className="mt-1 text-xs leading-5 text-[#991b1b]">
                  Actual closing net worth differs from opening net worth plus finalized net activity. Check opening records, transaction dates, pending items, deleted/reversed links, and manual debt adjustments.
                </p>
              ) : null}
            </div>
            {!isReconciled ? <ResponsiveAmount className="font-bold text-[#b42318]" maxSizeRem={1.125}>{formatAmount(reconciliation.difference)}</ResponsiveAmount> : null}
          </div>
          <details className="mt-3 border-t border-current/15 pt-3 text-xs leading-5 text-[#45464d]">
            <summary className="cursor-pointer font-bold text-[#0058be]">How reconciliation is calculated</summary>
            <p className="mt-2">
              Expected closing net worth = opening net worth + finalized Credits − finalized Debits. Difference = actual closing net worth − expected closing net worth. Pending entries affect working account availability but are excluded from finalized activity until cleared.
            </p>
          </details>
        </div>
      </div>
    </section>
  );
}
