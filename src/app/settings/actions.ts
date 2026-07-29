"use server";

import { revalidatePath } from "next/cache";

import { normalizeCurrencyCode } from "@/lib/currency-conversion";
import { getUserSafely } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/server";

type SettingsActionResult = { error?: string };

function revalidateCurrencyPaths() {
  for (const path of ["/settings", "/accounts", "/dashboard", "/reports", "/transactions"]) revalidatePath(path);
}

export async function setBaseCurrency(currencyCode: string): Promise<SettingsActionResult> {
  const supabase = await createClient();
  const { user } = await getUserSafely(supabase);
  if (!user) return { error: "You must be signed in." };
  const normalized = normalizeCurrencyCode(currencyCode, "");
  if (!normalized) return { error: "Choose a valid three-letter currency code." };

  const { data: settings } = await supabase
    .from("user_settings")
    .select("currency_code")
    .eq("user_id", user.id)
    .maybeSingle();
  const current = normalizeCurrencyCode(settings?.currency_code);
  if (current !== normalized) {
    const { count, error: rateError } = await supabase
      .from("currency_exchange_rates")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id);
    if (rateError) return { error: rateError.message };
    if ((count ?? 0) > 0) {
      return { error: "Remove existing exchange rates before changing the base currency so historical conversions cannot be silently reinterpreted." };
    }
  }
  const { error } = await supabase.from("user_settings").upsert({
    currency_code: normalized,
    user_id: user.id,
  }, { onConflict: "user_id" });
  if (error) return { error: error.message };
  revalidateCurrencyPaths();
  return {};
}
export async function saveExchangeRate(input: {
  currencyCode: string;
  effectiveDate: string;
  rateToBase: number;
}): Promise<SettingsActionResult> {
  const supabase = await createClient();
  const { user } = await getUserSafely(supabase);
  if (!user) return { error: "You must be signed in." };
  const currencyCode = normalizeCurrencyCode(input.currencyCode, "");
  if (!currencyCode) return { error: "Enter a valid three-letter currency code." };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.effectiveDate)) return { error: "Choose a valid effective date." };
  if (!Number.isFinite(input.rateToBase) || input.rateToBase <= 0) return { error: "Exchange rate must be greater than zero." };
  const { data: settings } = await supabase.from("user_settings").select("currency_code").eq("user_id", user.id).maybeSingle();
  if (currencyCode === normalizeCurrencyCode(settings?.currency_code)) {
    return { error: "The base currency always has a rate of 1 and does not need a saved rate." };
  }
  const { error } = await supabase.from("currency_exchange_rates").upsert({
    currency_code: currencyCode,
    effective_date: input.effectiveDate,
    rate_to_base: input.rateToBase,
    user_id: user.id,
  }, { onConflict: "user_id,currency_code,effective_date" });
  if (error) return { error: error.message };
  revalidateCurrencyPaths();
  return {};
}

export async function deleteExchangeRate(currencyCode: string, effectiveDate: string): Promise<SettingsActionResult> {
  const supabase = await createClient();
  const { user } = await getUserSafely(supabase);
  if (!user) return { error: "You must be signed in." };
  const { error } = await supabase
    .from("currency_exchange_rates")
    .delete()
    .eq("user_id", user.id)
    .eq("currency_code", normalizeCurrencyCode(currencyCode, ""))
    .eq("effective_date", effectiveDate);
  if (error) return { error: error.message };
  revalidateCurrencyPaths();
  return {};
}
