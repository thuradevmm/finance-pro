"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import { deleteAsset as deleteAssetAction } from "@/app/assets/actions";
import { DetailModal, DetailModalField, DetailModalSection } from "@/components/ui/detail-modal";
import { FilterActions, FilterForm } from "@/components/ui/filter-actions";
import { SelectInput, TextInput } from "@/components/ui/form-controls";
import { Icon } from "@/components/ui/icon";
import { RecordActions } from "@/components/ui/record-actions";
import { compareSortValues, SortHeader, type SortDirection } from "@/components/ui/sort-header";
import { useToast } from "@/components/ui/toast-provider";
import { calculateUsageDuration } from "@/lib/date-duration";
import { dateTimeSortValue, formatDisplayDate } from "@/lib/date-format";
import type { AssetRecordWithValues } from "@/lib/assets/supabase";
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

type AssetSortKey = "condition" | "currentValue" | "name" | "purchaseDate" | "usage";
const sortOptions: Array<{ label: string; value: AssetSortKey }> = [
  { label: "Purchase Date", value: "purchaseDate" },
  { label: "Asset Name", value: "name" },
  { label: "Linked Value", value: "currentValue" },
  { label: "Usage Duration", value: "usage" },
  { label: "Condition", value: "condition" },
];

function sortedAssets(assets: AssetRecordWithValues[], sortKey: AssetSortKey, direction: SortDirection) {
  function value(asset: AssetRecordWithValues) {
    if (sortKey === "name") return `${asset.name} ${asset.category}`.toLowerCase();
    if (sortKey === "purchaseDate") return dateTimeSortValue(asset.purchaseDateTimeValue);
    if (sortKey === "currentValue") return asset.currentValueValue;
    if (sortKey === "usage") return dateTimeSortValue(asset.startUsingDateTimeValue);
    return asset.condition.toLowerCase();
  }
  return [...assets].sort((first, second) => compareSortValues(value(first), value(second), direction));
}

function AssetCard({ asset, onDelete, onView }: { asset: AssetRecordWithValues; onDelete: (id: string) => Promise<void>; onView: () => void }) {
  return (
    <article className="min-w-0 rounded-lg border border-[#c6c6cd]/60 bg-white p-4">
      <div className="flex min-w-0 items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <span className={`grid size-10 shrink-0 place-items-center rounded-md ${asset.bg} ${asset.tone}`}><Icon className="size-4" name={asset.icon} /></span>
          <div className="min-w-0">
            <h3 className="break-words font-semibold text-[#0b1c30]">{asset.name}</h3>
            <p className="mt-1 text-xs font-semibold text-[#45464d]">{asset.category}</p>
          </div>
        </div>
        <span className={`shrink-0 rounded px-2 py-1 text-[10px] font-bold uppercase ${statusStyles[asset.status]}`}>{asset.status}</span>
      </div>
      <dl className="mt-4 grid grid-cols-1 gap-3 min-[420px]:grid-cols-2">
        <div className="rounded-md bg-[#f8f9ff] p-3"><dt className="text-xs font-bold uppercase text-[#45464d]">Linked purchase value</dt><dd className="amount-value mt-1 font-semibold text-[#0058be]">{asset.purchaseAmount}</dd></div>
        <div className="rounded-md bg-[#f8f9ff] p-3"><dt className="text-xs font-bold uppercase text-[#45464d]">Usage</dt><dd className="mt-1 text-sm font-semibold text-[#0b1c30]">{calculateUsageDuration(asset.startUsingDateValue)}</dd></div>
        <div className="rounded-md bg-[#f8f9ff] p-3"><dt className="text-xs font-bold uppercase text-[#45464d]">Condition</dt><dd className={`mt-1 text-sm font-semibold ${conditionStyles[asset.condition]}`}>{asset.condition}</dd></div>
      </dl>
      <div className="mt-4 flex items-center justify-between gap-3 border-t border-[#c6c6cd]/40 pt-3">
        <div>
          <p className="text-xs font-medium text-[#45464d]">Purchased {asset.purchaseDate}</p>
          <Link className="mt-1 inline-flex text-xs font-bold text-[#0058be] hover:underline" href={`/transactions/add?asset=${asset.id}`}>{asset.purchaseAmountValue > 0 ? "Add purchase" : "Record purchase"}</Link>
        </div>
        <RecordActions deleteDescription={`Deleting ${asset.name} will remove this asset from your register.`} editHref={`/assets/${asset.id}/edit`} itemId={asset.id} itemLabel={asset.name} onDelete={onDelete} onView={onView} />
      </div>
    </article>
  );
}

