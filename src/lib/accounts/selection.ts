import type { AccountRecord } from "@/lib/accounts/supabase";

export const uncategorizedAccountLabel = "Uncategorized";

export function accountCategoryLabel(account: Pick<AccountRecord, "category">) {
  return account.category.trim() || uncategorizedAccountLabel;
}

export function sortAccountsByCategory<T extends Pick<AccountRecord, "category" | "id" | "institution" | "name">>(accounts: T[]) {
  return [...accounts].sort((first, second) => {
    const categoryOrder = accountCategoryLabel(first).localeCompare(accountCategoryLabel(second), undefined, {
      numeric: true,
      sensitivity: "base",
    });
    if (categoryOrder !== 0) return categoryOrder;

    const nameOrder = first.name.localeCompare(second.name, undefined, { numeric: true, sensitivity: "base" });
    if (nameOrder !== 0) return nameOrder;

    const institutionOrder = first.institution.localeCompare(second.institution, undefined, { numeric: true, sensitivity: "base" });
    return institutionOrder || first.id.localeCompare(second.id);
  });
}

export function getAccountCategoryOptions(accounts: AccountRecord[]) {
  return Array.from(new Set(sortAccountsByCategory(accounts).map(accountCategoryLabel)));
}

export function getAccountsForCategory(accounts: AccountRecord[], category: string) {
  return sortAccountsByCategory(accounts.filter((account) => accountCategoryLabel(account) === category));
}

export function getAccountCategoryForId(accounts: AccountRecord[], accountId: string) {
  const account = accounts.find((item) => item.id === accountId);
  return account ? accountCategoryLabel(account) : getAccountCategoryOptions(accounts)[0] ?? "";
}
