"use client";

import Link from "next/link";
import { useState } from "react";

import { syncTransactions, type TransactionSyncResult } from "@/app/transactions/actions";
import { LoadingButton } from "@/components/ui/loading-state";
import { useToast } from "@/components/ui/toast-provider";
import type { AccountRecord } from "@/lib/accounts/supabase";
import type { CategoryRecord } from "@/lib/categories/supabase";
import { parseTransactionImportCsv, transactionImportTemplate } from "@/lib/transactions/import";

export function ImportTransactionsForm({
  accounts,
  categories,
}: {
  accounts: AccountRecord[];
  categories: CategoryRecord[];
}) {
  const { showError, showSuccess } = useToast();
  const [csv, setCsv] = useState("");
  const [isImporting, setIsImporting] = useState(false);
  const [result, setResult] = useState<TransactionSyncResult | null>(null);
  const parsed = csv ? parseTransactionImportCsv(csv) : { errors: [], rows: [] };
  const templateHref = `data:text/csv;charset=utf-8,${encodeURIComponent(transactionImportTemplate())}`;

  async function runImport() {
    if (parsed.errors.length > 0 || parsed.rows.length === 0) {
      showError(parsed.errors[0] ?? "Add at least one valid transaction.");
      return;
    }
    setIsImporting(true);
    const nextResult = await syncTransactions(parsed.rows);
    setIsImporting(false);
    setResult(nextResult);
    if (nextResult.errors.length > 0) showError(`${nextResult.errors.length} row(s) need attention.`);
    else showSuccess(`Import complete: ${nextResult.created} created, ${nextResult.updated} updated, ${nextResult.skipped} unchanged.`);
  }

  return (
    <div className="grid gap-6 xl:grid-cols-12">
      <section className="rounded-xl border border-[#c6c6cd]/70 bg-white p-5 shadow-sm xl:col-span-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-[#0b1c30]">CSV or synchronized records</h2>
            <p className="mt-1 text-sm text-[#45464d]">Each source and external ID pair is permanent and idempotent. Changed rows update their linked transaction group.</p>
          </div>
          <a className="inline-flex min-h-11 items-center rounded-md border border-[#2170e4] px-4 text-sm font-semibold text-[#0058be]" download="finance-pro-import-template.csv" href={templateHref}>Download template</a>
        </div>
        <textarea
          aria-label="Transaction CSV"
          className="mt-5 min-h-72 w-full rounded-lg border border-[#c6c6cd] bg-[#f8f9ff] p-4 font-mono text-xs leading-6 text-[#0b1c30] outline-none focus:border-[#2170e4] focus:ring-2 focus:ring-[#2170e4]/20"
          onChange={(event) => {
            setCsv(event.target.value);
            setResult(null);
          }}
          placeholder={transactionImportTemplate()}
          value={csv}
        />
        <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm font-medium text-[#45464d]">{parsed.rows.length} valid row(s) · {parsed.errors.length} error(s)</p>
          <div className="flex gap-3">
            <Link className="inline-flex min-h-11 items-center px-4 text-sm font-semibold text-[#45464d]" href="/transactions">Cancel</Link>
            <LoadingButton className="inline-flex min-h-11 items-center rounded-md bg-[#0b1c30] px-5 text-sm font-semibold text-white" disabled={parsed.rows.length === 0 || parsed.errors.length > 0} isLoading={isImporting} loadingLabel="Importing…" onClick={runImport} type="button">Import / Sync</LoadingButton>
          </div>
        </div>
        {parsed.errors.length > 0 ? (
          <ul className="mt-4 space-y-1 rounded-lg border border-[#fecaca] bg-[#fff1f0] p-4 text-sm text-[#991b1b]">
            {parsed.errors.slice(0, 20).map((error) => <li key={error}>{error}</li>)}
          </ul>
        ) : null}
        {result ? (
          <div className="mt-4 rounded-lg border border-[#bbf7d0] bg-[#ecfdf5] p-4 text-sm text-[#166534]">
            Created {result.created}; updated {result.updated}; unchanged {result.skipped}; errors {result.errors.length}.
          </div>
        ) : null}
      </section>

      <aside className="space-y-4 xl:col-span-4">
        <section className="rounded-xl border border-[#c6c6cd]/70 bg-white p-5">
          <h2 className="font-semibold text-[#0b1c30]">Account IDs</h2>
          <ul className="mt-3 space-y-3 text-xs">
            {accounts.map((account) => <li className="break-all" key={account.id}><strong>{account.name}</strong><br />{account.id}</li>)}
          </ul>
        </section>
        <section className="rounded-xl border border-[#c6c6cd]/70 bg-white p-5">
          <h2 className="font-semibold text-[#0b1c30]">Category IDs</h2>
          <ul className="mt-3 max-h-80 space-y-3 overflow-auto text-xs">
            {categories.filter((category) => category.level === "Subcategory").map((category) => <li className="break-all" key={category.id}><strong>{category.name}</strong><br />{category.id}</li>)}
          </ul>
        </section>
      </aside>
    </div>
  );
}
