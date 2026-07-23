"use client";

import { useMemo, useState } from "react";

import { deleteAsset as deleteAssetAction } from "@/app/assets/actions";
import { FilterActions, FilterForm } from "@/components/ui/filter-actions";
import { SelectInput, TextInput } from "@/components/ui/form-controls";
import { Icon } from "@/components/ui/icon";
import { RecordActions } from "@/components/ui/record-actions";
import { compareSortValues, SortHeader, type SortDirection } from "@/components/ui/sort-header";
import { useToast } from "@/components/ui/toast-provider";
import { calculateUsageDuration } from "@/lib/date-duration";
import { dateTimeSortValue } from "@/lib/date-format";
import type { AssetRecordWithValues } from "@/lib/assets/supabase";
import { formatMmk } from "@/lib/currency";
import type { AssetRecord, AssetStatus } from "@/types/finance";
import { useSubmittedQueryFilter } from "@/hooks/use-submitted-query-filter";
import { usePersistentFilterState } from "@/hooks/use-persistent-filter-state";

const statusStyles: Record<AssetStatus, string> = {
  Active: "bg-[#ecfdf5] text-[#166534]",
  Sold: "bg-[#eff6ff] text-[#0058be]",
  Archived: "bg-[#f8f9ff] text-[#45464d]",
};

const conditionStyles: Record<AssetRecord["condition"], string> = {
  Excellent: "text-[#047857]",
  Good: "text-[#0058be]",
  Fair: "text-[#92400e]",
  "Needs Repair": "text-[#b42318]",
};

const amountRanges = ["All amounts", "Under MMK 500", "MMK 500 - 1,500", "MMK 1,500+"] as const;
type AssetSortKey = "condition" | "currentValue" | "name" | "purchaseAmount" | "purchaseDate" | "usage";

const assetSortOptions: { label: string; value: AssetSortKey }[] = [
  { label: "Asset", value: "name" },
  { label: "Purchase Date", value: "purchaseDate" },
  { label: "Purchase Amount", value: "purchaseAmount" },
  { label: "Current Value", value: "currentValue" },
  { label: "Usage", value: "usage" },
  { label: "Condition", value: "condition" },
];

function parseCurrency(value: string) {
  return Number(value.replace(/[^0-9.]/g, "")) || 0;
}

function formatCurrency(value: number) {
  return formatMmk(value);
}

function getPurchaseYear(asset: AssetRecordWithValues) {
  const purchaseDate = new Date(asset.purchaseDateValue);

  if (Number.isNaN(purchaseDate.getTime())) {
    return "Unknown";
  }

  return String(purchaseDate.getFullYear());
}

function matchesAmountRange(asset: AssetRecordWithValues, range: (typeof amountRanges)[number]) {
  const purchaseAmount = parseCurrency(asset.purchaseAmount);

  if (range === "Under MMK 500") {
    return purchaseAmount < 500;
  }

  if (range === "MMK 500 - 1,500") {
    return purchaseAmount >= 500 && purchaseAmount <= 1500;
  }

  if (range === "MMK 1,500+") {
    return purchaseAmount > 1500;
  }

  return true;
}

