"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { deleteAccount as deleteAccountAction } from "@/app/accounts/actions";
import { AppShell } from "@/components/app/app-shell";
import { PageHeader } from "@/components/app/page-header";
import { SummaryCards } from "@/components/app/summary-cards";
import { DetailModal, DetailModalField, DetailModalSection } from "@/components/ui/detail-modal";
import { Icon } from "@/components/ui/icon";
import { RecordActions } from "@/components/ui/record-actions";
import { ResponsiveAmount } from "@/components/ui/responsive-amount";
import { SelectInput, TextInput } from "@/components/ui/form-controls";
import { compareSortValues, SortHeader, type SortDirection } from "@/components/ui/sort-header";
import { useToast } from "@/components/ui/toast-provider";
import { getAccountOptionLabel, getAccounts, getAccountSummaries, type AccountRecord } from "@/lib/accounts/supabase";
import { createClient } from "@/lib/supabase/client";
import { getUserSafely } from "@/lib/supabase/auth";
import type { AccountStatus, FinancialAccount } from "@/types/finance";

const statusStyles: Record<AccountStatus, string> = {
  Active: "border-[#86efac] bg-[#ecfdf5] text-[#166534]",
  "Needs Review": "border-[#fde68a] bg-[#fffbeb] text-[#92400e]",
  Archived: "border-[#e4e4e7] bg-[#f8f9ff] text-[#45464d]",
};

type AccountViewMode = "Card" | "List" | "Lookup";
type AccountSortKey = "account" | "balance" | "status" | "type";

function decimalScaleFromNumber(value: number) {
  if (!Number.isFinite(value)) return 0;
  const textValue = value.toFixed(2);
  if (!textValue.includes("e")) return textValue.split(".")[1]?.length ?? 0;

  const [, exponentText = "0"] = textValue.split("e-");
  const significantDigits = textValue.split("e-")[0]?.replace(".", "").replace("-", "").length ?? 0;
  return Math.max(Number(exponentText) + significantDigits - 1, 0);
}

function toScaledBigInt(value: number, scale: number) {
  if (!Number.isFinite(value)) return BigInt(0);
  const textValue = value.toFixed(Math.min(Math.max(scale, 0), 2));
  const isNegative = textValue.startsWith("-");
  const [wholePart, fractionPart = ""] = textValue.replace("-", "").split(".");
  const scaledText = `${wholePart}${fractionPart.padEnd(scale, "0")}`.replace(/^0+(?=\d)/, "");
  const scaledValue = BigInt(scaledText || "0");
  return isNegative ? -scaledValue : scaledValue;
}

function sumScaledAmounts(values: number[]) {
  const scale = Math.min(Math.max(0, ...values.map(decimalScaleFromNumber)), 2);
  const value = values.reduce((total, amount) => total + toScaledBigInt(amount, scale), BigInt(0));
  return { scale, value };
}

function formatScaledAuditAmount(value: bigint, scale: number) {
  const isNegative = value < BigInt(0);
  const absoluteText = (isNegative ? -value : value).toString().padStart(scale + 1, "0");
  const wholeText = scale > 0 ? absoluteText.slice(0, -scale) : absoluteText;
  const fractionText = scale > 0 ? absoluteText.slice(-scale) : "";
  const groupedWholeText = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0, useGrouping: true }).format(Number(wholeText));
  const displayScale = Math.min(Math.max(2, scale), 2);
  const displayFraction = fractionText.padEnd(displayScale, "0");

  return `${isNegative ? "-" : ""}${groupedWholeText}.${displayFraction}`;
}

function formatAuditAmount(value: number) {
  const scaledAmount = sumScaledAmounts([value]);
  return formatScaledAuditAmount(scaledAmount.value, scaledAmount.scale);
}

function StatusBadge({ status }: { status: AccountStatus }) {
  return (
    <span className={`inline-flex h-8 items-center rounded-md border px-2.5 text-xs font-bold ${statusStyles[status]}`}>
      {status}
    </span>
  );
}

function isCreditCardAccount(account: Pick<AccountRecord, "type">) {
  return account.type === "Credit Card";
}

