import { Icon } from "@/components/ui/icon";
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

function AssetCard({ asset }: { asset: AssetRecord }) {
  return (
    <article className="rounded-lg border border-[#c6c6cd]/60 bg-white p-5 shadow-[0_4px_20px_rgba(15,23,42,0.04)]">
      <div className="mb-5 flex items-start justify-between gap-4">
        <div className="flex min-w-0 items-center gap-3">
          <span className={`grid size-11 shrink-0 place-items-center rounded-lg ${asset.bg} ${asset.tone}`}>
            <Icon name={asset.icon} />
          </span>
          <div className="min-w-0">
            <h2 className="truncate text-base font-semibold text-[#0b1c30]">{asset.name}</h2>
            <p className="mt-1 text-sm font-medium text-[#45464d]">{asset.category}</p>
          </div>
        </div>
        <span className={`rounded px-2 py-1 text-xs font-bold uppercase ${statusStyles[asset.status]}`}>{asset.status}</span>
      </div>

      <dl className="grid grid-cols-2 gap-3 rounded-lg border border-[#c6c6cd]/40 bg-[#f8f9ff] p-4">
        <div>
          <dt className="text-xs font-bold uppercase text-[#45464d]">Purchased</dt>
          <dd className="mt-1 text-sm font-semibold text-[#0b1c30]">{asset.purchaseAmount}</dd>
        </div>
        <div>
          <dt className="text-xs font-bold uppercase text-[#45464d]">Current</dt>
          <dd className="mt-1 text-sm font-semibold text-[#0058be]">{asset.currentValue}</dd>
        </div>
        <div>
          <dt className="text-xs font-bold uppercase text-[#45464d]">Used</dt>
          <dd className="mt-1 text-sm font-semibold text-[#0b1c30]">{asset.usageDuration}</dd>
        </div>
        <div>
          <dt className="text-xs font-bold uppercase text-[#45464d]">Condition</dt>
          <dd className={`mt-1 text-sm font-semibold ${conditionStyles[asset.condition]}`}>{asset.condition}</dd>
        </div>
      </dl>

      <div className="mt-4 flex items-center justify-between gap-3 border-t border-[#c6c6cd]/40 pt-4">
        <p className="truncate text-sm font-medium text-[#45464d]">{asset.note}</p>
        <div className="flex shrink-0 gap-1">
          <button className="grid size-8 place-items-center rounded-full text-[#45464d] transition hover:bg-[#eff4ff]" type="button">
            <Icon className="size-4" name="edit" />
          </button>
          <button className="grid size-8 place-items-center rounded-full text-[#b42318] transition hover:bg-[#fff1f0]" type="button">
            <Icon className="size-4" name="trash" />
          </button>
        </div>
      </div>
    </article>
  );
}

function AssetsTable({ assets }: { assets: AssetRecord[] }) {
  return (
    <section className="overflow-hidden rounded-lg border border-[#c6c6cd]/70 bg-white shadow-[0_4px_20px_rgba(15,23,42,0.04)]">
      <div className="border-b border-[#c6c6cd]/50 bg-[#f8f9ff] px-4 py-3">
        <h2 className="text-sm font-bold uppercase text-[#45464d]">Asset Register</h2>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[980px] border-collapse text-left">
          <thead>
            <tr className="border-b border-[#c6c6cd]/50">
              <th className="px-4 py-3 text-xs font-semibold text-[#45464d]">Asset</th>
              <th className="px-4 py-3 text-xs font-semibold text-[#45464d]">Purchase Date</th>
              <th className="px-4 py-3 text-right text-xs font-semibold text-[#45464d]">Purchase</th>
              <th className="px-4 py-3 text-right text-xs font-semibold text-[#45464d]">Current Value</th>
              <th className="px-4 py-3 text-xs font-semibold text-[#45464d]">Usage</th>
              <th className="px-4 py-3 text-xs font-semibold text-[#45464d]">Condition</th>
              <th className="w-24 px-4 py-3 text-right text-xs font-semibold text-[#45464d]">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#c6c6cd]/40 text-sm">
            {assets.map((asset) => (
              <tr className="transition hover:bg-[#f8f9ff]" key={asset.id}>
                <td className="px-4 py-4">
                  <div className="flex items-center gap-3">
                    <span className={`grid size-9 place-items-center rounded-md ${asset.bg} ${asset.tone}`}>
                      <Icon className="size-4" name={asset.icon} />
                    </span>
                    <div>
                      <p className="font-semibold text-[#0b1c30]">{asset.name}</p>
                      <p className="mt-1 text-xs font-medium text-[#45464d]">{asset.category}</p>
                    </div>
                  </div>
                </td>
                <td className="whitespace-nowrap px-4 py-4 text-[#45464d]">{asset.purchaseDate}</td>
                <td className="whitespace-nowrap px-4 py-4 text-right font-semibold text-[#0b1c30]">{asset.purchaseAmount}</td>
                <td className="whitespace-nowrap px-4 py-4 text-right font-semibold text-[#0058be]">{asset.currentValue}</td>
                <td className="whitespace-nowrap px-4 py-4 text-[#45464d]">{asset.usageDuration}</td>
                <td className={`whitespace-nowrap px-4 py-4 font-semibold ${conditionStyles[asset.condition]}`}>{asset.condition}</td>
                <td className="px-4 py-4">
                  <div className="flex justify-end gap-1">
                    <button className="grid size-8 place-items-center rounded-full text-[#45464d] transition hover:bg-[#eff4ff]" type="button">
                      <Icon className="size-4" name="edit" />
                    </button>
                    <button className="grid size-8 place-items-center rounded-full text-[#b42318] transition hover:bg-[#fff1f0]" type="button">
                      <Icon className="size-4" name="trash" />
                    </button>
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

export function AssetsPageContent({ assets }: { assets: AssetRecord[] }) {
  const activeAssets = assets.filter((asset) => asset.status === "Active");

  return (
    <>
      <section className="mb-6 rounded-lg border border-[#c6c6cd]/70 bg-white p-4 shadow-[0_4px_20px_rgba(15,23,42,0.04)]">
        <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-sm font-bold uppercase text-[#45464d]">Active Assets</h2>
            <p className="mt-1 text-sm font-semibold text-[#0b1c30]">{activeAssets.length} assets currently tracked</p>
          </div>
          <div className="inline-flex w-fit items-center gap-2 rounded-md border border-[#c6c6cd]/70 bg-[#f8f9ff] px-3 py-2 text-xs font-semibold text-[#45464d]">
            <Icon className="size-4" name="timeline" />
            Scroll to compare assets
          </div>
        </div>
        <div className="-mx-4 overflow-x-auto px-4 pb-2">
          <div className="flex min-w-max gap-4">
            {activeAssets.map((asset) => (
              <div className="w-[320px] shrink-0 xl:w-[360px]" key={asset.id}>
                <AssetCard asset={asset} />
              </div>
            ))}
          </div>
        </div>
      </section>
      <AssetsTable assets={assets} />
    </>
  );
}
