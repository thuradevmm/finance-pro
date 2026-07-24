"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

import { createAsset, updateAsset } from "@/app/assets/actions";
import { useInteractionLoading } from "@/components/app/interaction-loading-provider";
import { Icon } from "@/components/ui/icon";
import { FormCard, SelectInput, TextAreaInput, TextInput } from "@/components/ui/form-controls";
import { LoadingButton } from "@/components/ui/loading-state";
import { ResponsiveAmount } from "@/components/ui/responsive-amount";
import { useToast } from "@/components/ui/toast-provider";
import { formatMmkPreview } from "@/lib/currency";
import { isValidCalendarDate } from "@/lib/date-validation";
import { getCategoriesForScope } from "@/lib/categories/category-scopes";
import type { CategoryRecord } from "@/lib/categories/supabase";
import { calculateUsageDuration } from "@/lib/date-duration";
import type { AssetFormData, AssetRecordWithValues } from "@/lib/assets/supabase";
import type { AssetRecord, AssetStatus } from "@/types/finance";

const conditions: AssetRecord["condition"][] = ["Excellent", "Good", "Fair", "Needs Repair"];
const statuses: AssetStatus[] = ["Active", "Sold", "Archived"];

function localToday() {
  const today = new Date();
  return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
}

export function AddAssetForm({ asset, categories }: { asset?: AssetRecordWithValues; categories: CategoryRecord[] }) {
  const { showError, showSuccess } = useToast();
  const router = useRouter();
  const beginLoading = useInteractionLoading();
  const defaultDate = localToday();
  const assetCategories = useMemo(() => getCategoriesForScope(categories, "Assets", "Asset"), [categories]);
  const [name, setName] = useState(asset?.name ?? "");
  const [categoryId, setCategoryId] = useState(asset?.categoryId ?? assetCategories[0]?.id ?? "");
  const [purchaseDate, setPurchaseDate] = useState(asset?.purchaseDateValue ?? defaultDate);
  const [startUsingDate, setStartUsingDate] = useState(asset?.startUsingDateValue ?? defaultDate);
  const [purchaseAmount, setPurchaseAmount] = useState(asset ? String(asset.purchaseAmountValue) : "");
  const [currentValue, setCurrentValue] = useState(asset ? String(asset.currentValueValue) : "");
  const [serialReference, setSerialReference] = useState(asset?.serialReference ?? "");
  const [condition, setCondition] = useState<AssetRecord["condition"]>(asset?.condition ?? "Good");
  const [status, setStatus] = useState<AssetStatus>(asset?.status ?? "Active");
  const [note, setNote] = useState(asset?.note ?? "");
  const [showErrors, setShowErrors] = useState(false);
  const [formError, setFormError] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const selectedCategory = assetCategories.find((item) => item.id === categoryId) ?? assetCategories[0];
  const nameHasError = showErrors && name.trim() === "";
  const purchaseAmountIsInvalid = purchaseAmount.trim() === "" || !Number.isFinite(Number(purchaseAmount)) || Number(purchaseAmount) < 0;
  const currentValueIsInvalid = currentValue.trim() !== "" && (!Number.isFinite(Number(currentValue)) || Number(currentValue) < 0);
  const usageDateIsInvalid = Boolean(purchaseDate && startUsingDate && startUsingDate < purchaseDate);
  const amountHasError = showErrors && purchaseAmountIsInvalid;
  const currentValueHasError = showErrors && currentValueIsInvalid;
  const dateHasError = showErrors && !isValidCalendarDate(purchaseDate);
  const startUsingDateHasError = showErrors && (!isValidCalendarDate(startUsingDate) || usageDateIsInvalid);
  const usageDuration = calculateUsageDuration(startUsingDate);

  async function handleSaveAsset(addAnother = false) {
    const hasErrors = name.trim() === ""
      || purchaseAmountIsInvalid
      || currentValueIsInvalid
      || !isValidCalendarDate(purchaseDate)
      || !isValidCalendarDate(startUsingDate)
      || usageDateIsInvalid;
    setShowErrors(hasErrors);
    setFormError("");
    if (hasErrors) return;
    const input: AssetFormData = {
      categoryId,
      condition,
      currentValue: currentValue.trim() ? Number(currentValue) : Number(purchaseAmount),
      name,
      note,
      purchaseAmount: Number(purchaseAmount),
      purchaseDate,
      serialReference,
      startUsingDate,
      status,
    };
    setIsSaving(true);
    const result = asset ? await updateAsset(asset.id, input) : await createAsset(input);
    if (result.error) {
      setIsSaving(false);
      setFormError(result.error);
      showError(result.error);
      return;
    }
    if (addAnother && !asset) {
      setIsSaving(false);
      setName("");
      setPurchaseAmount("");
      setCurrentValue("");
      setSerialReference("");
      setNote("");
      showSuccess("Asset saved successfully.");
      return;
    }
    showSuccess(asset ? "Asset updated successfully." : "Asset saved successfully.");
    beginLoading();
    router.push("/assets");
    router.refresh();
  }

  return (
    <div className="grid min-w-0 grid-cols-1 gap-6 xl:grid-cols-12">
      <div className="min-w-0 space-y-6 xl:col-span-8">
        <FormCard title="Asset Details">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div>
              <TextInput error={nameHasError} label="Asset Name" onChange={setName} placeholder="MacBook Pro 14" value={name} />
              {nameHasError ? <p className="mt-1 text-xs font-medium text-[#ba1a1a]">Asset name is required.</p> : null}
            </div>
            <SelectInput label="Asset Category" onChange={(name) => setCategoryId(assetCategories.find((category) => category.name === name)?.id ?? "")} options={assetCategories.length > 0 ? assetCategories.map((category) => category.name) : ["No asset categories"]} value={selectedCategory?.name ?? "No asset categories"} />
          </div>

          <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-2">
            <div>
              <TextInput error={dateHasError} label="Purchase Date" onChange={setPurchaseDate} placeholder="YYYY-MM-DD" type="date" value={purchaseDate} />
              {dateHasError ? <p className="mt-1 text-xs font-medium text-[#ba1a1a]">Purchase date is required.</p> : null}
            </div>
            <div>
              <TextInput
                error={amountHasError}
                label="Purchase Amount"
                onChange={setPurchaseAmount}
                placeholder="2499"
                type="amount"
                value={purchaseAmount}
              />
              {amountHasError ? <p className="mt-1 text-xs font-medium text-[#ba1a1a]">Purchase amount is required.</p> : null}
            </div>
          </div>

          <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-2">
            <div>
              <TextInput error={currentValueHasError} label="Current Value" onChange={setCurrentValue} placeholder="1850" type="amount" value={currentValue} />
              {currentValueHasError ? <p className="mt-1 text-xs font-medium text-[#ba1a1a]">Current value cannot be negative.</p> : null}
            </div>
            <TextInput label="Serial / Reference" onChange={setSerialReference} placeholder="Optional" value={serialReference} />
          </div>
        </FormCard>

        <FormCard title="Tracking Settings">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div>
              <TextInput
                error={startUsingDateHasError}
                label="Start Using Date"
                onChange={setStartUsingDate}
                placeholder="YYYY-MM-DD"
                type="date"
                value={startUsingDate}
              />
              {startUsingDateHasError ? <p className="mt-1 text-xs font-medium text-[#ba1a1a]">Start using date is required and cannot be before the purchase date.</p> : null}
            </div>
            <div>
              <p className="mb-2 block text-sm font-semibold text-[#0b1c30]">Usage Duration</p>
              <div className="flex min-h-11 items-center rounded-md border border-[#c6c6cd]/70 bg-[#f8f9ff] px-3 text-sm font-semibold text-[#45464d]">
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

        <div className="space-y-3 pt-2">
          {formError ? <div className="w-full rounded-md border border-[#fecaca] bg-[#fff1f0] px-4 py-2 text-sm font-medium text-[#991b1b]" role="alert">{formError}</div> : null}
          <div className="flex flex-col-reverse items-stretch justify-end gap-3 sm:flex-row sm:items-center">
            <Link className="inline-flex min-h-11 items-center justify-center rounded-md px-4 text-sm font-semibold text-[#45464d] transition hover:bg-[#eff4ff]" href="/assets">
              Cancel
            </Link>
            <button
              className="inline-flex min-h-11 items-center justify-center rounded-md border border-[#c6c6cd]/70 bg-[#eff4ff] px-4 text-sm font-semibold text-[#0058be] transition hover:bg-[#dce9ff]"
              disabled={isSaving || Boolean(asset)}
              onClick={() => handleSaveAsset(true)}
              type="button"
            >
              Save & Add Another
            </button>
            <LoadingButton
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md bg-[#0b1c30] px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-[#1f2937]"
              isLoading={isSaving}
              loadingLabel="Saving…"
              onClick={() => handleSaveAsset(false)}
              type="button"
            >
              Save Asset
            </LoadingButton>
          </div>
        </div>
      </div>

      <aside className="hidden min-w-0 xl:col-span-4 xl:block">
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
                <dd className="text-sm font-semibold text-[#0b1c30]">{selectedCategory?.name ?? "No category"}</dd>
              </div>
              <div className="flex items-center justify-between gap-4">
                <dt className="text-xs font-bold uppercase text-[#45464d]">Purchase</dt>
                <dd className="min-w-0 text-right"><ResponsiveAmount className="font-semibold text-[#0b1c30]" maxSizeRem={0.875}>{purchaseAmount ? formatMmkPreview(purchaseAmount) : formatMmkPreview(0)}</ResponsiveAmount></dd>
              </div>
              <div className="flex items-center justify-between gap-4">
                <dt className="text-xs font-bold uppercase text-[#45464d]">Current</dt>
                <dd className="min-w-0 text-right"><ResponsiveAmount className="font-semibold text-[#0058be]" maxSizeRem={0.875}>{currentValue ? formatMmkPreview(currentValue) : formatMmkPreview(0)}</ResponsiveAmount></dd>
              </div>
              <div className="flex items-center justify-between gap-4">
                <dt className="text-xs font-bold uppercase text-[#45464d]">Started</dt>
                <dd className="text-sm font-semibold text-[#0b1c30]">{startUsingDate || "-"}</dd>
              </div>
              <div className="flex items-center justify-between gap-4">
                <dt className="text-xs font-bold uppercase text-[#45464d]">Reference</dt>
                <dd className="max-w-40 truncate text-sm font-semibold text-[#0b1c30]">{serialReference || "-"}</dd>
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
