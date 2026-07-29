"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { deleteExchangeRate, saveExchangeRate, setBaseCurrency } from "@/app/settings/actions";
import { LoadingButton } from "@/components/ui/loading-state";
import { useToast } from "@/components/ui/toast-provider";
import type { CurrencySettings } from "@/lib/currency-conversion";

const supportedCurrencies = ["MMK", "USD", "EUR", "GBP", "SGD", "THB", "CNY", "JPY", "AUD"];

export function CurrencySettingsForm({ settings }: { settings: CurrencySettings }) {
  const router = useRouter();
  const { showError, showSuccess } = useToast();
  const [baseCurrency, setBaseCurrencyValue] = useState(settings.baseCurrency);
  const [currencyCode, setCurrencyCode] = useState("USD");
  const [effectiveDate, setEffectiveDate] = useState(new Date().toISOString().slice(0, 10));
  const [rate, setRate] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  async function saveBase() {
    setIsSaving(true);
    const result = await setBaseCurrency(baseCurrency);
    setIsSaving(false);
    if (result.error) return showError(result.error);
    showSuccess("Base currency updated.");
    router.refresh();
  }

  async function saveRate() {
    setIsSaving(true);
    const result = await saveExchangeRate({ currencyCode, effectiveDate, rateToBase: Number(rate) });
    setIsSaving(false);
    if (result.error) return showError(result.error);
    setRate("");
    showSuccess("Exchange rate saved.");
    router.refresh();
  }

  async function removeRate(code: string, date: string) {
    setIsSaving(true);
    const result = await deleteExchangeRate(code, date);
    setIsSaving(false);
    if (result.error) return showError(result.error);
    showSuccess("Exchange rate removed.");
    router.refresh();
  }

  return (
    <div className="grid gap-6 lg:grid-cols-12">
      <section className="rounded-xl border border-[#c6c6cd]/70 bg-white p-5 shadow-sm lg:col-span-5">
        <h2 className="text-lg font-semibold text-[#0b1c30]">Base currency</h2>
        <p className="mt-1 text-sm leading-6 text-[#45464d]">All cross-account totals and reports convert into this currency. Native account values remain unchanged.</p>
        <label className="mt-5 block text-xs font-bold uppercase text-[#45464d]" htmlFor="base-currency">Currency</label>
        <select className="mt-2 h-12 w-full rounded-lg border border-[#c6c6cd] bg-white px-4" id="base-currency" onChange={(event) => setBaseCurrencyValue(event.target.value)} value={baseCurrency}>
          {supportedCurrencies.map((currency) => <option key={currency}>{currency}</option>)}
        </select>
        <LoadingButton className="mt-4 min-h-11 rounded-md bg-[#0b1c30] px-5 text-sm font-semibold text-white" isLoading={isSaving} loadingLabel="Saving…" onClick={saveBase} type="button">Save base currency</LoadingButton>
      </section>

      <section className="rounded-xl border border-[#c6c6cd]/70 bg-white p-5 shadow-sm lg:col-span-7">
        <h2 className="text-lg font-semibold text-[#0b1c30]">Historical exchange rates</h2>
        <p className="mt-1 text-sm leading-6 text-[#45464d]">Enter how many {settings.baseCurrency} equal one unit of the selected currency. The latest rate on or before a transaction date is used.</p>
        <div className="mt-5 grid gap-3 sm:grid-cols-3">
          <select aria-label="Rate currency" className="h-12 rounded-lg border border-[#c6c6cd] bg-white px-4" onChange={(event) => setCurrencyCode(event.target.value)} value={currencyCode}>
            {supportedCurrencies.filter((currency) => currency !== settings.baseCurrency).map((currency) => <option key={currency}>{currency}</option>)}
          </select>
          <input aria-label="Rate effective date" className="h-12 rounded-lg border border-[#c6c6cd] px-4" onChange={(event) => setEffectiveDate(event.target.value)} type="date" value={effectiveDate} />
          <input aria-label="Rate to base" className="h-12 rounded-lg border border-[#c6c6cd] px-4" inputMode="decimal" onChange={(event) => setRate(event.target.value)} placeholder={`1 ${currencyCode} in ${settings.baseCurrency}`} value={rate} />
        </div>
        <LoadingButton className="mt-4 min-h-11 rounded-md bg-[#0058be] px-5 text-sm font-semibold text-white" disabled={!rate} isLoading={isSaving} loadingLabel="Saving…" onClick={saveRate} type="button">Add or update rate</LoadingButton>
      </section>

      <section className="overflow-hidden rounded-xl border border-[#c6c6cd]/70 bg-white lg:col-span-12">
        <div className="border-b border-[#c6c6cd]/60 bg-[#f8f9ff] px-5 py-4"><h2 className="font-semibold text-[#0b1c30]">Saved rates</h2></div>
        {settings.rates.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[620px] text-left text-sm">
              <thead><tr><th className="px-5 py-3">Currency</th><th className="px-5 py-3">Effective date</th><th className="px-5 py-3 text-right">Rate to {settings.baseCurrency}</th><th className="px-5 py-3 text-right">Action</th></tr></thead>
              <tbody className="divide-y divide-[#c6c6cd]/40">
                {settings.rates.map((item) => (
                  <tr key={`${item.currencyCode}:${item.effectiveDate}`}>
                    <td className="px-5 py-3 font-semibold">{item.currencyCode}</td>
                    <td className="px-5 py-3">{item.effectiveDate}</td>
                    <td className="px-5 py-3 text-right font-mono">{item.rateToBase}</td>
                    <td className="px-5 py-3 text-right"><button className="min-h-10 px-3 font-semibold text-[#b42318]" disabled={isSaving} onClick={() => removeRate(item.currencyCode, item.effectiveDate)} type="button">Remove</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <p className="p-6 text-sm text-[#45464d]">No conversion rates saved. Accounts in {settings.baseCurrency} still aggregate at a rate of 1.</p>}
      </section>
    </div>
  );
}