function AccountCard({
  account,
  accounts,
  onDelete,
  onView,
  returnTo,
}: {
  account: AccountRecord;
  accounts: AccountRecord[];
  onDelete: (id: string) => void;
  onView: (account: AccountRecord) => void;
  returnTo: string;
}) {
  const isCreditCard = isCreditCardAccount(account);
  const primaryAmountLabel = isCreditCard ? "Available Credit" : "Total Amount";
  const primaryAmountClassName = isCreditCard ? "text-[#0058be]" : account.balance.startsWith("-") ? "text-[#b42318]" : "text-[#0b1c30]";
  const breakdowns = isCreditCard ? account.availableBreakdowns : account.balanceBreakdowns;

  return (
    <article className="flex h-full flex-col rounded-lg border border-[#c6c6cd]/60 bg-white p-5 shadow-[0_4px_20px_rgba(15,23,42,0.04)]">
      <div className="flex items-start justify-between gap-4">
        <div className="flex min-w-0 gap-3">
          <span className={`grid size-11 shrink-0 place-items-center rounded-lg ${account.bg} ${account.tone}`}>
            <Icon name={account.icon} />
          </span>
          <div className="min-w-0">
            <h2 className="truncate text-base font-semibold text-[#0b1c30]">{account.name}</h2>
            <p className="mt-1 truncate text-sm font-medium text-[#45464d]">
              {account.institution} {account.accountNumber}
            </p>
            <p className="mt-1 truncate text-xs font-semibold text-[#0058be]">{account.category || "Uncategorized"}</p>
          </div>
        </div>
        <StatusBadge status={account.status} />
      </div>

      <div className="mt-5">
        <p className="text-xs font-bold uppercase text-[#45464d]">{primaryAmountLabel}</p>
        <ResponsiveAmount className={`mt-2 font-semibold ${primaryAmountClassName}`}>
          {account.balance}
        </ResponsiveAmount>
      </div>

      <dl className="mt-5 grid grid-cols-2 gap-3 rounded-lg border border-[#c6c6cd]/40 bg-[#f8f9ff] p-4">
        <div>
          <dt className="text-xs font-bold uppercase text-[#45464d]">{isCreditCard ? "Payments" : "Inflow"}</dt>
          <dd><ResponsiveAmount className="mt-1 font-semibold text-[#047857]" maxSizeRem={0.875}>{account.monthlyInflow}</ResponsiveAmount></dd>
        </div>
        <div>
          <dt className="text-xs font-bold uppercase text-[#45464d]">{isCreditCard ? "Charges" : "Outflow"}</dt>
          <dd><ResponsiveAmount className="mt-1 font-semibold text-[#b42318]" maxSizeRem={0.875}>{account.monthlyOutflow}</ResponsiveAmount></dd>
        </div>
        <div>
          <dt className="text-xs font-bold uppercase text-[#45464d]">{isCreditCard ? "Credit Used" : "Net Amount"}</dt>
          <dd><ResponsiveAmount className={`mt-1 font-semibold ${isCreditCard ? "text-[#b42318]" : "text-[#0b1c30]"}`} maxSizeRem={0.875}>{isCreditCard ? account.creditUsed : account.availableBalance}</ResponsiveAmount></dd>
        </div>
        <div>
          <dt className="text-xs font-bold uppercase text-[#45464d]">Transactions</dt>
          <dd className="mt-1 text-sm font-semibold text-[#0b1c30]">{account.transactionCount}</dd>
        </div>
      </dl>
      <dl className="mt-3 grid grid-cols-2 gap-3 rounded-lg border border-[#c6c6cd]/40 bg-white p-4">
        {breakdowns.map((breakdown) => (
          <div key={breakdown.type}>
            <dt className="text-xs font-bold uppercase text-[#45464d]">{isCreditCard ? breakdown.type : `${breakdown.type} Total`}</dt>
            <dd><ResponsiveAmount className={`mt-1 font-semibold ${breakdown.type === "Credit Used" ? "text-[#b42318]" : "text-[#0b1c30]"}`} maxSizeRem={0.875}>{breakdown.amount}</ResponsiveAmount></dd>
          </div>
        ))}
      </dl>

      <div className="mt-auto flex items-center justify-end gap-1 border-t border-[#c6c6cd]/40 pt-4">
        <button
          aria-label={`View ${account.name}`}
          className="grid size-8 place-items-center rounded-full text-[#45464d] transition hover:bg-[#eff4ff] hover:text-[#0b1c30]"
          onClick={() => onView(account)}
          title="View account"
          type="button"
        >
          <Icon className="size-4" name="eye" />
        </button>
        <RecordActions editHref={`/accounts/${account.id}/edit?returnTo=${encodeURIComponent(returnTo)}`} itemId={account.id} itemLabel={account.name} onDelete={onDelete} />
        <Link
          aria-label={`View transactions for ${account.name}`}
          className="grid size-8 place-items-center rounded-full text-[#0058be] transition hover:bg-[#eff4ff]"
          href={`/transactions?account=${encodeURIComponent(getAccountOptionLabel(account, accounts))}`}
          title="View transactions"
        >
          <Icon className="size-4" name="receipt" />
        </Link>
      </div>
    </article>
  );
}

