import Link from "next/link";

import { AppShell } from "@/components/app/app-shell";
import { PageHeader } from "@/components/app/page-header";
import { SummaryCards } from "@/components/app/summary-cards";
import { Icon } from "@/components/ui/icon";
import { accountSummaries, accounts } from "@/lib/accounts/mock-data";
import type { AccountStatus, FinancialAccount } from "@/types/finance";

const statusStyles: Record<AccountStatus, string> = {
  Active: "border-[#86efac] bg-[#ecfdf5] text-[#166534]",
  "Needs Review": "border-[#fde68a] bg-[#fffbeb] text-[#92400e]",
  Archived: "border-[#e4e4e7] bg-[#f8f9ff] text-[#45464d]",
};

function StatusBadge({ status }: { status: AccountStatus }) {
  return (
    <span className={`inline-flex h-8 items-center rounded-md border px-2.5 text-xs font-bold ${statusStyles[status]}`}>
      {status}
    </span>
  );
}

function AccountCard({ account }: { account: FinancialAccount }) {
  return (
    <article className="rounded-lg border border-[#c6c6cd]/60 bg-white p-5 shadow-[0_4px_20px_rgba(15,23,42,0.04)]">
      <div className="flex items-start justify-between gap-4">
        <div className="flex min-w-0 gap-3">
          <span className={`grid size-11 shrink-0 place-items-center rounded-lg ${account.bg} ${account.tone}`}>
            <Icon name={account.icon} />
          </span>
          <div className="min-w-0">
            <h2 className="truncate text-base font-semibold text-[#0b1c30]">{account.name}</h2>
            <p className="mt-1 text-sm font-medium text-[#45464d]">
              {account.institution} {account.accountNumber}
            </p>
          </div>
        </div>
        <StatusBadge status={account.status} />
      </div>

      <div className="mt-5">
        <p className="text-xs font-bold uppercase text-[#45464d]">Current Balance</p>
        <p className={`mt-2 text-3xl font-semibold ${account.balance.startsWith("-") ? "text-[#b42318]" : "text-[#0b1c30]"}`}>
          {account.balance}
        </p>
      </div>

      <dl className="mt-5 grid grid-cols-2 gap-3 rounded-lg border border-[#c6c6cd]/40 bg-[#f8f9ff] p-4">
        <div>
          <dt className="text-xs font-bold uppercase text-[#45464d]">Inflow</dt>
          <dd className="mt-1 text-sm font-semibold text-[#047857]">{account.monthlyInflow}</dd>
        </div>
        <div>
          <dt className="text-xs font-bold uppercase text-[#45464d]">Outflow</dt>
          <dd className="mt-1 text-sm font-semibold text-[#b42318]">{account.monthlyOutflow}</dd>
        </div>
        <div>
          <dt className="text-xs font-bold uppercase text-[#45464d]">Available</dt>
          <dd className="mt-1 text-sm font-semibold text-[#0b1c30]">{account.availableBalance}</dd>
        </div>
        <div>
          <dt className="text-xs font-bold uppercase text-[#45464d]">Transactions</dt>
          <dd className="mt-1 text-sm font-semibold text-[#0b1c30]">{account.transactionCount}</dd>
        </div>
      </dl>

      <div className="mt-5 flex items-center justify-end gap-1 border-t border-[#c6c6cd]/40 pt-4">
        <button
          aria-label={`View ${account.name}`}
          className="grid size-8 place-items-center rounded-full text-[#45464d] transition hover:bg-[#eff4ff] hover:text-[#0b1c30]"
          title="View account"
          type="button"
        >
          <Icon className="size-4" name="eye" />
        </button>
        <button
          aria-label={`Edit ${account.name}`}
          className="grid size-8 place-items-center rounded-full text-[#45464d] transition hover:bg-[#eff4ff] hover:text-[#0b1c30]"
          title="Edit account"
          type="button"
        >
          <Icon className="size-4" name="edit" />
        </button>
        <button
          aria-label={`View transactions for ${account.name}`}
          className="grid size-8 place-items-center rounded-full text-[#0058be] transition hover:bg-[#eff4ff]"
          title="View transactions"
          type="button"
        >
          <Icon className="size-4" name="receipt" />
        </button>
      </div>
    </article>
  );
}

