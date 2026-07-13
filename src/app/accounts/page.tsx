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
import { creditUtilizationPercent, formatBillingDay, formatCreditUtilization, maskCardNumber } from "@/lib/accounts/card-display";
import { getAccountOptionLabel, getAccounts, getAccountSummaries, type AccountRecord } from "@/lib/accounts/supabase";
import { summarizeFinancialPosition } from "@/lib/ledger";
import { createClient } from "@/lib/supabase/client";
import { getUserSafely } from "@/lib/supabase/auth";
import type { AccountStatus } from "@/types/finance";

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

function creditCardNetwork(account: Pick<AccountRecord, "cardType">) {
  return account.cardType.trim() || "Unspecified";
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
    <article className="flex h-full min-w-0 flex-col rounded-lg border border-[#c6c6cd]/60 bg-white p-4 shadow-[0_4px_20px_rgba(15,23,42,0.04)] sm:p-5">
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

      <div className="mt-auto flex min-w-0 flex-wrap items-center justify-end gap-1 border-t border-[#c6c6cd]/40 pt-4">
        <button
          aria-label={`View ${account.name}`}
          className="grid size-11 place-items-center rounded-full text-[#45464d] transition hover:bg-[#eff4ff] hover:text-[#0b1c30] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2170e4]/25"
          onClick={() => onView(account)}
          title="View account"
          type="button"
        >
          <Icon className="size-4" name="eye" />
        </button>
        <RecordActions editHref={`/accounts/${account.id}/edit?returnTo=${encodeURIComponent(returnTo)}`} itemId={account.id} itemLabel={account.name} onDelete={onDelete} />
        <Link
          aria-label={`View transactions for ${account.name}`}
          className="grid size-11 place-items-center rounded-full text-[#0058be] transition hover:bg-[#eff4ff] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2170e4]/25"
          href={`/transactions?account=${encodeURIComponent(getAccountOptionLabel(account, accounts))}`}
          title="View transactions"
        >
          <Icon className="size-4" name="receipt" />
        </Link>
      </div>
    </article>
  );
}