function AccountAmountTypeMatrix({ accounts }: { accounts: FinancialAccount[] }) {
  const ledgerAccounts = accounts.filter((account) => account.type !== "Credit Card");
  const creditAccounts = accounts.filter((account): account is AccountRecord => account.type === "Credit Card");
  const amountTypes = Array.from(
    ledgerAccounts.reduce((types, account) => {
      for (const breakdown of account.balanceBreakdowns) types.add(breakdown.type);
      return types;
    }, new Set<string>()),
  );
  const totalColumns = amountTypes.map((amountType) => ({
    amountType,
    total: sumScaledAmounts(ledgerAccounts.map((account) => account.balanceBreakdowns.find((breakdown) => breakdown.type === amountType)?.amountValue ?? 0)),
  }));
  const grandTotal = sumScaledAmounts(ledgerAccounts.flatMap((account) => account.balanceBreakdowns.map((breakdown) => breakdown.amountValue)));

  return (
    <div className="space-y-6">
      <section className="mb-6 overflow-hidden rounded-lg border border-[#c6c6cd]/70 bg-white shadow-[0_4px_20px_rgba(15,23,42,0.04)]">
        <div className="border-b border-[#c6c6cd]/50 bg-[#f8f9ff] px-4 py-3">
          <h2 className="text-sm font-bold uppercase text-[#45464d]">Amount Type Lookup</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1040px] border-collapse text-left">
            <thead>
              <tr className="border-b border-[#c6c6cd]/50">
                <th className="px-4 py-3 text-xs font-semibold text-[#45464d]">Source</th>
                <th className="px-4 py-3 text-xs font-semibold text-[#45464d]">Type</th>
                {amountTypes.map((amountType) => (
                  <th className="px-4 py-3 text-right text-xs font-semibold text-[#45464d]" key={amountType}>{amountType}</th>
                ))}
                <th className="px-4 py-3 text-right text-xs font-semibold text-[#45464d]">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#c6c6cd]/40 text-sm">
              {ledgerAccounts.map((account) => {
                const breakdownByType = new Map(account.balanceBreakdowns.map((breakdown) => [breakdown.type, breakdown.amountValue]));
                const rowTotal = sumScaledAmounts(account.balanceBreakdowns.map((breakdown) => breakdown.amountValue));

                return (
                  <tr className="transition hover:bg-[#f8f9ff]" key={account.id}>
                    <td className="px-4 py-4">
                      <div className="flex items-center gap-3">
                        <span className={`grid size-10 shrink-0 place-items-center rounded-lg ${account.bg} ${account.tone}`}>
                          <Icon className="size-5" name={account.icon} />
                        </span>
                        <div>
                          <p className="font-semibold text-[#0b1c30]">{account.institution || account.type}</p>
                          <p className="mt-1 text-xs font-medium text-[#45464d]">{account.category || "Uncategorized"}</p>
                        </div>
                      </div>
                    </td>
                    <td className="whitespace-nowrap px-4 py-4 font-medium text-[#45464d]">{account.name}</td>
                    {amountTypes.map((amountType) => (
                      <td className="whitespace-nowrap px-4 py-4 text-right font-semibold text-[#0b1c30]" key={amountType}>
                        {formatAuditAmount(breakdownByType.get(amountType) ?? 0)}
                      </td>
                    ))}
                    <td className="whitespace-nowrap px-4 py-4 text-right font-semibold text-[#0b1c30]">{formatScaledAuditAmount(rowTotal.value, rowTotal.scale)}</td>
                  </tr>
                );
              })}
              <tr className="transition hover:bg-[#f8f9ff]">
                <td className="px-4 py-4 font-semibold uppercase text-[#0b1c30]">TOTAL</td>
                <td className="whitespace-nowrap px-4 py-4 font-medium text-[#45464d]">Total</td>
                {totalColumns.map(({ amountType, total }) => (
                  <td className="whitespace-nowrap px-4 py-4 text-right font-semibold text-[#0b1c30]" key={amountType}>
                    {formatScaledAuditAmount(total.value, total.scale)}
                  </td>
                ))}
                <td className="whitespace-nowrap px-4 py-4 text-right font-semibold text-[#0b1c30]">{formatScaledAuditAmount(grandTotal.value, grandTotal.scale)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
      {creditAccounts.length > 0 ? (
        <section className="mb-6 overflow-hidden rounded-lg border border-[#c6c6cd]/70 bg-white shadow-[0_4px_20px_rgba(15,23,42,0.04)]">
          <div className="border-b border-[#c6c6cd]/50 bg-[#f8f9ff] px-4 py-3">
            <h2 className="text-sm font-bold uppercase text-[#45464d]">Credit Card Limits</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[980px] border-collapse text-left">
              <thead>
                <tr className="border-b border-[#c6c6cd]/50">
                  <th className="px-4 py-3 text-xs font-semibold text-[#45464d]">Card</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-[#45464d]">Credit Limit</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-[#45464d]">Credit Used</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-[#45464d]">Available Credit</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-[#45464d]">Minimum Payment</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-[#45464d]">Due Day</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#c6c6cd]/40 text-sm">
                {creditAccounts.map((account) => (
                  <tr className="transition hover:bg-[#f8f9ff]" key={account.id}>
                    <td className="px-4 py-4 font-semibold text-[#0b1c30]">{account.name}</td>
                    <td className="whitespace-nowrap px-4 py-4 text-right font-semibold text-[#0b1c30]">{account.creditLimit}</td>
                    <td className="whitespace-nowrap px-4 py-4 text-right font-semibold text-[#b42318]">{account.creditUsed}</td>
                    <td className="whitespace-nowrap px-4 py-4 text-right font-semibold text-[#0058be]">{account.creditAvailable}</td>
                    <td className="whitespace-nowrap px-4 py-4 text-right font-semibold text-[#0b1c30]">{account.creditMinimumPayment}</td>
                    <td className="whitespace-nowrap px-4 py-4 text-right font-semibold text-[#0b1c30]">{account.creditPaymentDueDay ?? "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}
    </div>
  );
}

function AccountsTable({
  accounts,
  items,
  onDelete,
  onView,
  returnTo,
}: {
  accounts: AccountRecord[];
  items: AccountRecord[];
  onDelete: (id: string) => void;
  onView: (account: AccountRecord) => void;
  returnTo: string;
}) {
  const [sortKey, setSortKey] = useState<AccountSortKey>("account");
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");
  const sortedItems = useMemo(() => {
    function value(account: AccountRecord) {
      if (sortKey === "account") return `${account.name} ${account.institution}`.toLowerCase();
      if (sortKey === "balance") return account.balanceValue;
      return String(account[sortKey]).toLowerCase();
    }
    return [...items].sort((first, second) => compareSortValues(value(first), value(second), sortDirection));
  }, [items, sortDirection, sortKey]);

  function handleSort(key: AccountSortKey) {
    setSortKey((currentKey) => {
      if (currentKey === key) {
        setSortDirection((direction) => (direction === "asc" ? "desc" : "asc"));
        return currentKey;
      }
      setSortDirection(key === "balance" ? "desc" : "asc");
      return key;
    });
  }

  return (
    <section className="overflow-hidden rounded-lg border border-[#c6c6cd]/70 bg-white shadow-[0_4px_20px_rgba(15,23,42,0.04)]">
      <div className="border-b border-[#c6c6cd]/50 bg-[#f8f9ff] px-4 py-3">
        <h2 className="text-sm font-bold uppercase text-[#45464d]">Account Register</h2>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] border-collapse text-left">
          <thead>
            <tr className="border-b border-[#c6c6cd]/50">
              <th className="px-4 py-3"><SortHeader onSort={() => handleSort("account")} sortDirection={sortKey === "account" ? sortDirection : undefined}>Account</SortHeader></th>
              <th className="px-4 py-3"><SortHeader onSort={() => handleSort("type")} sortDirection={sortKey === "type" ? sortDirection : undefined}>Type</SortHeader></th>
              <th className="px-4 py-3"><SortHeader onSort={() => handleSort("status")} sortDirection={sortKey === "status" ? sortDirection : undefined}>Status</SortHeader></th>
              <th className="px-4 py-3 text-right"><SortHeader align="right" onSort={() => handleSort("balance")} sortDirection={sortKey === "balance" ? sortDirection : undefined}>Balance / Credit</SortHeader></th>
              <th className="w-32 px-4 py-3 text-center text-xs font-semibold text-[#45464d]">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#c6c6cd]/40 text-sm">
            {sortedItems.map((account) => (
              <tr className="transition hover:bg-[#f8f9ff]" key={account.id}>
                <td className="px-4 py-4">
                  <div className="flex items-center gap-3">
                    <span className={`grid size-10 shrink-0 place-items-center rounded-lg ${account.bg} ${account.tone}`}>
                      <Icon className="size-5" name={account.icon} />
                    </span>
                    <div>
                      <p className="font-semibold text-[#0b1c30]">{account.name}</p>
                      <p className="mt-1 text-xs font-medium text-[#45464d]">
                        {account.institution} {account.accountNumber}
                      </p>
                    </div>
                  </div>
                </td>
                <td className="whitespace-nowrap px-4 py-4 font-medium text-[#45464d]">{account.type}</td>
                <td className="px-4 py-4">
                  <StatusBadge status={account.status} />
                </td>
                <td className={`whitespace-nowrap px-4 py-4 text-right font-semibold ${isCreditCardAccount(account) ? "text-[#0058be]" : account.balance.startsWith("-") ? "text-[#b42318]" : "text-[#0b1c30]"}`}>
                  {account.balance}
                </td>
                <td className="px-4 py-4">
                  <div className="flex justify-end gap-1">
                    <button
                      aria-label={`View ${account.name}`}
                      className="grid size-8 place-items-center rounded-full text-[#45464d] transition hover:bg-[#eff4ff] hover:text-[#0b1c30]"
                      onClick={() => onView(account)}
                      type="button"
                    >
                      <Icon className="size-4" name="eye" />
                    </button>
                    <RecordActions editHref={`/accounts/${account.id}/edit?returnTo=${encodeURIComponent(returnTo)}`} itemId={account.id} itemLabel={account.name} onDelete={onDelete} />
                    <Link
                      aria-label={`View transactions for ${account.name}`}
                      className="grid size-8 place-items-center rounded-full text-[#45464d] transition hover:bg-[#eff4ff] hover:text-[#0b1c30]"
                      href={`/transactions?account=${encodeURIComponent(getAccountOptionLabel(account, accounts))}`}
                    >
                      <Icon className="size-4" name="receipt" />
                    </Link>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export default function AccountsPage() {
  const { showError, showSuccess } = useToast();
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [visibleAccounts, setVisibleAccounts] = useState<AccountRecord[]>([]);
  const [viewedAccount, setViewedAccount] = useState<AccountRecord | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [isPending, setIsPending] = useState(false);
  const search = searchParams.get("q") ?? "";
  const viewParam = searchParams.get("view");
  const viewMode: AccountViewMode = viewParam === "Card" || viewParam === "Lookup" ? viewParam : "List";
  const categoryFilter = searchParams.get("accountCategory") ?? "All categories";
  const typeFilter = searchParams.get("accountType") ?? "All types";
  const statusFilter = searchParams.get("accountStatus") ?? "All statuses";
  const currentQuery = searchParams.toString();
  const returnTo = `${pathname}${currentQuery ? `?${currentQuery}` : ""}`;
  const addAccountHref = `/accounts/add?returnTo=${encodeURIComponent(returnTo)}`;
  const categoryOptions = useMemo(() => ["All categories", ...Array.from(new Set(visibleAccounts.map((account) => account.category || "Uncategorized")))], [visibleAccounts]);
  const typeOptions = useMemo(() => ["All types", ...Array.from(new Set(visibleAccounts.map((account) => account.type)))], [visibleAccounts]);
  const statusOptions = ["All statuses", "Active", "Needs Review", "Archived"];
  const filteredAccounts = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();

    return visibleAccounts.filter((account) => {
      const searchable = [
        account.name,
        account.institution,
        account.accountNumber,
        account.bankBookAccountNumber,
        account.cardNumber,
        account.cardType,
        account.cardExpiryCode,
        account.mobileBankingAccountNumber,
        account.phoneNumber,
        account.type,
        account.status,
        account.category,
        account.balance,
        account.availableBalance,
        account.creditLimit,
        account.creditUsed,
        account.creditAvailable,
        account.creditMinimumPayment,
        account.creditPaymentDueDay,
        account.creditStatementDay,
        ...account.balanceBreakdowns.map((item) => `${item.type} ${item.amount}`),
        ...account.availableBreakdowns.map((item) => `${item.type} ${item.amount}`),
      ].join(" ").toLowerCase();
      const matchesSearch = normalizedSearch === "" || searchable.includes(normalizedSearch);
      const matchesCategory = categoryFilter === "All categories" || (account.category || "Uncategorized") === categoryFilter;
      const matchesType = typeFilter === "All types" || account.type === typeFilter;
      const matchesStatus = statusFilter === "All statuses" || account.status === statusFilter;

      return matchesSearch && matchesCategory && matchesType && matchesStatus;
    });
  }, [categoryFilter, search, statusFilter, typeFilter, visibleAccounts]);
  const activeAccounts = filteredAccounts.filter((account) => account.status === "Active");
  const accountSummaries = getAccountSummaries(visibleAccounts);

  function updateAccountParam(key: string, value: string, defaultValue: string) {
    const params = new URLSearchParams(searchParams.toString());
    const normalizedValue = value.trim();
    if (normalizedValue === "" || value === defaultValue) {
      params.delete(key);
    } else {
      params.set(key, value);
    }
    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  }

  useEffect(() => {
    let isMounted = true;

    async function loadAccounts() {
      setIsLoading(true);
      setError("");
      let supabase;
      try {
        supabase = createClient();
      } catch {
        if (isMounted) {
          const message = "Supabase is not configured. Check the environment variables.";
          setError(message);
          showError(message);
          setIsLoading(false);
        }
        return;
      }
      const { user, error: userError } = await getUserSafely(supabase);
      if (userError || !user) {
        if (isMounted) {
          const message = "You must be signed in to view accounts.";
          setError(message);
          showError(message);
          setIsLoading(false);
        }
        return;
      }

      try {
        const accounts = await getAccounts(supabase, user.id, { limit: 200 });
        if (isMounted) setVisibleAccounts(accounts);
      } catch (loadError) {
        if (isMounted) {
          const message = loadError instanceof Error ? loadError.message : "Unable to load accounts.";
          setError(message);
          showError(message);
        }
      } finally {
        if (isMounted) setIsLoading(false);
      }
    }

    loadAccounts();
    return () => { isMounted = false; };
  }, [showError]);

  async function deleteAccount(id: string) {
    setError("");
    setIsPending(true);
    const result = await deleteAccountAction(id);
    setIsPending(false);
    if (result.error) {
      showError(result.error);
      return;
    }
    setVisibleAccounts((items) => items.filter((item) => item.id !== id));
    setViewedAccount((account) => (account?.id === id ? null : account));
    showSuccess("Account deleted successfully.");
  }

  return (
    <AppShell
      activeNavLabel="Accounts"
      mobileAction={{ label: "Add account", icon: "plus", href: addAccountHref, title: "Add account" }}
      mobileSearchLabel="Search accounts on mobile"
      mobileSearchPlaceholder="Search accounts..."
      mobileSubtitle="Accounts"
      topSearchLabel="Search accounts"
      topSearchPlaceholder="Search accounts..."
    >
      <PageHeader
        actions={
          <>
            <button
              className="inline-flex h-10 items-center gap-2 rounded-md border border-[#c6c6cd] bg-white px-4 text-sm font-semibold text-[#0b1c30] shadow-sm transition hover:bg-[#eff4ff]"
              type="button"
            >
              <Icon className="size-4" name="download" />
              Export
            </button>
            <Link
              className="inline-flex h-10 items-center gap-2 rounded-md bg-[#0b1c30] px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-[#1f2937]"
              href={addAccountHref}
            >
              <Icon className="size-4" name="plus" />
              Add Account
            </Link>
          </>
        }
        description="Manage bank accounts, wallets, credit cards, balances, and account activity."
        title="Accounts"
      />

      <SummaryCards summaries={accountSummaries} />

      {error ? <div className="mb-6 rounded-md border border-[#fecaca] bg-[#fff1f0] px-4 py-3 text-sm font-medium text-[#991b1b]" role="alert">{error}</div> : null}
      {isLoading ? <div className="mb-6 rounded-lg border border-[#c6c6cd]/70 bg-white p-8 text-center text-sm font-medium text-[#45464d]">Loading accounts…</div> : null}
      {isPending ? <p className="mb-4 text-sm font-medium text-[#45464d]">Updating accounts…</p> : null}

      {!isLoading && !error && visibleAccounts.length === 0 ? (
        <section className="rounded-lg border border-dashed border-[#c6c6cd] bg-white p-10 text-center">
          <Icon className="mx-auto size-8 text-[#76777d]" name="account" />
          <h2 className="mt-3 text-lg font-semibold text-[#0b1c30]">No accounts yet</h2>
          <p className="mt-1 text-sm text-[#45464d]">Add your first account to start tracking balances.</p>
          <Link className="mt-5 inline-flex h-10 items-center rounded-md bg-[#0b1c30] px-4 text-sm font-semibold text-white" href={addAccountHref}>Add Account</Link>
        </section>
      ) : null}

      {!isLoading && visibleAccounts.length > 0 ? (
        <section className="mb-6 rounded-lg border border-[#c6c6cd]/70 bg-white p-4 shadow-[0_4px_20px_rgba(15,23,42,0.04)]">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-5">
            <TextInput label="Search Accounts" onChange={(value) => updateAccountParam("q", value, "")} placeholder="Name, category, type, number..." value={search} />
            <SelectInput label="View Mode" onChange={(value) => updateAccountParam("view", value, "List")} options={["List", "Card", "Lookup"]} value={viewMode} />
            <SelectInput label="Category" onChange={(value) => updateAccountParam("accountCategory", value, "All categories")} options={categoryOptions} value={categoryFilter} />
            <SelectInput label="Type" onChange={(value) => updateAccountParam("accountType", value, "All types")} options={typeOptions} value={typeFilter} />
            <SelectInput label="Status" onChange={(value) => updateAccountParam("accountStatus", value, "All statuses")} options={statusOptions} value={statusFilter} />
          </div>
        </section>
      ) : null}

      {!isLoading && visibleAccounts.length > 0 && viewMode === "Card" ? <section className="mb-6 rounded-lg border border-[#c6c6cd]/70 bg-white p-4 shadow-[0_4px_20px_rgba(15,23,42,0.04)]">
        <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-sm font-bold uppercase text-[#45464d]">Active Accounts</h2>
            <p className="mt-1 text-sm font-semibold text-[#0b1c30]">{activeAccounts.length} accounts</p>
          </div>
        </div>
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 2xl:grid-cols-3">
            {activeAccounts.map((account) => (
              <AccountCard account={account} accounts={visibleAccounts} key={account.id} onDelete={deleteAccount} onView={setViewedAccount} returnTo={returnTo} />
            ))}
        </div>
      </section> : null}

      {!isLoading && visibleAccounts.length > 0 && viewMode === "List" ? <AccountsTable accounts={visibleAccounts} items={filteredAccounts} onDelete={deleteAccount} onView={setViewedAccount} returnTo={returnTo} /> : null}
      {!isLoading && visibleAccounts.length > 0 && viewMode === "Lookup" ? <AccountAmountTypeMatrix accounts={filteredAccounts} /> : null}
      <DetailModal
        actions={
          viewedAccount ? (
            <>
              <Link
                className="inline-flex h-10 items-center gap-2 rounded-md border border-[#c6c6cd] bg-white px-4 text-sm font-semibold text-[#0b1c30] transition hover:bg-[#eff4ff]"
                href={`/accounts/${viewedAccount.id}/edit?returnTo=${encodeURIComponent(returnTo)}`}
              >
                <Icon className="size-4" name="edit" />
                Edit
              </Link>
              <Link
                className="inline-flex h-10 items-center gap-2 rounded-md border border-[#c6c6cd] bg-white px-4 text-sm font-semibold text-[#0058be] transition hover:bg-[#eff4ff]"
                href={`/transactions?account=${encodeURIComponent(getAccountOptionLabel(viewedAccount, visibleAccounts))}`}
              >
                <Icon className="size-4" name="receipt" />
                Transactions
              </Link>
            </>
          ) : null
        }
        icon={viewedAccount?.icon}
        iconClassName={viewedAccount ? `${viewedAccount.bg} ${viewedAccount.tone}` : undefined}
        isOpen={viewedAccount !== null}
        onClose={() => setViewedAccount(null)}
        subtitle={viewedAccount ? `${viewedAccount.institution} ${viewedAccount.accountNumber}` : undefined}
        title={viewedAccount?.name ?? "Account details"}
      >
        {viewedAccount ? (
          <div className="space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-[#c6c6cd]/60 bg-white p-4">
              <div>
                <p className="text-xs font-bold uppercase text-[#45464d]">{isCreditCardAccount(viewedAccount) ? "Available Credit" : "Total Amount"}</p>
                <ResponsiveAmount className={`mt-1 font-bold ${isCreditCardAccount(viewedAccount) ? "text-[#0058be]" : viewedAccount.balance.startsWith("-") ? "text-[#b42318]" : "text-[#0b1c30]"}`} maxSizeRem={1.5}>
                  {viewedAccount.balance}
                </ResponsiveAmount>
              </div>
              <StatusBadge status={viewedAccount.status} />
            </div>
            <DetailModalSection title="Account information">
              <DetailModalField label="Type" value={viewedAccount.type} />
              <DetailModalField label="Category" value={viewedAccount.category || "Uncategorized"} />
              <DetailModalField label="Institution" value={viewedAccount.institution} />
              <DetailModalField label="Bank book / mobile number" value={viewedAccount.bankBookAccountNumber || viewedAccount.mobileBankingAccountNumber || "-"} />
              <DetailModalField label="Phone number" value={viewedAccount.phoneNumber || "-"} />
              <DetailModalField label="Card type" value={viewedAccount.cardType || "No Card"} />
              <DetailModalField label="Card number" value={viewedAccount.cardNumber || "-"} />
              <DetailModalField label="Security code" value={viewedAccount.cardSecurityCode || "-"} />
              <DetailModalField label="Expired code" value={viewedAccount.cardExpiryCode || "-"} />
              <DetailModalField label="Currency" value={viewedAccount.currency} />
              <DetailModalField label={isCreditCardAccount(viewedAccount) ? "Available credit" : "Net amount"} value={viewedAccount.availableBalance} />
              {isCreditCardAccount(viewedAccount) ? (
                <>
                  <DetailModalField label="Payment due day" value={viewedAccount.creditPaymentDueDay ?? "-"} />
                  <DetailModalField label="Statement closing day" value={viewedAccount.creditStatementDay ?? "-"} />
                  <DetailModalField label="Minimum payment" value={viewedAccount.creditMinimumPayment} />
                </>
              ) : null}
              <DetailModalField label="Last updated" value={viewedAccount.lastUpdated} />
            </DetailModalSection>
            <DetailModalSection title={isCreditCardAccount(viewedAccount) ? "Credit card limits" : "Amount type totals"}>
              {(isCreditCardAccount(viewedAccount) ? viewedAccount.availableBreakdowns : viewedAccount.balanceBreakdowns).map((breakdown) => (
                <DetailModalField key={breakdown.type} label={breakdown.type} value={<span className={breakdown.type === "Credit Used" ? "text-[#b42318]" : undefined}>{breakdown.amount}</span>} />
              ))}
            </DetailModalSection>
            <DetailModalSection title="Monthly activity">
              <DetailModalField label={isCreditCardAccount(viewedAccount) ? "Payments" : "Inflow"} value={<span className="text-[#047857]">{viewedAccount.monthlyInflow}</span>} />
              <DetailModalField label={isCreditCardAccount(viewedAccount) ? "Charges" : "Outflow"} value={<span className="text-[#b42318]">{viewedAccount.monthlyOutflow}</span>} />
              <DetailModalField label="Transactions" value={viewedAccount.transactionCount} />
            </DetailModalSection>
          </div>
        ) : null}
      </DetailModal>
    </AppShell>
  );
}