function AssetCard({ asset, onDelete }: { asset: AssetRecordWithValues; onDelete: (id: string) => void | Promise<void> }) {
  const usageDuration = calculateUsageDuration(asset.startUsingDateValue);

  return (
    <article className="min-w-0 rounded-lg border border-[#c6c6cd]/60 bg-white p-4 shadow-[0_4px_20px_rgba(15,23,42,0.04)] sm:p-5">
      <div className="mb-5 flex min-w-0 flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex min-w-0 items-center gap-3">
          <span className={`grid size-11 shrink-0 place-items-center rounded-lg ${asset.bg} ${asset.tone}`}>
            <Icon name={asset.icon} />
          </span>
          <div className="min-w-0">
            <h2 className="truncate text-base font-semibold text-[#0b1c30]">{asset.name}</h2>
            <p className="mt-1 text-sm font-medium text-[#45464d]">{asset.category}</p>
            {asset.serialReference ? <p className="mt-1 truncate text-xs font-semibold text-[#76777d]">Ref: {asset.serialReference}</p> : null}
          </div>
        </div>
        <span className={`w-fit shrink-0 rounded px-2 py-1 text-xs font-bold uppercase ${statusStyles[asset.status]}`}>{asset.status}</span>
      </div>

      <dl className="grid min-w-0 grid-cols-1 gap-3 rounded-lg border border-[#c6c6cd]/40 bg-[#f8f9ff] p-4 min-[420px]:grid-cols-2">
        <div>
          <dt className="text-xs font-bold uppercase text-[#45464d]">Purchased</dt>
          <dd className="amount-value mt-1 text-sm font-semibold text-[#0b1c30]" title={asset.purchaseAmount}>{asset.purchaseAmount}</dd>
        </div>
        <div>
          <dt className="text-xs font-bold uppercase text-[#45464d]">Current</dt>
          <dd className="amount-value mt-1 text-sm font-semibold text-[#0058be]" title={asset.currentValue}>{asset.currentValue}</dd>
        </div>
        <div>
          <dt className="text-xs font-bold uppercase text-[#45464d]">Purchase Date</dt>
          <dd className="mt-1 text-sm font-semibold text-[#0b1c30]">{asset.purchaseDate}</dd>
        </div>
        <div>
          <dt className="text-xs font-bold uppercase text-[#45464d]">Used</dt>
          <dd className="mt-1 text-sm font-semibold text-[#0b1c30]">{usageDuration}</dd>
        </div>
        <div>
          <dt className="text-xs font-bold uppercase text-[#45464d]">Condition</dt>
          <dd className={`mt-1 text-sm font-semibold ${conditionStyles[asset.condition]}`}>{asset.condition}</dd>
        </div>
      </dl>

      <div className="mt-4 flex min-w-0 flex-wrap items-center justify-between gap-3 border-t border-[#c6c6cd]/40 pt-4">
        <p className="min-w-0 break-words text-sm font-medium text-[#45464d]">{asset.note}</p>
        <div className="flex shrink-0 gap-1">
          <RecordActions deleteDescription={`Deleting ${asset.name} will remove this asset from your list.`} editHref={`/assets/${asset.id}/edit`} itemId={asset.id} itemLabel={asset.name} onDelete={onDelete} />
        </div>
      </div>
    </article>
  );
}

