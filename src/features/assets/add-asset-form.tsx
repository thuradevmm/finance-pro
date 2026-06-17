"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import { Icon } from "@/components/ui/icon";
import { FormCard, SelectInput, TextAreaInput, TextInput } from "@/components/ui/form-controls";
import { getCategoriesForScope } from "@/lib/categories/category-scopes";
import { categories } from "@/lib/categories/mock-data";
import { calculateUsageDuration } from "@/lib/date-duration";
import type { AssetRecord, AssetStatus } from "@/types/finance";

const conditions: AssetRecord["condition"][] = ["Excellent", "Good", "Fair", "Needs Repair"];
const statuses: AssetStatus[] = ["Active", "Sold", "Archived"];

export function AddAssetForm() {
  const assetCategories = useMemo(() => getCategoriesForScope(categories, "Assets", "Expense"), []);
  const categoryOptions = assetCategories.length > 0 ? assetCategories.map((category) => category.name) : ["Electronics"];
  const [name, setName] = useState("");
  const [category, setCategory] = useState(categoryOptions[0]);
  const [purchaseDate, setPurchaseDate] = useState("2026-06-15");
  const [startUsingDate, setStartUsingDate] = useState("2026-06-15");
  const [purchaseAmount, setPurchaseAmount] = useState("");
  const [currentValue, setCurrentValue] = useState("");
  const [condition, setCondition] = useState<AssetRecord["condition"]>("Good");
  const [status, setStatus] = useState<AssetStatus>("Active");
  const [note, setNote] = useState("");
  const [showErrors, setShowErrors] = useState(false);
  const selectedCategory = assetCategories.find((item) => item.name === category) ?? assetCategories[0];
  const nameHasError = showErrors && name.trim() === "";
  const amountHasError = showErrors && purchaseAmount.trim() === "";
  const dateHasError = showErrors && purchaseDate.trim() === "";
  const startUsingDateHasError = showErrors && startUsingDate.trim() === "";
  const usageDuration = calculateUsageDuration(startUsingDate);

  function handleSaveAsset() {
    setShowErrors(name.trim() === "" || purchaseAmount.trim() === "" || purchaseDate.trim() === "" || startUsingDate.trim() === "");
  }

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
      <div className="space-y-6 lg:col-span-8">
        <FormCard title="Asset Details">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div>
              <TextInput error={nameHasError} label="Asset Name" onChange={setName} placeholder="MacBook Pro 14" value={name} />
              {nameHasError ? <p className="mt-1 text-xs font-medium text-[#ba1a1a]">Asset name is required.</p> : null}
            </div>
            <SelectInput label="Asset Category" onChange={setCategory} options={categoryOptions} value={category} />
          </div>

          <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-2">
            <div>
              <TextInput error={dateHasError} label="Purchase Date" onChange={setPurchaseDate} placeholder="2026-06-15" type="date" value={purchaseDate} />
              {dateHasError ? <p className="mt-1 text-xs font-medium text-[#ba1a1a]">Purchase date is required.</p> : null}
            </div>
            <div>
              <TextInput
                error={amountHasError}
                label="Purchase Amount"
                onChange={setPurchaseAmount}
                placeholder="2499"
                type="number"
                value={purchaseAmount}
              />
              {amountHasError ? <p className="mt-1 text-xs font-medium text-[#ba1a1a]">Purchase amount is required.</p> : null}
            </div>
          </div>

          <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-2">
            <TextInput label="Current Value" onChange={setCurrentValue} placeholder="1850" type="number" value={currentValue} />
            <TextInput label="Serial / Reference" placeholder="Optional" />
          </div>
        </FormCard>

        <FormCard title="Tracking Settings">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div>
              <TextInput
                error={startUsingDateHasError}
                label="Start Using Date"
                onChange={setStartUsingDate}
                placeholder="2026-06-15"
                type="date"
                value={startUsingDate}
              />
              {startUsingDateHasError ? <p className="mt-1 text-xs font-medium text-[#ba1a1a]">Start using date is required.</p> : null}
            </div>
            <div>
              <p className="mb-2 block text-sm font-semibold text-[#0b1c30]">Usage Duration</p>
              <div className="flex h-10 items-center rounded-md border border-[#c6c6cd]/70 bg-[#f8f9ff] px-3 text-sm font-semibold text-[#45464d]">
                {usageDuration}
              </div>
            </div>
            <SelectInput label="Condition" onChange={(value) => setCondition(value as AssetRecord["condition"])} options={conditions} value={condition} />
            <SelectInput label="Status" onChange={(value) => setStatus(value as AssetStatus)} options={statuses} value={status} />
          </div>
          <div className="mt-5">
            <TextAreaInput label="Description" onChange={setNote} placeholder="How this asset is used, where it is kept, or comparison notes..." value={note} />
          </div>
        </FormCard>

        <div className="flex flex-col-reverse items-stretch justify-end gap-3 pt-2 sm:flex-row sm:items-center">
          <Link className="inline-flex h-10 items-center justify-center rounded-md px-4 text-sm font-semibold text-[#45464d] transition hover:bg-[#eff4ff]" href="/assets">
            Cancel
          </Link>
          <button
            className="inline-flex h-10 items-center justify-center rounded-md border border-[#c6c6cd]/70 bg-[#eff4ff] px-4 text-sm font-semibold text-[#0058be] transition hover:bg-[#dce9ff]"
            type="button"
          >
            Save & Add Another
          </button>
          <button
            className="inline-flex h-10 items-center justify-center rounded-md bg-[#0b1c30] px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-[#1f2937]"
            onClick={handleSaveAsset}
            type="button"
          >
            Save Asset
          </button>
        </div>
      </div>

      <aside className="hidden lg:col-span-4 lg:block">
        <div className="sticky top-24 rounded-lg border border-[#c6c6cd]/60 bg-[#eff4ff] p-6 shadow-[0_4px_20px_rgba(15,23,42,0.04)]">
          <div className="rounded-lg border border-[#c6c6cd]/60 bg-white p-5">
            <div className="mb-5 flex items-center gap-3 border-b border-[#c6c6cd]/40 pb-4">
              <span className={`grid size-11 place-items-center rounded-lg ${selectedCategory?.bg ?? "bg-[#eff6ff]"} ${selectedCategory?.tone ?? "text-[#0058be]"}`}>
                <Icon name={selectedCategory?.icon ?? "box"} />
              </span>
              <div>
                <p className="text-xs font-bold uppercase text-[#45464d]">Asset Preview</p>
                <h3 className="text-xl font-semibold text-[#0b1c30]">{name || "New Asset"}</h3>
              </div>
            </div>

            <dl className="space-y-4 rounded-lg border border-[#c6c6cd]/40 bg-[#f8f9ff] p-4">
              <div className="flex items-center justify-between gap-4">
                <dt className="text-xs font-bold uppercase text-[#45464d]">Category</dt>
                <dd className="text-sm font-semibold text-[#0b1c30]">{category}</dd>
              </div>
              <div className="flex items-center justify-between gap-4">
                <dt className="text-xs font-bold uppercase text-[#45464d]">Purchase</dt>
                <dd className="text-sm font-semibold text-[#0b1c30]">{purchaseAmount ? `$${purchaseAmount}` : "$0"}</dd>
              </div>
              <div className="flex items-center justify-between gap-4">
                <dt className="text-xs font-bold uppercase text-[#45464d]">Current</dt>
                <dd className="text-sm font-semibold text-[#0058be]">{currentValue ? `$${currentValue}` : "$0"}</dd>
              </div>
              <div className="flex items-center justify-between gap-4">
                <dt className="text-xs font-bold uppercase text-[#45464d]">Started</dt>
                <dd className="text-sm font-semibold text-[#0b1c30]">{startUsingDate || "-"}</dd>
              </div>
              <div className="flex items-center justify-between gap-4">
                <dt className="text-xs font-bold uppercase text-[#45464d]">Used</dt>
                <dd className="text-sm font-semibold text-[#0b1c30]">{usageDuration}</dd>
              </div>
              <div className="flex items-center justify-between gap-4">
                <dt className="text-xs font-bold uppercase text-[#45464d]">Condition</dt>
                <dd className="text-sm font-semibold text-[#0b1c30]">{condition}</dd>
              </div>
              <div className="flex items-center justify-between gap-4">
                <dt className="text-xs font-bold uppercase text-[#45464d]">Status</dt>
                <dd className="text-sm font-semibold text-[#0b1c30]">{status}</dd>
              </div>
            </dl>

            <p className="mt-5 rounded-lg border border-[#c6c6cd]/40 bg-white p-4 text-sm font-medium text-[#45464d]">
              {note || "Asset description and comparison notes will appear here."}
            </p>
          </div>
        </div>
      </aside>
    </div>
  );
}
