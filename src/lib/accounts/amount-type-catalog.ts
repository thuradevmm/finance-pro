import type { SupabaseClient } from "@supabase/supabase-js";

import { accountAmountTypeValues } from "./amount-types.ts";
import { isMissingDatabaseObject } from "../supabase/schema-compat.ts";

type CatalogRow = {
  is_active: boolean;
  name: string;
  sort_order: number;
};

type AccountMetadataRow = {
  metadata: unknown;
};

function amountTypeKey(value: string) {
  return value.trim().toLowerCase();
}

export function mergeAmountTypeCatalog(
  catalogRows: CatalogRow[],
  accountRows: AccountMetadataRow[],
) {
  const names = new Map<string, string>();

  for (const row of catalogRows) {
    const name = row.name.trim();
    if (row.is_active && name) names.set(amountTypeKey(name), name);
  }
  for (const account of accountRows) {
    for (const amountType of accountAmountTypeValues(account.metadata)) {
      const name = amountType.type.trim();
      if (name && !names.has(amountTypeKey(name))) names.set(amountTypeKey(name), name);
    }
  }

  if (names.size === 0) names.set("operation", "Operation");
  return Array.from(names.values());
}

export async function getAccountAmountTypeCatalog(supabase: SupabaseClient, userId: string) {
  const [catalogResult, accountsResult] = await Promise.all([
    supabase
      .from("account_amount_types")
      .select("name,is_active,sort_order")
      .eq("user_id", userId)
      .is("deleted_at", null)
      .order("sort_order", { ascending: true })
      .order("name", { ascending: true }),
    supabase
      .from("accounts")
      .select("metadata")
      .eq("user_id", userId)
      .is("deleted_at", null),
  ]);

  if (catalogResult.error && !isMissingDatabaseObject(catalogResult.error, ["account_amount_types"])) {
    throw new Error(catalogResult.error.message);
  }
  if (accountsResult.error) throw new Error(accountsResult.error.message);
  return mergeAmountTypeCatalog(
    catalogResult.error ? [] : catalogResult.data as CatalogRow[],
    accountsResult.data as AccountMetadataRow[],
  );
}
