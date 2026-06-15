import { Icon } from "@/components/ui/icon";
import { CategoryBadge, TransactionTypeBadge } from "@/features/transactions/transaction-badges";
import { amountClass } from "@/features/transactions/transaction-styles";
import type { Transaction } from "@/types/finance";

type TransactionsTableProps = {
  transactions: Transaction[];
  totalResults: number;
};

function AttachmentIcon({ attachment }: { attachment?: Transaction["attachment"] }) {
  if (!attachment) {
    return <span className="text-[#a1a1aa]">-</span>;
  }

  return <Icon className="mx-auto size-4 text-[#45464d]" name={attachment === "receipt" ? "receipt" : "document"} />;
}

export function TransactionsTable({ transactions, totalResults }: TransactionsTableProps) {
  return (
    <section className="space-y-3 lg:overflow-hidden lg:rounded-lg lg:border lg:border-[#c6c6cd]/70 lg:bg-white lg:shadow-[0_4px_20px_rgba(15,23,42,0.04)]">
      <div className="hidden overflow-x-auto lg:block">
        <table className="w-full min-w-[1040px] border-collapse text-left">
          <thead>
            <tr className="border-b border-[#c6c6cd]/60 bg-[#f8f9ff]">
              <th className="w-12 px-4 py-3 text-center">
                <input aria-label="Select all transactions" className="size-4 rounded border-[#c6c6cd]" type="checkbox" />
              </th>
              <th className="px-4 py-3 text-xs font-semibold text-[#45464d]">Date</th>
              <th className="px-4 py-3 text-xs font-semibold text-[#45464d]">Type</th>
              <th className="px-4 py-3 text-xs font-semibold text-[#45464d]">Category</th>
              <th className="px-4 py-3 text-xs font-semibold text-[#45464d]">Account</th>
              <th className="px-4 py-3 text-xs font-semibold text-[#45464d]">Payment Method</th>
              <th className="px-4 py-3 text-right text-xs font-semibold text-[#45464d]">Amount</th>
              <th className="px-4 py-3 text-xs font-semibold text-[#45464d]">Note</th>
              <th className="px-4 py-3 text-center text-xs font-semibold text-[#45464d]">
                <span className="sr-only">Attachment</span>
                <Icon className="mx-auto size-4" name="attach" />
              </th>
              <th className="w-12 px-4 py-3">
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#c6c6cd]/40 text-sm">
            {transactions.map((transaction) => (
              <tr className="group transition hover:bg-[#f8f9ff]" key={transaction.id}>
                <td className="px-4 py-4 text-center">
                  <input aria-label={`Select ${transaction.id}`} className="size-4 rounded border-[#c6c6cd]" type="checkbox" />
                </td>
                <td className="whitespace-nowrap px-4 py-4 text-[#45464d]">{transaction.date}</td>
                <td className="px-4 py-4">
                  <TransactionTypeBadge type={transaction.type} />
                </td>
                <td className="px-4 py-4">
                  <CategoryBadge category={transaction.category} />
                </td>
                <td className="whitespace-nowrap px-4 py-4 text-[#45464d]">{transaction.account}</td>
                <td className="whitespace-nowrap px-4 py-4 text-[#45464d]">{transaction.paymentMethod}</td>
                <td className={`whitespace-nowrap px-4 py-4 text-right font-semibold ${amountClass(transaction.type)}`}>
                  {transaction.amount}
                </td>
                <td className="max-w-52 truncate px-4 py-4 text-[#45464d]" title={transaction.note}>
                  {transaction.note}
                </td>
                <td className="px-4 py-4 text-center">
                  <AttachmentIcon attachment={transaction.attachment} />
                </td>
                <td className="px-4 py-4 text-right">
                  <button
                    aria-label={`Open actions for ${transaction.id}`}
                    className="grid size-8 place-items-center rounded-full text-[#76777d] opacity-0 transition hover:bg-[#eff4ff] hover:text-[#0b1c30] group-hover:opacity-100"
                    title="Transaction actions"
                    type="button"
                  >
                    <Icon className="size-4" name="moreVertical" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="grid gap-3 lg:hidden">
        {transactions.map((transaction) => (
          <article className="rounded-md border border-[#c6c6cd]/60 bg-white p-4" key={transaction.id}>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-[#0b1c30]">{transaction.note}</p>
                <p className="mt-1 text-xs text-[#45464d]">{transaction.date}</p>
              </div>
              <p className={`shrink-0 text-sm font-semibold ${amountClass(transaction.type)}`}>{transaction.amount}</p>
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <TransactionTypeBadge type={transaction.type} />
              <CategoryBadge category={transaction.category} />
              <span className="rounded-md border border-[#c6c6cd]/60 px-2.5 py-1 text-xs font-semibold text-[#45464d]">
                {transaction.account}
              </span>
            </div>
          </article>
        ))}
      </div>

      <div className="flex flex-col gap-3 rounded-lg border border-[#c6c6cd]/60 bg-white px-4 py-3 sm:flex-row sm:items-center sm:justify-between lg:rounded-none lg:border-x-0 lg:border-b-0 lg:bg-[#f8f9ff]">
        <p className="text-sm text-[#45464d]">
          Showing <span className="font-semibold text-[#0b1c30]">1</span> to{" "}
          <span className="font-semibold text-[#0b1c30]">{transactions.length}</span> of{" "}
          <span className="font-semibold text-[#0b1c30]">{totalResults}</span> results
        </p>
        <nav aria-label="Pagination" className="inline-flex w-fit overflow-hidden rounded-md border border-[#c6c6cd] bg-white shadow-sm">
          <button
            aria-label="Previous page"
            className="grid size-10 place-items-center border-r border-[#c6c6cd] text-[#45464d] transition hover:bg-[#eff4ff]"
            type="button"
          >
            <Icon className="size-4" name="chevronLeft" />
          </button>
          {[1, 2, 3].map((page) => (
            <button
              aria-current={page === 1 ? "page" : undefined}
              className={
                page === 1
                  ? "h-10 min-w-10 border-r border-[#c6c6cd] bg-[#d8e2ff] px-3 text-sm font-semibold text-[#0058be]"
                  : "h-10 min-w-10 border-r border-[#c6c6cd] px-3 text-sm font-semibold text-[#45464d] transition hover:bg-[#eff4ff]"
              }
              key={page}
              type="button"
            >
              {page}
            </button>
          ))}
          <span className="grid h-10 min-w-10 place-items-center border-r border-[#c6c6cd] px-3 text-sm text-[#45464d]">...</span>
          <button
            aria-label="Next page"
            className="grid size-10 place-items-center text-[#45464d] transition hover:bg-[#eff4ff]"
            type="button"
          >
            <Icon className="size-4" name="chevronRight" />
          </button>
        </nav>
      </div>
    </section>
  );
}
