import { SelectFilter } from "@/components/ui/select-filter";
import { Icon } from "@/components/ui/icon";
import type { TransactionFilterOptions } from "@/types/finance";

type TransactionsFiltersProps = {
  filterOptions: TransactionFilterOptions;
  filters: {
    account: string;
    amount: string;
    category: string;
    dateFrom: string;
    dateTo: string;
    fromAccount: string;
    toAccount: string;
    type: string;
  };
  onFilterChange: (key: keyof TransactionsFiltersProps["filters"], value: string) => void;
};

export function TransactionsFilters({ filterOptions, filters, onFilterChange }: TransactionsFiltersProps) {
  const fromAccountOptions = filterOptions.account.map((option, index) => (index === 0 ? "From Account" : option));
  const toAccountOptions = filterOptions.account.map((option, index) => (index === 0 ? "To Account" : option));
  const isTransferFilter = filters.type === "Transfer";

  return (
    <section className="mb-6 min-w-0 rounded-lg border border-[#c6c6cd]/60 bg-white p-4 shadow-[0_4px_20px_rgba(15,23,42,0.04)]">
      <div className="grid grid-cols-1 items-stretch gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-7">
        <label className="relative block min-w-0">
          <span className="sr-only">Date from</span>
          <span className="pointer-events-none absolute left-3 top-1/2 w-10 -translate-y-1/2 text-xs font-semibold uppercase text-[#76777d]">
            From
          </span>
          <input
            aria-label="Date from"
            className="h-11 w-full rounded-md border border-[#c6c6cd] bg-white pl-16 pr-10 text-left text-sm text-[#0b1c30] outline-none transition focus:border-[#2170e4] focus:ring-2 focus:ring-[#2170e4]/20"
            onChange={(event) => onFilterChange("dateFrom", event.target.value)}
            type="date"
            value={filters.dateFrom}
          />
          <Icon className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-[#76777d]" name="chevronDown" />
        </label>
        <label className="relative block min-w-0">
          <span className="sr-only">Date to</span>
          <span className="pointer-events-none absolute left-3 top-1/2 w-10 -translate-y-1/2 text-xs font-semibold uppercase text-[#76777d]">
            To
          </span>
          <input
            aria-label="Date to"
            className="h-11 w-full rounded-md border border-[#c6c6cd] bg-white pl-16 pr-10 text-left text-sm text-[#0b1c30] outline-none transition focus:border-[#2170e4] focus:ring-2 focus:ring-[#2170e4]/20"
            onChange={(event) => onFilterChange("dateTo", event.target.value)}
            type="date"
            value={filters.dateTo}
          />
          <Icon className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-[#76777d]" name="chevronDown" />
        </label>
        <SelectFilter label="Category filter" onChange={(value) => onFilterChange("category", value)} options={filterOptions.category} value={filters.category} />
        {!isTransferFilter ? (
          <SelectFilter label="Account filter" onChange={(value) => onFilterChange("account", value)} options={filterOptions.account} value={filters.account} />
        ) : null}
        <SelectFilter label="Type filter" onChange={(value) => onFilterChange("type", value)} options={filterOptions.type} value={filters.type} />
        <SelectFilter label="Amount filter" onChange={(value) => onFilterChange("amount", value)} options={filterOptions.amount} value={filters.amount} />
        {isTransferFilter ? (
          <>
            <SelectFilter label="From account filter" onChange={(value) => onFilterChange("fromAccount", value === "From Account" ? "Account" : value)} options={fromAccountOptions} value={filters.fromAccount === "Account" ? "From Account" : filters.fromAccount} />
            <SelectFilter label="To account filter" onChange={(value) => onFilterChange("toAccount", value === "To Account" ? "Account" : value)} options={toAccountOptions} value={filters.toAccount === "Account" ? "To Account" : filters.toAccount} />
          </>
        ) : null}
      </div>
    </section>
  );
}
