import Link from "next/link";

import { AppShell } from "@/components/app/app-shell";
import { PageHeader } from "@/components/app/page-header";
import { ResponsiveAmount } from "@/components/ui/responsive-amount";
import { getAccounts, summarizeAccountPosition } from "@/lib/accounts/supabase";
import { getCategories } from "@/lib/categories/supabase";
import { formatCurrencyAmount } from "@/lib/currency";
import { buildFinancialReport, type FinancialReportGroup } from "@/lib/reports/financial-report";
import { getUserSafely } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/server";
import { getDefaultTransactionDateRange } from "@/lib/transactions/date-range";
import { getTransactions } from "@/lib/transactions/supabase";

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function groupValue(value: string | undefined): FinancialReportGroup {
  return value === "account" || value === "category" ? value : "month";
}

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ dateFrom?: string | string[]; dateTo?: string | string[]; group?: string | string[] }>;
}) {
  const params = await searchParams;
  const defaults = getDefaultTransactionDateRange();
  const dateFrom = first(params.dateFrom) || defaults.dateFrom;
  const dateTo = first(params.dateTo) || defaults.dateTo;
  const group = groupValue(first(params.group));
  const supabase = await createClient();
  const { user } = await getUserSafely(supabase);
  const [accounts, categories] = user
    ? await Promise.all([
      getAccounts(supabase, user.id, { asOfDate: dateTo, limit: 500 }),
      getCategories({ limit: 500 }),
    ])
    : [[], []];
  const transactions = user ? await getTransactions(supabase, user.id, accounts, categories) : [];
  const report = buildFinancialReport(transactions, { dateFrom, dateTo, group });
  const position = summarizeAccountPosition(accounts);
  const baseCurrency = accounts[0]?.baseCurrency ?? "MMK";
  const exportQuery = new URLSearchParams({ dataset: "report", dateFrom, dateTo, group }).toString();

  return (
    <AppShell activeNavLabel="Reports" mobileSubtitle="Reports">
      <PageHeader description="Analyze finalized Credits and Debits in your base currency, then download the same result as CSV, Excel, or PDF." title="Reports" />

      <form className="grid gap-3 rounded-lg border border-[#c6c6cd]/70 bg-white p-4 md:grid-cols-4" method="get">
        <label className="text-xs font-bold uppercase text-[#45464d]">From<input className="mt-2 h-11 w-full rounded-md border border-[#c6c6cd] px-3 text-sm" defaultValue={dateFrom} name="dateFrom" type="date" /></label>
        <label className="text-xs font-bold uppercase text-[#45464d]">To<input className="mt-2 h-11 w-full rounded-md border border-[#c6c6cd] px-3 text-sm" defaultValue={dateTo} name="dateTo" type="date" /></label>
        <label className="text-xs font-bold uppercase text-[#45464d]">Group by<select className="mt-2 h-11 w-full rounded-md border border-[#c6c6cd] bg-white px-3 text-sm" defaultValue={group} name="group"><option value="month">Month</option><option value="category">Category</option><option value="account">Account</option></select></label>
        <button className="mt-auto h-11 rounded-md bg-[#0b1c30] px-4 text-sm font-semibold text-white" type="submit">Run report</button>
      </form>

      <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[
          ["Credits", report.credit, "text-[#047857]"],
          ["Debits", report.debit, "text-[#b42318]"],
          ["Net", report.net, report.net < 0 ? "text-[#b42318]" : "text-[#0058be]"],
          ["Account position", position.net, position.net < 0 ? "text-[#b42318]" : "text-[#0b1c30]"],
        ].map(([label, value, tone]) => (
          <article className="rounded-lg border border-[#c6c6cd]/70 bg-white p-4" key={String(label)}>
            <p className="text-xs font-bold uppercase text-[#45464d]">{label}</p>
            <ResponsiveAmount className={`mt-2 text-xl font-bold ${tone}`} maxSizeRem={1.5}>{formatCurrencyAmount(Number(value), baseCurrency)}</ResponsiveAmount>
          </article>
        ))}
      </div>

      <section className="mt-5 overflow-hidden rounded-lg border border-[#c6c6cd]/70 bg-white">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#c6c6cd]/50 px-4 py-3">
          <div>
            <h2 className="font-semibold text-[#0b1c30]">Financial report by {group}</h2>
            <p className="mt-1 text-xs font-medium text-[#45464d]">{report.transactionCount} finalized records · {baseCurrency} base currency</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {["csv", "xlsx", "pdf"].map((format) => <Link className="rounded-md border border-[#c6c6cd] px-3 py-2 text-xs font-bold uppercase text-[#0058be]" href={`/api/exports/financial?${exportQuery}&format=${format}`} key={format}>{format === "xlsx" ? "Excel" : format}</Link>)}
          </div>
        </div>
        {report.excludedMissingRates > 0 ? <p className="border-b border-[#fde68a] bg-[#fffbeb] px-4 py-3 text-sm font-semibold text-[#92400e]">{report.excludedMissingRates} record(s) were excluded because their account currency has no applicable dated rate.</p> : null}
        <div className="overflow-x-auto">
          <table className="w-full min-w-[680px] text-left text-sm">
            <thead className="bg-[#f8f9ff] text-xs uppercase text-[#45464d]"><tr><th className="px-4 py-3">{group}</th><th className="px-4 py-3 text-right">Credits</th><th className="px-4 py-3 text-right">Debits</th><th className="px-4 py-3 text-right">Net</th><th className="px-4 py-3 text-right">Records</th></tr></thead>
            <tbody className="divide-y divide-[#c6c6cd]/40">
              {report.rows.map((row) => <tr key={row.label}><td className="px-4 py-3 font-semibold text-[#0b1c30]">{row.label}</td><td className="px-4 py-3 text-right text-[#047857]">{formatCurrencyAmount(row.credit, baseCurrency)}</td><td className="px-4 py-3 text-right text-[#b42318]">{formatCurrencyAmount(row.debit, baseCurrency)}</td><td className="px-4 py-3 text-right font-semibold">{formatCurrencyAmount(row.net, baseCurrency)}</td><td className="px-4 py-3 text-right">{row.transactionCount}</td></tr>)}
              {report.rows.length === 0 ? <tr><td className="px-4 py-10 text-center text-[#45464d]" colSpan={5}>No finalized Credits or Debits in this range.</td></tr> : null}
            </tbody>
          </table>
        </div>
      </section>
    </AppShell>
  );
}
