"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { DateRangeField } from "@/components/ui/date-range-field";
import { FilterActions } from "@/components/ui/filter-actions";

type FinancialPositionDateFilterProps = {
  amountTypeOptions: string[];
  dateFrom: string;
  dateTo: string;
  defaultDateFrom: string;
  defaultDateTo: string;
  selectedAmountTypes: string[];
};

export function FinancialPositionDateFilter({
  amountTypeOptions,
  dateFrom,
  dateTo,
  defaultDateFrom,
  defaultDateTo,
  selectedAmountTypes,
}: FinancialPositionDateFilterProps) {
  const router = useRouter();
  const [draftFrom, setDraftFrom] = useState(dateFrom);
  const [draftTo, setDraftTo] = useState(dateTo);
  const [draftAmountTypes, setDraftAmountTypes] = useState(selectedAmountTypes);

  function updateFrom(value: string) {
    setDraftFrom(value);
    if (value && draftTo && value > draftTo) setDraftTo(value);
  }

  function updateTo(value: string) {
    setDraftTo(value);
    if (value && draftFrom && value < draftFrom) setDraftFrom(value);
  }

  return (
    <form action="/dashboard" className="grid min-w-0 gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(18rem,1fr)_auto] xl:items-end" method="get">
      <DateRangeField
        fromName="dateFrom"
        fromValue={draftFrom}
        label="Financial position date range"
        onFromChange={updateFrom}
        onToChange={updateTo}
        toName="dateTo"
        toValue={draftTo}
      />
      <fieldset className="min-w-0">
        <legend className="mb-2 text-xs font-bold uppercase text-[#45464d]">Amount types (select multiple)</legend>
        <div className="flex min-h-12 flex-wrap items-center gap-2 rounded-lg border border-[#c6c6cd] bg-white p-2">
          {amountTypeOptions.map((amountType) => {
            const checked = draftAmountTypes.includes(amountType);
            return (
              <label className={`inline-flex min-h-8 cursor-pointer items-center gap-2 rounded-md border px-2.5 text-xs font-semibold ${checked ? "border-[#2170e4] bg-[#eff6ff] text-[#0058be]" : "border-[#d4d4d8] bg-white text-[#45464d]"}`} key={amountType}>
                <input
                  checked={checked}
                  className="size-4 accent-[#0058be]"
                  name="amountType"
                  onChange={(event) => setDraftAmountTypes((current) => event.target.checked
                    ? [...current, amountType]
                    : current.filter((item) => item !== amountType))}
                  type="checkbox"
                  value={amountType}
                />
                {amountType}
              </label>
            );
          })}
          {amountTypeOptions.length === 0 ? <span className="px-2 text-xs font-medium text-[#76777d]">No amount types available</span> : null}
        </div>
        <p className="mt-1 text-xs font-medium text-[#76777d]">No checked option is treated as all amount types.</p>
      </fieldset>
      <FilterActions
        onReset={() => {
          setDraftFrom(defaultDateFrom);
          setDraftTo(defaultDateTo);
          setDraftAmountTypes(amountTypeOptions);
          router.replace("/dashboard", { scroll: false });
        }}
        searchLabel="Apply Filters"
      />
    </form>
  );
}
