import { DateRangeField } from "@/components/ui/date-range-field";
import { FilterActions, FilterForm } from "@/components/ui/filter-actions";
import { SearchField } from "@/components/ui/search-field";
import { SelectFilter } from "@/components/ui/select-filter";
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
    search: string;
    status: string;
    toAccount: string;
    type: string;
  };
  onFilterChange: (key: keyof TransactionsFiltersProps["filters"], value: string) => void;
  onReset: () => void;
  onSearch: () => void;
};

export function TransactionsFilters({ filterOptions, filters, onFilterChange, onReset, onSearch }: TransactionsFiltersProps) {
  const fromAccountOptions = filterOptions.account.map((option, index) => (index === 0 ? "From Account" : option));
  const toAccountOptions = filterOptions.account.map((option, index) => (index === 0 ? "To Account" : option));
  const isTransferFilter = filters.type === "Transfer";

  return (
    <FilterForm className="mb-6 min-w-0 rounded-lg border border-[#c6c6cd]/60 bg-white p-4 shadow-[0_4px_20px_rgba(15,23,42,0.04)]" onSubmit={(event) => {
      event.preventDefault();
      onSearch();
    }}>
      <div className="grid grid-cols-1 items-stretch gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-8">
        <div className="min-w-0 sm:col-span-2 lg:col-span-2 2xl:col-span-2">
          <SearchField label="Search transactions" onChange={(value) => onFilterChange("search", value)} placeholder="Title, note, account, category..." value={filters.search} />
        </div>
        <div className="min-w-0 sm:col-span-2 lg:col-span-2 2xl:col-span-2">
          <DateRangeField
            fromValue={filters.dateFrom}
            label="Transaction date range"
            onFromChange={(value) => onFilterChange("dateFrom", value)}
            onToChange={(value) => onFilterChange("dateTo", value)}
            toValue={filters.dateTo}
          />
        </div>
        <SelectFilter label="Category filter" onChange={(value) => onFilterChange("category", value)} options={filterOptions.category} value={filters.category} />
        {!isTransferFilter ? (
          <SelectFilter label="Account filter" onChange={(value) => onFilterChange("account", value)} options={filterOptions.account} value={filters.account} />
        ) : null}
        <SelectFilter label="Type filter" onChange={(value) => onFilterChange("type", value)} options={filterOptions.type} value={filters.type} />
        <SelectFilter label="Status filter" onChange={(value) => onFilterChange("status", value)} options={filterOptions.status} value={filters.status} />
        <SelectFilter label="Amount filter" onChange={(value) => onFilterChange("amount", value)} options={filterOptions.amount} value={filters.amount} />
        {isTransferFilter ? (
          <>
            <SelectFilter label="From account filter" onChange={(value) => onFilterChange("fromAccount", value === "From Account" ? "Account" : value)} options={fromAccountOptions} value={filters.fromAccount === "Account" ? "From Account" : filters.fromAccount} />
            <SelectFilter label="To account filter" onChange={(value) => onFilterChange("toAccount", value === "To Account" ? "Account" : value)} options={toAccountOptions} value={filters.toAccount === "Account" ? "To Account" : filters.toAccount} />
          </>
        ) : null}
      </div>
      <div className="mt-3">
        <FilterActions onReset={onReset} />
      </div>
    </FilterForm>
  );
}
