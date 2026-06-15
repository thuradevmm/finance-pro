import { DateRangeField } from "@/components/ui/date-range-field";
import { Icon } from "@/components/ui/icon";
import { SearchField } from "@/components/ui/search-field";
import { SelectFilter } from "@/components/ui/select-filter";
import type { TransactionFilterOptions } from "@/types/finance";

type TransactionsFiltersProps = {
  filterOptions: TransactionFilterOptions;
};

export function TransactionsFilters({ filterOptions }: TransactionsFiltersProps) {
  return (
    <section className="mb-6 rounded-lg border border-[#c6c6cd]/60 bg-white p-4 shadow-[0_4px_20px_rgba(15,23,42,0.04)]">
      <div className="flex flex-wrap items-center gap-3">
        <SearchField label="Search in filters" placeholder="Search..." />
        <DateRangeField label="Date range" value="Jun 1, 2026 - Jun 30, 2026" />
        <SelectFilter label="Category filter" options={filterOptions.category} />
        <SelectFilter label="Account filter" options={filterOptions.account} />
        <SelectFilter label="Type filter" options={filterOptions.type} />
        <SelectFilter label="Amount filter" options={filterOptions.amount} />
        <button
          className="ml-auto inline-flex h-10 items-center gap-2 rounded-md px-3 text-sm font-semibold text-[#0058be] transition hover:bg-[#eff4ff]"
          type="button"
        >
          <Icon className="size-4" name="close" />
          Clear
        </button>
      </div>
    </section>
  );
}
