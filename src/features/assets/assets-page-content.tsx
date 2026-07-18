"use client";

import { useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";

import { deleteAsset as deleteAssetAction } from "@/app/assets/actions";
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
      <div className="mb-5 flex items-start justify-between gap-4">
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
        <span className={`rounded px-2 py-1 text-xs font-bold uppercase ${statusStyles[asset.status]}`}>{asset.status}</span>
      </div>

      <dl className="grid grid-cols-2 gap-3 rounded-lg border border-[#c6c6cd]/40 bg-[#f8f9ff] p-4">
        <div>
          <dt className="text-xs font-bold uppercase text-[#45464d]">Purchased</dt>
          <dd className="amount-value mt-1 text-sm font-semibold text-[#0b1c30]" title={asset.purchaseAmount}>{asset.purchaseAmount}</dd>
        </div>
        <div>
          <dt className="text-xs font-bold uppercase text-[#45464d]">Current</dt>
          <dd className="amount-value mt-1 text-sm font-semibold text-[#0058be]" title={asset.currentValue}>{asset.currentValue}</dd>
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
        <p className="truncate text-sm font-medium text-[#45464d]">{asset.note}</p>
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
      <div className="max-w-full overflow-x-auto [-webkit-overflow-scrolling:touch]">
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
    </section>
  );
}

function AssetHistorySection({ assets }: { assets: AssetRecordWithValues[] }) {
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("All categories");
  const [year, setYear] = useState("All years");
  const [amountRange, setAmountRange] = useState<(typeof amountRanges)[number]>("All amounts");

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
    const normalizedSearch = search.trim().toLowerCase();

    return assets
      .filter((asset) => {
        const searchTarget = `${asset.name} ${asset.category} ${asset.serialReference} ${asset.note}`.toLowerCase();
        const searchMatches = normalizedSearch === "" || searchTarget.includes(normalizedSearch);
        const categoryMatches = category === "All categories" || asset.category === category;
        const yearMatches = year === "All years" || getPurchaseYear(asset) === year;
        const amountMatches = matchesAmountRange(asset, amountRange);

        return searchMatches && categoryMatches && yearMatches && amountMatches;
      })
      .sort((firstAsset, secondAsset) => dateTimeSortValue(secondAsset.purchaseDateTimeValue) - dateTimeSortValue(firstAsset.purchaseDateTimeValue));
  }, [amountRange, assets, category, search, year]);
  const totalPurchaseCost = filteredAssets.reduce((sum, asset) => sum + parseCurrency(asset.purchaseAmount), 0);

  function clearFilters() {
    setSearch("");
    setCategory("All categories");
    setYear("All years");
    setAmountRange("All amounts");
  }

  return (
    <section className="mt-6 min-w-0 max-w-full overflow-hidden rounded-lg border border-[#c6c6cd]/70 bg-white shadow-[0_4px_20px_rgba(15,23,42,0.04)]">
      <div className="border-b border-[#c6c6cd]/50 bg-[#f8f9ff] px-4 py-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-sm font-bold uppercase text-[#45464d]">Asset History</h2>
            <p className="mt-1 text-sm font-semibold text-[#0b1c30]">
              {filteredAssets.length} purchases totaling {formatCurrency(totalPurchaseCost)}
            </p>
          </div>
          <button
            className="inline-flex min-h-11 w-full items-center justify-center rounded-md border border-[#c6c6cd]/70 bg-white px-4 text-sm font-semibold text-[#45464d] transition hover:bg-[#eff4ff] sm:w-fit"
            onClick={clearFilters}
            type="button"
          >
            Clear Filters
          </button>
        </div>
        <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
          <TextInput label="Search History" onChange={setSearch} placeholder="Search asset, category, note..." value={search} />
          <SelectInput label="Category" onChange={setCategory} options={categoryOptions} value={category} />
          <SelectInput label="Purchase Year" onChange={setYear} options={yearOptions} value={year} />
          <SelectInput label="Purchase Amount" onChange={(value) => setAmountRange(value as (typeof amountRanges)[number])} options={[...amountRanges]} value={amountRange} />
        </div>
      </div>
      <div className="max-w-full overflow-x-auto [-webkit-overflow-scrolling:touch]">
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
        {filteredAssets.length === 0 ? (
          <div className="border-t border-[#c6c6cd]/40 px-4 py-10 text-center">
            <p className="text-sm font-semibold text-[#0b1c30]">No asset purchases match these filters.</p>
            <p className="mt-1 text-sm font-medium text-[#45464d]">Clear filters or adjust the search terms to review purchase history.</p>
          </div>
        ) : null}
      </div>
    </section>
  );
}

export function AssetsPageContent({ assets }: { assets: AssetRecordWithValues[] }) {
  const { showError, showSuccess } = useToast();
  const searchParams = useSearchParams();
  const [visibleAssets, setVisibleAssets] = useState(assets);
  const [isPending, setIsPending] = useState(false);
  const search = searchParams.get("q") ?? "";
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