function AssetsTable({ assets, onDelete }: { assets: AssetRecordWithValues[]; onDelete: (id: string) => void | Promise<void> }) {
  const [sortKey, setSortKey] = useState<AssetSortKey>("purchaseDate");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");
  const sortedAssets = useMemo(() => {
    function value(asset: AssetRecordWithValues) {
      if (sortKey === "name") return `${asset.name} ${asset.category}`.toLowerCase();
      if (sortKey === "purchaseDate") return dateTimeSortValue(asset.purchaseDateTimeValue);
      if (sortKey === "purchaseAmount") return asset.purchaseAmountValue;
      if (sortKey === "currentValue") return asset.currentValueValue;
      if (sortKey === "usage") return dateTimeSortValue(asset.startUsingDateTimeValue);
      return asset.condition.toLowerCase();
    }
    return [...assets].sort((first, second) => compareSortValues(value(first), value(second), sortDirection));
  }, [assets, sortDirection, sortKey]);

  function handleSort(key: AssetSortKey) {
    setSortKey((currentKey) => {
      if (currentKey === key) {
        setSortDirection((direction) => (direction === "asc" ? "desc" : "asc"));
        return currentKey;
      }
      setSortDirection(key === "name" || key === "condition" ? "asc" : "desc");
      return key;
    });
  }

  return (
    <section className="min-w-0 max-w-full overflow-hidden rounded-lg border border-[#c6c6cd]/70 bg-white shadow-[0_4px_20px_rgba(15,23,42,0.04)]">
      <div className="border-b border-[#c6c6cd]/50 bg-[#f8f9ff] px-4 py-3">
        <h2 className="text-sm font-bold uppercase text-[#45464d]">Asset Register</h2>
      </div>
      <div className="hidden max-w-full overflow-x-auto [-webkit-overflow-scrolling:touch] xl:block">
        <table className="w-full min-w-[1060px] border-collapse text-left">
          <thead>
            <tr className="border-b border-[#c6c6cd]/50">
              <th className="px-4 py-3"><SortHeader onSort={() => handleSort("name")} sortDirection={sortKey === "name" ? sortDirection : undefined}>Asset</SortHeader></th>
              <th className="px-4 py-3"><SortHeader onSort={() => handleSort("purchaseDate")} sortDirection={sortKey === "purchaseDate" ? sortDirection : undefined}>Purchase Date</SortHeader></th>
              <th className="px-4 py-3 text-right"><SortHeader align="right" onSort={() => handleSort("purchaseAmount")} sortDirection={sortKey === "purchaseAmount" ? sortDirection : undefined}>Purchase</SortHeader></th>
              <th className="px-4 py-3 text-right"><SortHeader align="right" onSort={() => handleSort("currentValue")} sortDirection={sortKey === "currentValue" ? sortDirection : undefined}>Current Value</SortHeader></th>
              <th className="px-4 py-3"><SortHeader onSort={() => handleSort("usage")} sortDirection={sortKey === "usage" ? sortDirection : undefined}>Usage</SortHeader></th>
              <th className="px-4 py-3"><SortHeader onSort={() => handleSort("condition")} sortDirection={sortKey === "condition" ? sortDirection : undefined}>Condition</SortHeader></th>
              <th className="w-36 px-4 py-3 text-right text-xs font-semibold text-[#45464d]">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#c6c6cd]/40 text-sm">
            {sortedAssets.map((asset) => (
              <tr className="transition hover:bg-[#f8f9ff]" key={asset.id}>
                <td className="px-4 py-4">
                  <div className="flex items-center gap-3">
                    <span className={`grid size-9 place-items-center rounded-md ${asset.bg} ${asset.tone}`}>
                      <Icon className="size-4" name={asset.icon} />
                    </span>
                    <div>
                      <p className="font-semibold text-[#0b1c30]">{asset.name}</p>
                      <p className="mt-1 text-xs font-medium text-[#45464d]">{asset.category}</p>
                      {asset.serialReference ? <p className="mt-1 text-xs font-medium text-[#76777d]">Ref: {asset.serialReference}</p> : null}
                    </div>
                  </div>
                </td>
                <td className="whitespace-nowrap px-4 py-4 text-[#45464d]">{asset.purchaseDate}</td>
                <td className="whitespace-nowrap px-4 py-4 text-right font-semibold text-[#0b1c30]">{asset.purchaseAmount}</td>
                <td className="whitespace-nowrap px-4 py-4 text-right font-semibold text-[#0058be]">{asset.currentValue}</td>
                <td className="whitespace-nowrap px-4 py-4 text-[#45464d]">{calculateUsageDuration(asset.startUsingDateValue)}</td>
                <td className={`whitespace-nowrap px-4 py-4 font-semibold ${conditionStyles[asset.condition]}`}>{asset.condition}</td>
                <td className="px-4 py-4">
                  <div className="flex justify-end gap-1">
                    <RecordActions deleteDescription={`Deleting ${asset.name} will remove this asset from your list.`} editHref={`/assets/${asset.id}/edit`} itemId={asset.id} itemLabel={asset.name} onDelete={onDelete} />
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="grid min-w-0 grid-cols-1 gap-2 border-b border-[#c6c6cd]/40 bg-white p-3 min-[420px]:grid-cols-[minmax(0,1fr)_auto] sm:p-4 xl:hidden">
        <label className="min-w-0">
          <span className="mb-1 block text-xs font-bold uppercase text-[#45464d]">Sort by</span>
          <span className="relative block min-w-0">
            <select
              aria-label="Sort asset cards by"
              className="h-11 w-full appearance-none rounded-md border border-[#c6c6cd] bg-white px-3 pr-10 text-sm font-semibold text-[#0b1c30] outline-none transition focus:border-[#2170e4] focus:ring-2 focus:ring-[#2170e4]/20"
              onChange={(event) => handleSort(event.target.value as AssetSortKey)}
              value={sortKey}
            >
              {assetSortOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
            <Icon className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-[#76777d]" name="chevronDown" />
          </span>
        </label>
        <button
          aria-label={`Sort asset cards ${sortDirection === "asc" ? "descending" : "ascending"}`}
          className="inline-flex min-h-11 w-full items-center justify-center gap-2 self-end rounded-md border border-[#c6c6cd] bg-white px-3 text-sm font-semibold text-[#45464d] transition hover:bg-[#eff4ff] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2170e4]/25 min-[420px]:w-auto"
          onClick={() => handleSort(sortKey)}
          type="button"
        >
          <Icon className="size-4" name={sortDirection === "asc" ? "trendingUp" : "trendingDown"} />
          {sortDirection === "asc" ? "Ascending" : "Descending"}
        </button>
      </div>
      <div className="grid min-w-0 gap-3 p-3 sm:grid-cols-2 sm:p-4 xl:hidden">
        {sortedAssets.map((asset) => (
          <AssetCard asset={asset} key={`mobile-${asset.id}`} onDelete={onDelete} />
        ))}
      </div>
    </section>
  );
}

function AssetHistorySection({ assets }: { assets: AssetRecordWithValues[] }) {
  const defaultFilters = {
    amountRange: "All amounts" as (typeof amountRanges)[number],
    category: "All categories",
    search: "",
    year: "All years",
  };
  const {
    appliedFilters,
    applyFilters,
    draftFilters,
    resetFilters,
    setDraftFilters,
  } = usePersistentFilterState("assets:history", defaultFilters);

  const categoryOptions = useMemo(() => ["All categories", ...Array.from(new Set(assets.map((asset) => asset.category)))], [assets]);
  const yearOptions = useMemo(
    () =>
      [
        "All years",
        ...Array.from(new Set(assets.map(getPurchaseYear))).sort((firstYear, secondYear) => Number(secondYear) - Number(firstYear)),
      ],
    [assets],
  );
  const filteredAssets = useMemo(() => {
    const normalizedSearch = appliedFilters.search.trim().toLowerCase();

    return assets
      .filter((asset) => {
        const searchTarget = `${asset.name} ${asset.category} ${asset.serialReference} ${asset.note}`.toLowerCase();
        const searchMatches = normalizedSearch === "" || searchTarget.includes(normalizedSearch);
        const categoryMatches = appliedFilters.category === "All categories" || asset.category === appliedFilters.category;
        const yearMatches = appliedFilters.year === "All years" || getPurchaseYear(asset) === appliedFilters.year;
        const amountMatches = matchesAmountRange(asset, appliedFilters.amountRange);

        return searchMatches && categoryMatches && yearMatches && amountMatches;
      })
      .sort((firstAsset, secondAsset) => dateTimeSortValue(secondAsset.purchaseDateTimeValue) - dateTimeSortValue(firstAsset.purchaseDateTimeValue));
  }, [appliedFilters, assets]);
  const totalPurchaseCost = filteredAssets.reduce((sum, asset) => sum + parseCurrency(asset.purchaseAmount), 0);

  function clearFilters() {
    resetFilters();
  }

  return (
    <section className="mt-6 min-w-0 max-w-full overflow-hidden rounded-lg border border-[#c6c6cd]/70 bg-white shadow-[0_4px_20px_rgba(15,23,42,0.04)]">
      <div className="border-b border-[#c6c6cd]/50 bg-[#f8f9ff] px-4 py-4">
        <div>
          <div>
            <h2 className="text-sm font-bold uppercase text-[#45464d]">Asset History</h2>
            <p className="mt-1 text-sm font-semibold text-[#0b1c30]">
              {filteredAssets.length} purchases totaling {formatCurrency(totalPurchaseCost)}
            </p>
          </div>
        </div>
        <FilterForm className="mt-4 space-y-3" onSubmit={(event) => {
          event.preventDefault();
          applyFilters();
        }}>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
            <TextInput label="Search History" onChange={(search) => setDraftFilters((filters) => ({ ...filters, search }))} placeholder="Search asset, category, note..." value={draftFilters.search} />
            <SelectInput label="Category" onChange={(category) => setDraftFilters((filters) => ({ ...filters, category }))} options={categoryOptions} value={draftFilters.category} />
            <SelectInput label="Purchase Year" onChange={(year) => setDraftFilters((filters) => ({ ...filters, year }))} options={yearOptions} value={draftFilters.year} />
            <SelectInput label="Purchase Amount" onChange={(amountRange) => setDraftFilters((filters) => ({ ...filters, amountRange: amountRange as (typeof amountRanges)[number] }))} options={[...amountRanges]} value={draftFilters.amountRange} />
          </div>
          <FilterActions onReset={clearFilters} resetLabel="Clear Filters" />
        </FilterForm>
      </div>
      <div className="hidden max-w-full overflow-x-auto [-webkit-overflow-scrolling:touch] xl:block">
        <table className="w-full min-w-[920px] border-collapse text-left">
          <thead>
            <tr className="border-b border-[#c6c6cd]/50">
              <th className="px-4 py-3 text-xs font-semibold text-[#45464d]">Asset</th>
              <th className="px-4 py-3 text-xs font-semibold text-[#45464d]">Bought Date</th>
              <th className="px-4 py-3 text-right text-xs font-semibold text-[#45464d]">Cost at Purchase</th>
              <th className="px-4 py-3 text-xs font-semibold text-[#45464d]">Start Using</th>
              <th className="px-4 py-3 text-xs font-semibold text-[#45464d]">Usage</th>
              <th className="px-4 py-3 text-xs font-semibold text-[#45464d]">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#c6c6cd]/40 text-sm">
            {filteredAssets.map((asset) => (
              <tr className="transition hover:bg-[#f8f9ff]" key={`history-${asset.id}`}>
                <td className="px-4 py-4">
                  <div className="flex items-center gap-3">
                    <span className={`grid size-9 place-items-center rounded-md ${asset.bg} ${asset.tone}`}>
                      <Icon className="size-4" name={asset.icon} />
                    </span>
                    <div className="min-w-0">
                      <p className="truncate font-semibold text-[#0b1c30]">{asset.name}</p>
                      <p className="mt-1 text-xs font-medium text-[#45464d]">{asset.category}</p>
                    </div>
                  </div>
                </td>
                <td className="whitespace-nowrap px-4 py-4 text-[#45464d]">{asset.purchaseDate}</td>
                <td className="whitespace-nowrap px-4 py-4 text-right font-semibold text-[#0b1c30]">{asset.purchaseAmount}</td>
                <td className="whitespace-nowrap px-4 py-4 text-[#45464d]">{asset.startUsingDate}</td>
                <td className="whitespace-nowrap px-4 py-4 text-[#45464d]">{calculateUsageDuration(asset.startUsingDateValue)}</td>
                <td className="whitespace-nowrap px-4 py-4">
                  <span className={`rounded px-2 py-1 text-xs font-bold uppercase ${statusStyles[asset.status]}`}>{asset.status}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {filteredAssets.length > 0 ? (
        <div className="grid min-w-0 gap-3 p-3 sm:grid-cols-2 sm:p-4 xl:hidden">
          {filteredAssets.map((asset) => (
            <article className="min-w-0 rounded-lg border border-[#c6c6cd]/60 bg-white p-4" key={`history-mobile-${asset.id}`}>
              <div className="flex min-w-0 items-start gap-3">
                <span className={`grid size-10 shrink-0 place-items-center rounded-md ${asset.bg} ${asset.tone}`}>
                  <Icon className="size-4" name={asset.icon} />
                </span>
                <div className="min-w-0">
                  <h3 className="break-words font-semibold text-[#0b1c30]">{asset.name}</h3>
                  <p className="mt-1 break-words text-xs font-medium text-[#45464d]">{asset.category}</p>
                </div>
              </div>
              <dl className="mt-4 grid min-w-0 grid-cols-1 gap-3 min-[420px]:grid-cols-2">
                <div className="min-w-0 rounded-md bg-[#f8f9ff] p-3">
                  <dt className="text-xs font-bold uppercase text-[#45464d]">Bought Date</dt>
                  <dd className="mt-1 break-words text-sm font-semibold text-[#0b1c30]">{asset.purchaseDate}</dd>
                </div>
                <div className="min-w-0 rounded-md bg-[#f8f9ff] p-3">
                  <dt className="text-xs font-bold uppercase text-[#45464d]">Cost at Purchase</dt>
                  <dd className="amount-value mt-1 text-sm font-semibold text-[#0b1c30]" title={asset.purchaseAmount}>{asset.purchaseAmount}</dd>
                </div>
                <div className="min-w-0 rounded-md bg-[#f8f9ff] p-3">
                  <dt className="text-xs font-bold uppercase text-[#45464d]">Start Using</dt>
                  <dd className="mt-1 break-words text-sm font-semibold text-[#0b1c30]">{asset.startUsingDate}</dd>
                </div>
                <div className="min-w-0 rounded-md bg-[#f8f9ff] p-3">
                  <dt className="text-xs font-bold uppercase text-[#45464d]">Usage</dt>
                  <dd className="mt-1 break-words text-sm font-semibold text-[#0b1c30]">{calculateUsageDuration(asset.startUsingDateValue)}</dd>
                </div>
              </dl>
              <span className={`mt-4 inline-flex rounded px-2 py-1 text-xs font-bold uppercase ${statusStyles[asset.status]}`}>{asset.status}</span>
            </article>
          ))}
        </div>
      ) : (
        <div className="border-t border-[#c6c6cd]/40 px-4 py-10 text-center">
          <p className="text-sm font-semibold text-[#0b1c30]">No asset purchases match these filters.</p>
          <p className="mt-1 text-sm font-medium text-[#45464d]">Clear filters or adjust the search terms to review purchase history.</p>
        </div>
      )}
    </section>
  );
}

export function AssetsPageContent({ assets }: { assets: AssetRecordWithValues[] }) {
  const { showError, showSuccess } = useToast();
  const queryFilter = useSubmittedQueryFilter();
  const [visibleAssets, setVisibleAssets] = useState(assets);
  const [isPending, setIsPending] = useState(false);
  const search = queryFilter.appliedValue;
  const filteredAssets = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();
    return visibleAssets.filter((asset) => {
      const searchable = `${asset.name} ${asset.category} ${asset.serialReference} ${asset.purchaseDate} ${asset.purchaseAmount} ${asset.currentValue} ${asset.condition} ${asset.status} ${asset.note}`.toLowerCase();
      return normalizedSearch === "" || searchable.includes(normalizedSearch);
    });
  }, [search, visibleAssets]);
  const activeAssets = filteredAssets.filter((asset) => asset.status === "Active");
  async function deleteAsset(id: string) {
    setIsPending(true);
    const result = await deleteAssetAction(id);
    setIsPending(false);
    if (result.error) {
      showError(result.error);
      return;
    }
    setVisibleAssets((items) => items.filter((item) => item.id !== id));
    showSuccess("Asset deleted successfully.");
  }

  return (
    <>
      <FilterForm className="mb-6 rounded-lg border border-[#c6c6cd]/70 bg-white p-4 shadow-[0_4px_20px_rgba(15,23,42,0.04)]" onSubmit={(event) => {
        event.preventDefault();
        queryFilter.apply();
      }}>
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
          <TextInput label="Search Assets" onChange={queryFilter.setDraftValue} placeholder="Name, category, condition, status..." value={queryFilter.draftValue} />
          <FilterActions isPending={queryFilter.isPending} onReset={queryFilter.reset} />
        </div>
      </FilterForm>
      <section className="mb-6 min-w-0 rounded-lg border border-[#c6c6cd]/70 bg-white p-4 shadow-[0_4px_20px_rgba(15,23,42,0.04)]">
        <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-sm font-bold uppercase text-[#45464d]">Active Assets</h2>
            <p className="mt-1 text-sm font-semibold text-[#0b1c30]">{activeAssets.length} assets currently tracked</p>
          </div>
          <div className="inline-flex min-h-11 w-full items-center gap-2 rounded-md border border-[#c6c6cd]/70 bg-[#f8f9ff] px-3 py-2 text-xs font-semibold text-[#45464d] sm:w-fit">
            <Icon className="size-4" name="timeline" />
            Scroll to compare assets
          </div>
        </div>
        <div className="-mx-4 max-w-[calc(100%+2rem)] overflow-x-auto px-4 pb-2 [-webkit-overflow-scrolling:touch]">
          <div className="flex w-max max-w-none gap-4">
            {activeAssets.map((asset) => (
              <div className="w-[min(20rem,calc(100vw-2rem))] shrink-0 sm:w-[320px] xl:w-[360px]" key={asset.id}>
                <AssetCard asset={asset} onDelete={deleteAsset} />
              </div>
            ))}
          </div>
        </div>
      </section>
      {isPending ? <p className="mb-4 text-sm font-medium text-[#45464d]">Updating assets…</p> : null}
      <AssetsTable assets={filteredAssets} onDelete={deleteAsset} />
      <AssetHistorySection assets={filteredAssets} />
    </>
  );
}
