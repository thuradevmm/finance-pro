import type { SupabaseClient } from "@supabase/supabase-js";

import {
  normalizeCurrencyCode,
  type CurrencyRate,
  type CurrencySettings,
} from "@/lib/currency-conversion";
import { isMissingDatabaseObject } from "@/lib/supabase/schema-compat";

type RateRow = {
  currency_code: string;
  effective_date: string;
  rate_to_base: number | string;
};

export async function getCurrencySettings(
  supabase: SupabaseClient,
  userId: string,
  asOfDate?: string,
): Promise<CurrencySettings> {
  const [settingsResult, ratesResult] = await Promise.all([
    supabase.from("user_settings").select("currency_code").eq("user_id", userId).maybeSingle(),
    (() => {
      const query = supabase
        .from("currency_exchange_rates")
        .select("currency_code,effective_date,rate_to_base")
        .eq("user_id", userId)
        .order("effective_date", { ascending: false });
      return asOfDate ? query.lte("effective_date", asOfDate) : query;
    })(),
  ]);
  const baseCurrency = normalizeCurrencyCode(settingsResult.data?.currency_code);
  if (ratesResult.error && !isMissingDatabaseObject(ratesResult.error, ["currency_exchange_rates"])) {
    throw new Error(ratesResult.error.message);
  }
  const rates: CurrencyRate[] = ((ratesResult.data ?? []) as RateRow[]).map((row) => ({
    currencyCode: normalizeCurrencyCode(row.currency_code),
    effectiveDate: row.effective_date,
    rateToBase: Number(row.rate_to_base),
  }));
  return { baseCurrency, rates };
}
