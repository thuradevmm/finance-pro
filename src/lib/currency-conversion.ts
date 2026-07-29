import { roundCurrencyValue } from "./ledger.ts";

export type CurrencyRate = {
  currencyCode: string;
  effectiveDate: string;
  rateToBase: number;
};

export type CurrencySettings = {
  baseCurrency: string;
  rates: CurrencyRate[];
};

export function normalizeCurrencyCode(value: unknown, fallback = "MMK") {
  const code = String(value ?? "").trim().toUpperCase();
  return /^[A-Z]{3}$/.test(code) ? code : fallback;
}

export function exchangeRateFor(
  settings: CurrencySettings,
  currencyCode: unknown,
  asOfDate = "9999-12-31",
) {
  const sourceCurrency = normalizeCurrencyCode(currencyCode, settings.baseCurrency);
  if (sourceCurrency === settings.baseCurrency) return 1;
  const rate = settings.rates
    .filter((item) => item.currencyCode === sourceCurrency && item.effectiveDate <= asOfDate)
    .sort((left, right) => right.effectiveDate.localeCompare(left.effectiveDate))[0];
  return rate && Number.isFinite(rate.rateToBase) && rate.rateToBase > 0 ? rate.rateToBase : null;
}

export function convertToBaseCurrency(
  amount: number,
  currencyCode: unknown,
  settings: CurrencySettings,
  asOfDate?: string,
) {
  const rate = exchangeRateFor(settings, currencyCode, asOfDate);
  return rate == null ? null : roundCurrencyValue(amount * rate);
}

export function missingCurrencyRates(
  currencies: Iterable<string>,
  settings: CurrencySettings,
  asOfDate?: string,
) {
  return Array.from(new Set(Array.from(currencies, (currency) => normalizeCurrencyCode(currency))))
    .filter((currency) => exchangeRateFor(settings, currency, asOfDate) == null)
    .sort();
}