export function AssetsPageContent({ assets }: { assets: AssetRecordWithValues[] }) {
  const { showError, showSuccess } = useToast();
  const [visibleAssets, setVisibleAssets] = useState(assets);
  const [draftSearch, setDraftSearch] = useState("");
  const [draftStatus, setDraftStatus] = useState("All statuses");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("All statuses");
  const [sortKey, setSortKey] = useState<AssetSortKey>("purchaseDate");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");
  const [isPending, setIsPending] = useState(false);
  const [viewedAsset, setViewedAsset] = useState<AssetRecordWithValues | null>(null);
  const filteredAssets = useMemo(() => {
    const query = search.trim().toLowerCase();
    return sortedAssets(visibleAssets.filter((asset) => {
      const matchesSearch = !query || `${asset.name} ${asset.category} ${asset.condition} ${asset.status} ${asset.note} ${asset.serialReference}`.toLowerCase().includes(query);
      const matchesStatus = status === "All statuses" || asset.status === status;
      return matchesSearch && matchesStatus;
    }), sortKey, sortDirection);
  }, [search, sortDirection, sortKey, status, visibleAssets]);

  function handleSort(nextSortKey: AssetSortKey) {
    if (nextSortKey === sortKey) setSortDirection((current) => current === "asc" ? "desc" : "asc");
    else {
      setSortKey(nextSortKey);
      setSortDirection(nextSortKey === "name" || nextSortKey === "condition" ? "asc" : "desc");
    }
  }

  async function deleteAsset(id: string) {
    setIsPending(true);
    const result = await deleteAssetAction(id);
    setIsPending(false);
    if (result.error) return showError(result.error);
    setVisibleAssets((items) => items.filter((item) => item.id !== id));
    showSuccess("Asset deleted successfully.");
  }

  return (
    <>
      <FilterForm className="mb-6 rounded-lg border border-[#c6c6cd]/70 bg-white p-4" onSubmit={(event) => {
        event.preventDefault();
        const formData = new FormData(event.currentTarget);
        setSearch(String(formData.get("q") ?? draftSearch));
        setStatus(String(formData.get("status") ?? draftStatus));
      }}>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-[minmax(0,1fr)_14rem_auto] xl:items-end">
          <TextInput label="Search assets" name="q" onChange={setDraftSearch} placeholder="Name, category, condition…" value={draftSearch} />
          <SelectInput label="Status" name="status" onChange={setDraftStatus} options={["All statuses", "Active", "Sold", "Archived"]} value={draftStatus} />
          <FilterActions onReset={() => { setDraftSearch(""); setDraftStatus("All statuses"); setSearch(""); setStatus("All statuses"); }} />
        </div>
      </FilterForm>

      <section className="min-w-0 overflow-hidden rounded-lg border border-[#c6c6cd]/70 bg-white shadow-sm">
        <div className="flex flex-col gap-3 border-b border-[#c6c6cd]/50 bg-[#f8f9ff] px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div><h2 className="text-sm font-bold uppercase text-[#45464d]">Asset register</h2><p className="mt-1 text-sm font-semibold text-[#0b1c30]">{filteredAssets.length} of {visibleAssets.length} assets</p></div>
          <div className="flex items-end gap-2">
            <label className="min-w-0">
              <span className="mb-2 block text-xs font-bold uppercase text-[#45464d]">Sort by</span>
              <span className="relative block">
                <select
                  aria-label="Sort asset cards by"
                  className="h-12 appearance-none rounded-lg border border-[#c6c6cd] bg-white px-4 pr-10 text-sm font-medium text-[#0b1c30] outline-none transition focus:border-[#2170e4] focus:ring-2 focus:ring-[#2170e4]/20"
                  onChange={(event) => handleSort(event.target.value as AssetSortKey)}
                  value={sortKey}
                >
                  {sortOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                </select>
                <Icon className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-[#76777d]" name="chevronDown" />
              </span>
            </label>
            <button aria-label={`Sort asset cards ${sortDirection === "asc" ? "descending" : "ascending"}`} className="mb-0 grid size-12 shrink-0 place-items-center rounded-md border border-[#c6c6cd] bg-white text-[#45464d]" onClick={() => handleSort(sortKey)} type="button"><Icon name={sortDirection === "asc" ? "trendingUp" : "trendingDown"} /></button>
          </div>
        </div>
        {isPending ? <p className="border-b border-[#c6c6cd]/40 px-4 py-2 text-sm font-medium text-[#45464d]">Updating assets…</p> : null}
        <div className="hidden overflow-x-auto xl:block">
          <table className="w-full min-w-[960px] text-left text-sm">
            <thead className="border-b border-[#c6c6cd]/50 text-xs uppercase text-[#45464d]"><tr>
              <th className="px-4 py-3"><SortHeader onSort={() => handleSort("name")} sortDirection={sortKey === "name" ? sortDirection : undefined}>Asset</SortHeader></th>
              <th className="px-4 py-3"><SortHeader onSort={() => handleSort("purchaseDate")} sortDirection={sortKey === "purchaseDate" ? sortDirection : undefined}>Purchased</SortHeader></th>
              <th className="px-4 py-3 text-right"><SortHeader align="right" onSort={() => handleSort("currentValue")} sortDirection={sortKey === "currentValue" ? sortDirection : undefined}>Linked purchase value</SortHeader></th>
              <th className="px-4 py-3">Usage</th><th className="px-4 py-3">Condition</th><th className="px-4 py-3">Status</th><th className="px-4 py-3 text-right">Actions</th>
            </tr></thead>
            <tbody className="divide-y divide-[#c6c6cd]/40">{filteredAssets.map((asset) => <tr className="hover:bg-[#f8f9ff]" key={asset.id}>
              <td className="px-4 py-4"><div className="flex items-center gap-3"><span className={`grid size-9 place-items-center rounded-md ${asset.bg} ${asset.tone}`}><Icon className="size-4" name={asset.icon} /></span><div><p className="font-semibold text-[#0b1c30]">{asset.name}</p><p className="mt-1 text-xs text-[#45464d]">{asset.category}</p></div></div></td>
              <td className="whitespace-nowrap px-4 py-4">{asset.purchaseDate}</td><td className="px-4 py-4 text-right font-semibold text-[#0058be]">{asset.purchaseAmount}</td>
              <td className="whitespace-nowrap px-4 py-4">{calculateUsageDuration(asset.startUsingDateValue)}</td><td className={`px-4 py-4 font-semibold ${conditionStyles[asset.condition]}`}>{asset.condition}</td><td className="px-4 py-4"><span className={`rounded px-2 py-1 text-xs font-bold uppercase ${statusStyles[asset.status]}`}>{asset.status}</span></td>
              <td className="px-4 py-4"><div className="flex items-center justify-end gap-2"><Link className="inline-flex min-h-9 items-center rounded-md px-3 text-xs font-bold text-[#0058be] hover:bg-[#eff4ff]" href={`/transactions/add?asset=${asset.id}`}>{asset.purchaseAmountValue > 0 ? "Add purchase" : "Record purchase"}</Link><RecordActions deleteDescription={`Deleting ${asset.name} will remove this asset from your register.`} editHref={`/assets/${asset.id}/edit`} itemId={asset.id} itemLabel={asset.name} onDelete={deleteAsset} onView={() => setViewedAsset(asset)} /></div></td>
            </tr>)}</tbody>
          </table>
        </div>
        <div className="grid min-w-0 gap-3 p-3 sm:grid-cols-2 sm:p-4 xl:hidden">{filteredAssets.map((asset) => <AssetCard asset={asset} key={`mobile-${asset.id}`} onDelete={deleteAsset} onView={() => setViewedAsset(asset)} />)}</div>
        {filteredAssets.length === 0 ? <div className="px-4 py-12 text-center"><Icon className="mx-auto size-8 text-[#76777d]" name="box" /><h3 className="mt-3 font-semibold text-[#0b1c30]">No matching assets</h3><p className="mt-1 text-sm text-[#45464d]">Adjust or reset the search and status filters.</p></div> : null}
      </section>
      <DetailModal
        actions={viewedAsset ? <><Link className="inline-flex min-h-11 items-center gap-2 rounded-md border border-[#c6c6cd] bg-white px-4 text-sm font-semibold text-[#0b1c30] hover:bg-[#eff4ff]" href={`/assets/${viewedAsset.id}/edit`}><Icon className="size-4" name="edit" />Edit</Link><Link className="inline-flex min-h-11 items-center gap-2 rounded-md border border-[#c6c6cd] bg-white px-4 text-sm font-semibold text-[#0058be] hover:bg-[#eff4ff]" href={`/transactions/add?asset=${viewedAsset.id}`}><Icon className="size-4" name="receipt" />Record purchase</Link></> : null}
        icon={viewedAsset?.icon}
        iconClassName={viewedAsset ? `${viewedAsset.bg} ${viewedAsset.tone}` : undefined}
        isOpen={viewedAsset !== null}
        onClose={() => setViewedAsset(null)}
        subtitle={viewedAsset?.category}
        title={viewedAsset?.name ?? "Asset details"}
      >
        {viewedAsset ? <div className="space-y-5">
          <DetailModalSection title="Asset information">
            <DetailModalField label="Category" value={viewedAsset.category} />
            <DetailModalField label="Status" value={viewedAsset.status} />
            <DetailModalField label="Condition" value={viewedAsset.condition} />
            <DetailModalField label="Serial / reference" value={viewedAsset.serialReference || "Not set"} />
            <DetailModalField label="Purchase date" value={viewedAsset.purchaseDate || "Not set"} />
            <DetailModalField label="Started using" value={viewedAsset.startUsingDate || "Not set"} />
            <DetailModalField label="Usage duration" value={calculateUsageDuration(viewedAsset.startUsingDateValue)} />
            <DetailModalField label="Created" value={formatDisplayDate(viewedAsset.createdAtValue, "Not set")} />
          </DetailModalSection>
          <DetailModalSection title="Transaction-backed value">
            <DetailModalField label="Linked purchase value" value={viewedAsset.purchaseAmount} />
            <DetailModalField label="Recorded current value" value={viewedAsset.currentValue} />
          </DetailModalSection>
          <DetailModalSection title="Notes">
            <DetailModalField label="Description" value={viewedAsset.note || "No notes"} />
          </DetailModalSection>
        </div> : null}
      </DetailModal>
    </>
  );
}
