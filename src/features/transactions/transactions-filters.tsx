import { Icon } from "@/components/ui/icon";
import { SearchField } from "@/components/ui/search-field";
import { SelectFilter } from "@/components/ui/select-filter";
import type { TransactionFilterOptions } from "@/types/finance";

type TransactionsFiltersProps = {
  filterOptions: TransactionFilterOptions;
  filters: {
    amount: string;
    account: string;
    category: string;
    dateFrom: string;
    dateTo: string;
    query: string;
    type: string;
  };
  onApply: () => void;
  onClear: () => void;
  onFilterChange: (key: keyof TransactionsFiltersProps["filters"], value: string) => void;
};

export function TransactionsFilters({ filterOptions, filters, onApply, onClear, onFilterChange }: TransactionsFiltersProps) {
  return (
    <section className="mb-6 rounded-lg border border-[#c6c6cd]/60 bg-white p-4 shadow-[0_4px_20px_rgba(15,23,42,0.04)]">
      <div className="flex flex-wrap items-center gap-3">
        <SearchField label="Search in filters" onChange={(value) => onFilterChange("query", value)} placeholder="Search..." value={filters.query} />
        <label className="relative min-w-44 flex-1 md:flex-none">
          <span className="sr-only">Date from</span>
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-xs font-semibold uppercase text-[#76777d]">
            From
          </span>
          <input
            aria-label="Date from"
            className="h-10 w-full rounded-md border border-[#c6c6cd] bg-white pl-14 pr-3 text-sm text-[#0b1c30] outline-none transition focus:border-[#2170e4] focus:ring-2 focus:ring-[#2170e4]/20"
            onChange={(event) => onFilterChange("dateFrom", event.target.value)}
            type="date"
            value={filters.dateFrom}
          />
        </label>
        <label className="relative min-w-44 flex-1 md:flex-none">
          <span className="sr-only">Date to</span>
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-xs font-semibold uppercase text-[#76777d]">
            To
          </span>
          <input
            aria-label="Date to"
            className="h-10 w-full rounded-md border border-[#c6c6cd] bg-white pl-10 pr-3 text-sm text-[#0b1c30] outline-none transition focus:border-[#2170e4] focus:ring-2 focus:ring-[#2170e4]/20"
            onChange={(event) => onFilterChange("dateTo", event.target.value)}
            type="date"
            value={filters.dateTo}
          />
        </label>
        <SelectFilter label="Category filter" onChange={(value) => onFilterChange("category", value)} options={filterOptions.category} value={filters.category} />
        <SelectFilter label="Account filter" onChange={(value) => onFilterChange("account", value)} options={filterOptions.account} value={filters.account} />
        <SelectFilter label="Type filter" onChange={(value) => onFilterChange("type", value)} options={filterOptions.type} value={filters.type} />
        <SelectFilter label="Amount filter" onChange={(value) => onFilterChange("amount", value)} options={filterOptions.amount} value={filters.amount} />
        <button
          className="inline-flex h-10 items-center gap-2 rounded-md bg-[#0b1c30] px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-[#1f2937]"
          onClick={onApply}
          type="button"
        >
          Apply
        </button>
        <button
          className="ml-auto inline-flex h-10 items-center gap-2 rounded-md px-3 text-sm font-semibold text-[#0058be] transition hover:bg-[#eff4ff]"
          onClick={onClear}
          type="button"
        >
          <Icon className="size-4" name="close" />
          Clear
        </button>
      </div>
    </section>
  );
}