function AccountsTable({ items }: { items: FinancialAccount[] }) {
  return (
    <section className="overflow-hidden rounded-lg border border-[#c6c6cd]/70 bg-white shadow-[0_4px_20px_rgba(15,23,42,0.04)]">
      <div className="border-b border-[#c6c6cd]/50 bg-[#f8f9ff] px-4 py-3">
        <h2 className="text-sm font-bold uppercase text-[#45464d]">Account Register</h2>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[960px] border-collapse text-left">
          <thead>
            <tr className="border-b border-[#c6c6cd]/50">
              <th className="px-4 py-3 text-xs font-semibold text-[#45464d]">Account</th>
              <th className="px-4 py-3 text-xs font-semibold text-[#45464d]">Type</th>
              <th className="px-4 py-3 text-xs font-semibold text-[#45464d]">Status</th>
              <th className="px-4 py-3 text-right text-xs font-semibold text-[#45464d]">Balance</th>
              <th className="px-4 py-3 text-right text-xs font-semibold text-[#45464d]">Available</th>
              <th className="px-4 py-3 text-xs font-semibold text-[#45464d]">Updated</th>
              <th className="w-32 px-4 py-3 text-center text-xs font-semibold text-[#45464d]">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#c6c6cd]/40 text-sm">
            {items.map((account) => (
              <tr className="transition hover:bg-[#f8f9ff]" key={account.id}>
                <td className="px-4 py-4">
                  <div className="flex items-center gap-3">
                    <span className={`grid size-9 place-items-center rounded-md ${account.bg} ${account.tone}`}>
                      <Icon className="size-4" name={account.icon} />
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
                <td className={`whitespace-nowrap px-4 py-4 text-right font-semibold ${account.balance.startsWith("-") ? "text-[#b42318]" : "text-[#0b1c30]"}`}>
                  {account.balance}
                </td>
                <td className="whitespace-nowrap px-4 py-4 text-right font-semibold text-[#0b1c30]">{account.availableBalance}</td>
                <td className="whitespace-nowrap px-4 py-4 text-[#45464d]">{account.lastUpdated}</td>
                <td className="px-4 py-4">
                  <div className="flex justify-end gap-1">
                    {(["eye", "edit", "receipt"] as const).map((icon) => (
                      <button
                        aria-label={`${icon === "eye" ? "View" : icon === "edit" ? "Edit" : "View transactions for"} ${account.name}`}
                        className="grid size-8 place-items-center rounded-full text-[#45464d] transition hover:bg-[#eff4ff] hover:text-[#0b1c30]"
                        key={icon}
                        type="button"
                      >
                        <Icon className="size-4" name={icon} />
                      </button>
                    ))}
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
  const activeAccounts = accounts.filter((account) => account.status === "Active");

  return (
    <AppShell
      activeNavLabel="Accounts"
      mobileAction={{ label: "Add account", icon: "plus", href: "/accounts/add", title: "Add account" }}
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
              href="/accounts/add"
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

      <section className="mb-6 rounded-lg border border-[#c6c6cd]/70 bg-white p-4 shadow-[0_4px_20px_rgba(15,23,42,0.04)]">
        <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-sm font-bold uppercase text-[#45464d]">Active Accounts</h2>
            <p className="mt-1 text-sm font-semibold text-[#0b1c30]">{activeAccounts.length} accounts</p>
          </div>
          <Link
            className="inline-flex h-9 w-fit items-center gap-2 rounded-md border border-[#c6c6cd] bg-white px-3 text-sm font-semibold text-[#0b1c30] transition hover:bg-[#eff4ff]"
            href="/accounts/add"
          >
            <Icon className="size-4" name="plus" />
            Add Account
          </Link>
        </div>
        <div className="-mx-4 overflow-x-auto px-4 pb-2">
          <div className="flex min-w-max gap-4">
            {activeAccounts.map((account) => (
              <div className="w-[320px] shrink-0 xl:w-[360px]" key={account.id}>
                <AccountCard account={account} />
              </div>
            ))}
          </div>
        </div>
      </section>

      <AccountsTable items={accounts} />
    </AppShell>
  );
}