function CreditCardCard({
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
  const utilization = formatCreditUtilization(account.creditUsedValue, account.creditLimitValue);
  const utilizationWidth = Math.min(creditUtilizationPercent(account.creditUsedValue, account.creditLimitValue), 100);
  const utilizationTone = utilizationWidth >= 80 ? "bg-[#b42318]" : utilizationWidth >= 50 ? "bg-[#b45309]" : "bg-[#2170e4]";

  return (
    <article className="flex h-full min-w-0 flex-col overflow-hidden rounded-lg border border-[#c6c6cd]/60 bg-white shadow-[0_4px_20px_rgba(15,23,42,0.04)]">
      <div className="bg-gradient-to-br from-[#0b1c30] to-[#174c87] p-5 text-white">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-white/70">{creditCardNetwork(account)} credit card</p>
            <h2 className="mt-2 truncate text-lg font-semibold">{account.name}</h2>
            <p className="mt-1 truncate text-sm font-medium text-white/75">{account.institution || "Institution not set"}</p>
          </div>
          <StatusBadge status={account.status} />
        </div>
        <p className="mt-7 font-mono text-base font-semibold tracking-[0.12em]">{maskCardNumber(account.cardNumber)}</p>
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-xs font-semibold text-white/75">
          <span>Expires {account.cardExpiryCode || "Not set"}</span>
          <span>{account.currency}</span>
        </div>
      </div>

      <div className="flex flex-1 flex-col p-4 sm:p-5">
        <section>
          <h3 className="text-xs font-bold uppercase text-[#76777d]">Credit position</h3>
          <dl className="mt-3 grid grid-cols-2 gap-3">
            <div className="rounded-md border border-[#c6c6cd]/50 bg-[#f8f9ff] p-3">
              <dt className="text-xs font-bold uppercase text-[#76777d]">Credit Limit</dt>
              <dd><ResponsiveAmount className="mt-1 font-semibold text-[#0b1c30]" maxSizeRem={0.875}>{account.creditLimit}</ResponsiveAmount></dd>
            </div>
            <div className="rounded-md border border-[#fecaca] bg-[#fff8f7] p-3">
              <dt className="text-xs font-bold uppercase text-[#991b1b]">Outstanding</dt>
              <dd><ResponsiveAmount className="mt-1 font-semibold text-[#b42318]" maxSizeRem={0.875}>{account.creditUsed}</ResponsiveAmount></dd>
            </div>
            <div className="rounded-md border border-[#bfdbfe] bg-[#eff6ff] p-3">
              <dt className="text-xs font-bold uppercase text-[#0058be]">Available Credit</dt>
              <dd><ResponsiveAmount className="mt-1 font-semibold text-[#0058be]" maxSizeRem={0.875}>{account.creditAvailable}</ResponsiveAmount></dd>
            </div>
            <div className="rounded-md border border-[#bbf7d0] bg-[#ecfdf5] p-3">
              <dt className="text-xs font-bold uppercase text-[#166534]">Card Credit</dt>
              <dd><ResponsiveAmount className="mt-1 font-semibold text-[#047857]" maxSizeRem={0.875}>{account.creditBalance}</ResponsiveAmount></dd>
            </div>
          </dl>
          <div className="mt-3 rounded-md border border-[#c6c6cd]/50 bg-white p-3">
            <div className="flex items-center justify-between gap-3 text-xs font-bold uppercase text-[#45464d]">
              <span>Utilization</span>
              <span>{utilization}</span>
            </div>
            <div aria-label={`${utilization} credit utilization`} className="mt-2 h-2 overflow-hidden rounded-full bg-[#e7eaf0]" role="img">
              <div className={`h-full rounded-full ${utilizationTone}`} style={{ width: `${utilizationWidth}%` }} />
            </div>
          </div>
        </section>

        <section className="mt-5">
          <h3 className="text-xs font-bold uppercase text-[#76777d]">Billing terms</h3>
          <dl className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div>
              <dt className="text-xs font-medium text-[#76777d]">Minimum payment</dt>
              <dd><ResponsiveAmount className="mt-1 font-semibold text-[#0b1c30]" maxSizeRem={0.8125}>{account.creditMinimumPayment}</ResponsiveAmount></dd>
            </div>
            <div>
              <dt className="text-xs font-medium text-[#76777d]">Statement day</dt>
              <dd className="mt-1 text-sm font-semibold text-[#0b1c30]">{formatBillingDay(account.creditStatementDay)}</dd>
            </div>
            <div>
              <dt className="text-xs font-medium text-[#76777d]">Payment due</dt>
              <dd className="mt-1 text-sm font-semibold text-[#0b1c30]">{formatBillingDay(account.creditPaymentDueDay)}</dd>
            </div>
          </dl>
        </section>

        <section className="mt-5 border-t border-[#c6c6cd]/40 pt-4">
          <h3 className="text-xs font-bold uppercase text-[#76777d]">Activity</h3>
          <dl className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div>
              <dt className="text-xs font-medium text-[#76777d]">Charges</dt>
              <dd><ResponsiveAmount className="mt-1 font-semibold text-[#b42318]" maxSizeRem={0.8125}>{account.monthlyOutflow}</ResponsiveAmount></dd>
            </div>
            <div>
              <dt className="text-xs font-medium text-[#76777d]">Payments</dt>
              <dd><ResponsiveAmount className="mt-1 font-semibold text-[#047857]" maxSizeRem={0.8125}>{account.monthlyInflow}</ResponsiveAmount></dd>
            </div>
            <div>
              <dt className="text-xs font-medium text-[#76777d]">Transactions</dt>
              <dd className="mt-1 text-sm font-semibold text-[#0b1c30]">{account.transactionCount}</dd>
            </div>
          </dl>
        </section>

        <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-[#c6c6cd]/40 pt-4">
          <p className="text-xs font-medium text-[#76777d]">Updated {account.lastUpdated}</p>
          <div className="flex items-center justify-end gap-1">
            <button
              aria-label={`View ${account.name}`}
              className="grid size-11 place-items-center rounded-full text-[#45464d] transition hover:bg-[#eff4ff] hover:text-[#0b1c30] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2170e4]/25"
              onClick={() => onView(account)}
              title="View card details"
              type="button"
            >
              <Icon className="size-4" name="eye" />
            </button>
            <RecordActions editHref={`/accounts/${account.id}/edit?returnTo=${encodeURIComponent(returnTo)}`} itemId={account.id} itemLabel={account.name} onDelete={onDelete} />
            <Link
              aria-label={`View transactions for ${account.name}`}
              className="grid size-11 place-items-center rounded-full text-[#0058be] transition hover:bg-[#eff4ff] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2170e4]/25"
              href={`/transactions?account=${encodeURIComponent(getAccountOptionLabel(account, accounts))}`}
              title="View card transactions"
            >
              <Icon className="size-4" name="receipt" />
            </Link>
          </div>
        </div>
      </div>
    </article>
  );
}

function AccountAmountTypeMatrix({ accounts }: { accounts: AccountRecord[] }) {
  const ledgerAccounts = accounts.filter((account) => account.type !== "Credit Card");
  const creditAccounts = accounts.filter((account) => account.type === "Credit Card");
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
  const position = summarizeFinancialPosition({
    cashBalances: ledgerAccounts.flatMap((account) => account.balanceBreakdowns.map((breakdown) => breakdown.amountValue)),
    creditCardBalances: creditAccounts.map((account) => account.creditUsedValue - account.creditBalanceValue),
  });

  return (
    <div className="space-y-6">
      <section className="mb-6 min-w-0 max-w-full overflow-hidden rounded-lg border border-[#c6c6cd]/70 bg-white shadow-[0_4px_20px_rgba(15,23,42,0.04)]">
        <div className="border-b border-[#c6c6cd]/50 bg-[#f8f9ff] px-4 py-3">
          <h2 className="text-sm font-bold uppercase text-[#45464d]">Amount Type Lookup</h2>
          <p className="mt-1 text-xs font-medium text-[#45464d]">Net total = cash balances + card credits − outstanding card liabilities. With no filters, it matches the all-time transaction net.</p>
        </div>
        <div className="max-w-full overflow-x-auto [-webkit-overflow-scrolling:touch]">
          <table className="w-full min-w-[1040px] border-collapse text-left">
            <thead>
              <tr className="border-b border-[#c6c6cd]/50">
                <th className="px-4 py-3 text-xs font-semibold text-[#45464d]">Source</th>
                <th className="px-4 py-3 text-xs font-semibold text-[#45464d]">Type</th>
                {amountTypes.map((amountType) => (
                  <th className="px-4 py-3 text-right text-xs font-semibold text-[#45464d]" key={amountType}>{amountType}</th>
                ))}
                <th className="px-4 py-3 text-right text-xs font-semibold text-[#45464d]">Card Credit</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-[#45464d]">Card Liability</th>
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
                    <td className="whitespace-nowrap px-4 py-4 text-right font-semibold text-[#0b1c30]">0.00</td>
                    <td className="whitespace-nowrap px-4 py-4 text-right font-semibold text-[#0b1c30]">0.00</td>
                    <td className="whitespace-nowrap px-4 py-4 text-right font-semibold text-[#0b1c30]">{formatScaledAuditAmount(rowTotal.value, rowTotal.scale)}</td>
                  </tr>
                );
              })}
              {creditAccounts.map((account) => {
                const cardNet = account.creditBalanceValue - account.creditUsedValue;
                return (
                  <tr className="transition hover:bg-[#f8f9ff]" key={`card-position-${account.id}`}>
                    <td className="px-4 py-4">
                      <div className="flex items-center gap-3">
                        <span className={`grid size-10 shrink-0 place-items-center rounded-lg ${account.bg} ${account.tone}`}>
                          <Icon className="size-5" name={account.icon} />
                        </span>
                        <div>
                          <p className="font-semibold text-[#0b1c30]">{account.institution || account.type}</p>
                          <p className="mt-1 text-xs font-medium text-[#45464d]">Credit card position</p>
                        </div>
                      </div>
                    </td>
                    <td className="whitespace-nowrap px-4 py-4 font-medium text-[#45464d]">{account.name}</td>
                    {amountTypes.map((amountType) => (
                      <td className="whitespace-nowrap px-4 py-4 text-right font-semibold text-[#0b1c30]" key={amountType}>0.00</td>
                    ))}
                    <td className="whitespace-nowrap px-4 py-4 text-right font-semibold text-[#047857]">{formatAuditAmount(account.creditBalanceValue)}</td>
                    <td className="whitespace-nowrap px-4 py-4 text-right font-semibold text-[#b42318]">{formatAuditAmount(-account.creditUsedValue)}</td>
                    <td className={`whitespace-nowrap px-4 py-4 text-right font-semibold ${cardNet < 0 ? "text-[#b42318]" : "text-[#047857]"}`}>{formatAuditAmount(cardNet)}</td>
                  </tr>
                );
              })}
              <tr className="transition hover:bg-[#f8f9ff]">
                <td className="px-4 py-4 font-semibold uppercase text-[#0b1c30]">NET TOTAL</td>
                <td className="whitespace-nowrap px-4 py-4 font-medium text-[#45464d]">Financial position</td>
                {totalColumns.map(({ amountType, total }) => (
                  <td className="whitespace-nowrap px-4 py-4 text-right font-semibold text-[#0b1c30]" key={amountType}>
                    {formatScaledAuditAmount(total.value, total.scale)}
                  </td>
                ))}
                <td className="whitespace-nowrap px-4 py-4 text-right font-semibold text-[#047857]">{formatAuditAmount(position.cardCredit)}</td>
                <td className="whitespace-nowrap px-4 py-4 text-right font-semibold text-[#b42318]">{formatAuditAmount(-position.cardLiability)}</td>
                <td className={`whitespace-nowrap px-4 py-4 text-right font-semibold ${position.net < 0 ? "text-[#b42318]" : "text-[#0b1c30]"}`}>{formatAuditAmount(position.net)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
      {creditAccounts.length > 0 ? (
        <section className="mb-6 min-w-0 max-w-full overflow-hidden rounded-lg border border-[#c6c6cd]/70 bg-white shadow-[0_4px_20px_rgba(15,23,42,0.04)]">
          <div className="border-b border-[#c6c6cd]/50 bg-[#f8f9ff] px-4 py-3">
            <h2 className="text-sm font-bold uppercase text-[#45464d]">Credit Card Details (MPU / Visa)</h2>
            <p className="mt-1 text-xs font-medium text-[#45464d]">Credit limits are operational ceilings and stay separate from the financial-position total.</p>
          </div>
          <div className="max-w-full overflow-x-auto [-webkit-overflow-scrolling:touch]">
            <table className="w-full min-w-[1700px] border-collapse text-left">
              <thead>
                <tr className="border-b border-[#c6c6cd]/50">
                  <th className="px-4 py-3 text-xs font-semibold text-[#45464d]">Card</th>
                  <th className="px-4 py-3 text-xs font-semibold text-[#45464d]">Network</th>
                  <th className="px-4 py-3 text-xs font-semibold text-[#45464d]">Card Number</th>
                  <th className="px-4 py-3 text-xs font-semibold text-[#45464d]">Expiry</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-[#45464d]">Credit Limit</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-[#45464d]">Outstanding</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-[#45464d]">Card Credit</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-[#45464d]">Available Credit</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-[#45464d]">Utilization</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-[#45464d]">Minimum Payment</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-[#45464d]">Statement Day</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-[#45464d]">Due Day</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-[#45464d]">Charges</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-[#45464d]">Payments</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#c6c6cd]/40 text-sm">
                {creditAccounts.map((account) => (
                  <tr className="transition hover:bg-[#f8f9ff]" key={account.id}>
                    <td className="px-4 py-4">
                      <p className="font-semibold text-[#0b1c30]">{account.name}</p>
                      <p className="mt-1 text-xs font-medium text-[#45464d]">{account.institution || "Institution not set"}</p>
                    </td>
                    <td className="whitespace-nowrap px-4 py-4 font-semibold text-[#0b1c30]">{creditCardNetwork(account)}</td>
                    <td className="whitespace-nowrap px-4 py-4 font-mono font-semibold text-[#45464d]">{maskCardNumber(account.cardNumber)}</td>
                    <td className="whitespace-nowrap px-4 py-4 font-semibold text-[#0b1c30]">{account.cardExpiryCode || "Not set"}</td>
                    <td className="whitespace-nowrap px-4 py-4 text-right font-semibold text-[#0b1c30]">{account.creditLimit}</td>
                    <td className="whitespace-nowrap px-4 py-4 text-right font-semibold text-[#b42318]">{account.creditUsed}</td>
                    <td className="whitespace-nowrap px-4 py-4 text-right font-semibold text-[#047857]">{account.creditBalance}</td>
                    <td className="whitespace-nowrap px-4 py-4 text-right font-semibold text-[#0058be]">{account.creditAvailable}</td>
                    <td className="whitespace-nowrap px-4 py-4 text-right font-semibold text-[#0b1c30]">{formatCreditUtilization(account.creditUsedValue, account.creditLimitValue)}</td>
                    <td className="whitespace-nowrap px-4 py-4 text-right font-semibold text-[#0b1c30]">{account.creditMinimumPayment}</td>
                    <td className="whitespace-nowrap px-4 py-4 text-right font-semibold text-[#0b1c30]">{formatBillingDay(account.creditStatementDay)}</td>
                    <td className="whitespace-nowrap px-4 py-4 text-right font-semibold text-[#0b1c30]">{formatBillingDay(account.creditPaymentDueDay)}</td>
                    <td className="whitespace-nowrap px-4 py-4 text-right font-semibold text-[#b42318]">{account.monthlyOutflow}</td>
                    <td className="whitespace-nowrap px-4 py-4 text-right font-semibold text-[#047857]">{account.monthlyInflow}</td>
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

function CreditCardsTable({
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
  return (
    <section className="min-w-0 max-w-full overflow-hidden rounded-lg border border-[#c6c6cd]/70 bg-white shadow-[0_4px_20px_rgba(15,23,42,0.04)]">
      <div className="border-b border-[#c6c6cd]/50 bg-[#f8f9ff] px-4 py-3">
        <h2 className="text-sm font-bold uppercase text-[#45464d]">Credit Cards (MPU / Visa)</h2>
        <p className="mt-1 text-xs font-medium text-[#45464d]">Card identity, current credit position, billing terms, and activity are kept separate from cash-account balances.</p>
      </div>
      <div className="max-w-full overflow-x-auto [-webkit-overflow-scrolling:touch]">
        <table className="w-full min-w-[1900px] border-collapse text-left">
          <thead>
            <tr className="border-b border-[#c6c6cd]/50">
              <th className="px-4 py-3 text-xs font-semibold text-[#45464d]">Card</th>
              <th className="px-4 py-3 text-xs font-semibold text-[#45464d]">Network</th>
              <th className="px-4 py-3 text-xs font-semibold text-[#45464d]">Card Number</th>
              <th className="px-4 py-3 text-xs font-semibold text-[#45464d]">Expiry</th>
              <th className="px-4 py-3 text-xs font-semibold text-[#45464d]">Status</th>
              <th className="px-4 py-3 text-right text-xs font-semibold text-[#45464d]">Credit Limit</th>
              <th className="px-4 py-3 text-right text-xs font-semibold text-[#45464d]">Outstanding</th>
              <th className="px-4 py-3 text-right text-xs font-semibold text-[#45464d]">Card Credit</th>
              <th className="px-4 py-3 text-right text-xs font-semibold text-[#45464d]">Available Credit</th>
              <th className="px-4 py-3 text-right text-xs font-semibold text-[#45464d]">Utilization</th>
              <th className="px-4 py-3 text-right text-xs font-semibold text-[#45464d]">Minimum Payment</th>
              <th className="px-4 py-3 text-right text-xs font-semibold text-[#45464d]">Statement Day</th>
              <th className="px-4 py-3 text-right text-xs font-semibold text-[#45464d]">Due Day</th>
              <th className="px-4 py-3 text-right text-xs font-semibold text-[#45464d]">Charges</th>
              <th className="px-4 py-3 text-right text-xs font-semibold text-[#45464d]">Payments</th>
              <th className="px-4 py-3 text-right text-xs font-semibold text-[#45464d]">Transactions</th>
              <th className="w-56 px-4 py-3 text-center text-xs font-semibold text-[#45464d]">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#c6c6cd]/40 text-sm">
            {items.map((account) => (
              <tr className="transition hover:bg-[#f8f9ff]" key={`credit-card-${account.id}`}>
                <td className="px-4 py-4">
                  <div className="flex items-center gap-3">
                    <span className={`grid size-10 shrink-0 place-items-center rounded-lg ${account.bg} ${account.tone}`}>
                      <Icon className="size-5" name="credit" />
                    </span>
                    <div>
                      <p className="font-semibold text-[#0b1c30]">{account.name}</p>
                      <p className="mt-1 text-xs font-medium text-[#45464d]">{account.institution || "Institution not set"}</p>
                    </div>
                  </div>
                </td>
                <td className="whitespace-nowrap px-4 py-4 font-semibold text-[#0b1c30]">{creditCardNetwork(account)}</td>
                <td className="whitespace-nowrap px-4 py-4 font-mono font-semibold text-[#45464d]">{maskCardNumber(account.cardNumber)}</td>
                <td className="whitespace-nowrap px-4 py-4 font-medium text-[#45464d]">{account.cardExpiryCode || "Not set"}</td>
                <td className="whitespace-nowrap px-4 py-4"><StatusBadge status={account.status} /></td>
                <td className="whitespace-nowrap px-4 py-4 text-right font-semibold text-[#0b1c30]">{account.creditLimit}</td>
                <td className="whitespace-nowrap px-4 py-4 text-right font-semibold text-[#b42318]">{account.creditUsed}</td>
                <td className="whitespace-nowrap px-4 py-4 text-right font-semibold text-[#047857]">{account.creditBalance}</td>
                <td className="whitespace-nowrap px-4 py-4 text-right font-semibold text-[#0058be]">{account.creditAvailable}</td>
                <td className="whitespace-nowrap px-4 py-4 text-right font-semibold text-[#0b1c30]">{formatCreditUtilization(account.creditUsedValue, account.creditLimitValue)}</td>
                <td className="whitespace-nowrap px-4 py-4 text-right font-semibold text-[#0b1c30]">{account.creditMinimumPayment}</td>
                <td className="whitespace-nowrap px-4 py-4 text-right font-semibold text-[#0b1c30]">{formatBillingDay(account.creditStatementDay)}</td>
                <td className="whitespace-nowrap px-4 py-4 text-right font-semibold text-[#0b1c30]">{formatBillingDay(account.creditPaymentDueDay)}</td>
                <td className="whitespace-nowrap px-4 py-4 text-right font-semibold text-[#b42318]">{account.monthlyOutflow}</td>
                <td className="whitespace-nowrap px-4 py-4 text-right font-semibold text-[#047857]">{account.monthlyInflow}</td>
                <td className="whitespace-nowrap px-4 py-4 text-right font-semibold text-[#0b1c30]">{account.transactionCount}</td>
                <td className="px-4 py-4">
                  <div className="flex justify-end gap-1">
                    <button
                      aria-label={`View ${account.name}`}
                      className="grid size-11 place-items-center rounded-full text-[#45464d] transition hover:bg-[#eff4ff] hover:text-[#0b1c30] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2170e4]/25"
                      onClick={() => onView(account)}
                      title="View card details"
                      type="button"
                    >
                      <Icon className="size-4" name="eye" />
                    </button>
                    <RecordActions editHref={`/accounts/${account.id}/edit?returnTo=${encodeURIComponent(returnTo)}`} itemId={account.id} itemLabel={account.name} onDelete={onDelete} />
                    <Link
                      aria-label={`View transactions for ${account.name}`}
                      className="grid size-11 place-items-center rounded-full text-[#0058be] transition hover:bg-[#eff4ff] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2170e4]/25"
                      href={`/transactions?account=${encodeURIComponent(getAccountOptionLabel(account, accounts))}`}
                      title="View card transactions"
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
    <section className="min-w-0 max-w-full overflow-hidden rounded-lg border border-[#c6c6cd]/70 bg-white shadow-[0_4px_20px_rgba(15,23,42,0.04)]">
      <div className="border-b border-[#c6c6cd]/50 bg-[#f8f9ff] px-4 py-3">
        <h2 className="text-sm font-bold uppercase text-[#45464d]">Account Register</h2>
      </div>
      <div className="max-w-full overflow-x-auto [-webkit-overflow-scrolling:touch]">
        <table className="w-full min-w-[980px] border-collapse text-left">
          <thead>
            <tr className="border-b border-[#c6c6cd]/50">
              <th className="px-4 py-3"><SortHeader onSort={() => handleSort("account")} sortDirection={sortKey === "account" ? sortDirection : undefined}>Account</SortHeader></th>
              <th className="px-4 py-3"><SortHeader onSort={() => handleSort("type")} sortDirection={sortKey === "type" ? sortDirection : undefined}>Type</SortHeader></th>
              <th className="px-4 py-3"><SortHeader onSort={() => handleSort("status")} sortDirection={sortKey === "status" ? sortDirection : undefined}>Status</SortHeader></th>
              <th className="px-4 py-3 text-right"><SortHeader align="right" onSort={() => handleSort("balance")} sortDirection={sortKey === "balance" ? sortDirection : undefined}>Balance / Credit</SortHeader></th>
              <th className="w-56 px-4 py-3 text-center text-xs font-semibold text-[#45464d]">Actions</th>
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
                      className="grid size-11 place-items-center rounded-full text-[#45464d] transition hover:bg-[#eff4ff] hover:text-[#0b1c30] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2170e4]/25"
                      onClick={() => onView(account)}
                      type="button"
                    >
                      <Icon className="size-4" name="eye" />
                    </button>
                    <RecordActions editHref={`/accounts/${account.id}/edit?returnTo=${encodeURIComponent(returnTo)}`} itemId={account.id} itemLabel={account.name} onDelete={onDelete} />
                    <Link
                      aria-label={`View transactions for ${account.name}`}
                      className="grid size-11 place-items-center rounded-full text-[#45464d] transition hover:bg-[#eff4ff] hover:text-[#0b1c30] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2170e4]/25"
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
  const filteredCreditCards = filteredAccounts.filter(isCreditCardAccount);
  const filteredNonCardAccounts = filteredAccounts.filter((account) => !isCreditCardAccount(account));
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
              className="inline-flex min-h-11 cursor-not-allowed items-center gap-2 rounded-md border border-[#c6c6cd] bg-[#f8f9ff] px-4 text-sm font-semibold text-[#76777d] opacity-70 shadow-sm"
              disabled
              title="Export is currently unavailable."
              type="button"
            >
              <Icon className="size-4" name="download" />
              Export
            </button>
            <Link
              className="inline-flex min-h-11 items-center gap-2 rounded-md bg-[#0b1c30] px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-[#1f2937]"
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
        <section className="rounded-lg border border-dashed border-[#c6c6cd] bg-white p-6 text-center sm:p-10">
          <Icon className="mx-auto size-8 text-[#76777d]" name="account" />
          <h2 className="mt-3 text-lg font-semibold text-[#0b1c30]">No accounts yet</h2>
          <p className="mt-1 text-sm text-[#45464d]">Add your first account to start tracking balances.</p>
          <Link className="mt-5 inline-flex min-h-11 items-center justify-center rounded-md bg-[#0b1c30] px-4 text-sm font-semibold text-white" href={addAccountHref}>Add Account</Link>
        </section>
      ) : null}

      {!isLoading && visibleAccounts.length > 0 ? (
        <section className="mb-6 min-w-0 rounded-lg border border-[#c6c6cd]/70 bg-white p-4 shadow-[0_4px_20px_rgba(15,23,42,0.04)]">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-5">
            <TextInput label="Search Accounts" onChange={(value) => updateAccountParam("q", value, "")} placeholder="Name, category, type, number..." value={search} />
            <SelectInput label="View Mode" onChange={(value) => updateAccountParam("view", value, "List")} options={["List", "Card", "Lookup"]} value={viewMode} />
            <SelectInput label="Category" onChange={(value) => updateAccountParam("accountCategory", value, "All categories")} options={categoryOptions} value={categoryFilter} />
            <SelectInput label="Type" onChange={(value) => updateAccountParam("accountType", value, "All types")} options={typeOptions} value={typeFilter} />
            <SelectInput label="Status" onChange={(value) => updateAccountParam("accountStatus", value, "All statuses")} options={statusOptions} value={statusFilter} />
          </div>
        </section>
      ) : null}

      {!isLoading && visibleAccounts.length > 0 && filteredAccounts.length === 0 ? (
        <section className="mb-6 rounded-lg border border-dashed border-[#c6c6cd] bg-white p-6 text-center">
          <Icon className="mx-auto size-7 text-[#76777d]" name="search" />
          <h2 className="mt-3 text-base font-semibold text-[#0b1c30]">No matching accounts</h2>
          <p className="mt-1 text-sm text-[#45464d]">Change or clear the account filters to see results.</p>
        </section>
      ) : null}

      {!isLoading && filteredAccounts.length > 0 && viewMode === "Card" ? (
        <div className="space-y-6">
          {filteredNonCardAccounts.length > 0 ? (
            <section className="min-w-0 rounded-lg border border-[#c6c6cd]/70 bg-white p-4 shadow-[0_4px_20px_rgba(15,23,42,0.04)]">
              <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h2 className="text-sm font-bold uppercase text-[#45464d]">Accounts & Wallets</h2>
                  <p className="mt-1 text-sm font-semibold text-[#0b1c30]">{filteredNonCardAccounts.length} accounts</p>
                </div>
              </div>
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 2xl:grid-cols-3">
                {filteredNonCardAccounts.map((account) => (
                  <AccountCard account={account} accounts={visibleAccounts} key={account.id} onDelete={deleteAccount} onView={setViewedAccount} returnTo={returnTo} />
                ))}
              </div>
            </section>
          ) : null}

          {filteredCreditCards.length > 0 ? (
            <section className="min-w-0 rounded-lg border border-[#c6c6cd]/70 bg-[#f8f9ff] p-4 shadow-[0_4px_20px_rgba(15,23,42,0.04)]">
              <div className="mb-4">
                <h2 className="text-sm font-bold uppercase text-[#45464d]">Credit Cards (MPU / Visa)</h2>
                <p className="mt-1 text-sm font-medium text-[#45464d]">{filteredCreditCards.length} cards · limits, debt, billing terms, and activity shown independently</p>
              </div>
              <div className="grid grid-cols-1 gap-4 xl:grid-cols-2 2xl:grid-cols-3">
                {filteredCreditCards.map((account) => (
                  <CreditCardCard account={account} accounts={visibleAccounts} key={account.id} onDelete={deleteAccount} onView={setViewedAccount} returnTo={returnTo} />
                ))}
              </div>
            </section>
          ) : null}
        </div>
      ) : null}

      {!isLoading && filteredAccounts.length > 0 && viewMode === "List" ? (
        <div className="space-y-6">
          {filteredNonCardAccounts.length > 0 ? <AccountsTable accounts={visibleAccounts} items={filteredNonCardAccounts} onDelete={deleteAccount} onView={setViewedAccount} returnTo={returnTo} /> : null}
          {filteredCreditCards.length > 0 ? <CreditCardsTable accounts={visibleAccounts} items={filteredCreditCards} onDelete={deleteAccount} onView={setViewedAccount} returnTo={returnTo} /> : null}
        </div>
      ) : null}
      {!isLoading && filteredAccounts.length > 0 && viewMode === "Lookup" ? <AccountAmountTypeMatrix accounts={filteredAccounts} /> : null}
      <DetailModal
        actions={
          viewedAccount ? (
            <>
              <Link
                className="inline-flex min-h-11 items-center gap-2 rounded-md border border-[#c6c6cd] bg-white px-4 text-sm font-semibold text-[#0b1c30] transition hover:bg-[#eff4ff]"
                href={`/accounts/${viewedAccount.id}/edit?returnTo=${encodeURIComponent(returnTo)}`}
              >
                <Icon className="size-4" name="edit" />
                Edit
              </Link>
              <Link
                className="inline-flex min-h-11 items-center gap-2 rounded-md border border-[#c6c6cd] bg-white px-4 text-sm font-semibold text-[#0058be] transition hover:bg-[#eff4ff]"
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
            {isCreditCardAccount(viewedAccount) ? (
              <>
                <DetailModalSection title="Card identification">
                  <DetailModalField label="Network" value={creditCardNetwork(viewedAccount)} />
                  <DetailModalField label="Card number" value={<span className="font-mono">{maskCardNumber(viewedAccount.cardNumber)}</span>} />
                  <DetailModalField label="Expiry" value={viewedAccount.cardExpiryCode || "Not set"} />
                  <DetailModalField label="Security code" value="Hidden for security" />
                </DetailModalSection>
                <DetailModalSection title="Credit position">
                  <DetailModalField label="Credit limit" value={viewedAccount.creditLimit} />
                  <DetailModalField label="Outstanding" value={<span className="text-[#b42318]">{viewedAccount.creditUsed}</span>} />
                  <DetailModalField label="Card credit" value={<span className="text-[#047857]">{viewedAccount.creditBalance}</span>} />
                  <DetailModalField label="Available credit" value={<span className="text-[#0058be]">{viewedAccount.creditAvailable}</span>} />
                  <DetailModalField label="Utilization" value={formatCreditUtilization(viewedAccount.creditUsedValue, viewedAccount.creditLimitValue)} />
                </DetailModalSection>
                <DetailModalSection title="Billing terms">
                  <DetailModalField label="Minimum payment" value={viewedAccount.creditMinimumPayment} />
                  <DetailModalField label="Statement closing day" value={formatBillingDay(viewedAccount.creditStatementDay)} />
                  <DetailModalField label="Payment due day" value={formatBillingDay(viewedAccount.creditPaymentDueDay)} />
                </DetailModalSection>
                <DetailModalSection title="Account information">
                  <DetailModalField label="Institution" value={viewedAccount.institution || "Not set"} />
                  <DetailModalField label="Category" value={viewedAccount.category || "Uncategorized"} />
                  <DetailModalField label="Currency" value={viewedAccount.currency} />
                  <DetailModalField label="Phone number" value={viewedAccount.phoneNumber || "Not set"} />
                  <DetailModalField label="Status" value={viewedAccount.status} />
                  <DetailModalField label="Last updated" value={viewedAccount.lastUpdated} />
                  <DetailModalField label="Notes" value={viewedAccount.notes || "No notes"} />
                </DetailModalSection>
                <DetailModalSection title="Activity">
                  <DetailModalField label="Payments" value={<span className="text-[#047857]">{viewedAccount.monthlyInflow}</span>} />
                  <DetailModalField label="Charges" value={<span className="text-[#b42318]">{viewedAccount.monthlyOutflow}</span>} />
                  <DetailModalField label="Transactions" value={viewedAccount.transactionCount} />
                </DetailModalSection>
              </>
            ) : (
              <>
                <DetailModalSection title="Account information">
                  <DetailModalField label="Type" value={viewedAccount.type} />
                  <DetailModalField label="Category" value={viewedAccount.category || "Uncategorized"} />
                  <DetailModalField label="Institution" value={viewedAccount.institution || "Not set"} />
                  <DetailModalField label="Bank book / mobile number" value={viewedAccount.bankBookAccountNumber || viewedAccount.mobileBankingAccountNumber || "Not set"} />
                  <DetailModalField label="Phone number" value={viewedAccount.phoneNumber || "Not set"} />
                  <DetailModalField label="Currency" value={viewedAccount.currency} />
                  <DetailModalField label="Net amount" value={viewedAccount.availableBalance} />
                  <DetailModalField label="Last updated" value={viewedAccount.lastUpdated} />
                  <DetailModalField label="Notes" value={viewedAccount.notes || "No notes"} />
                </DetailModalSection>
                <DetailModalSection title="Amount type totals">
                  {viewedAccount.balanceBreakdowns.map((breakdown) => (
                    <DetailModalField key={breakdown.type} label={breakdown.type} value={breakdown.amount} />
                  ))}
                </DetailModalSection>
                <DetailModalSection title="Activity">
                  <DetailModalField label="Inflow" value={<span className="text-[#047857]">{viewedAccount.monthlyInflow}</span>} />
                  <DetailModalField label="Outflow" value={<span className="text-[#b42318]">{viewedAccount.monthlyOutflow}</span>} />
                  <DetailModalField label="Transactions" value={viewedAccount.transactionCount} />
                </DetailModalSection>
              </>
            )}
          </div>
        ) : null}
      </DetailModal>
    </AppShell>
  );
}
