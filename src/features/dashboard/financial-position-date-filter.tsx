"use client";

import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";

import { DateRangeField } from "@/components/ui/date-range-field";
import { FilterActions } from "@/components/ui/filter-actions";
import { Icon } from "@/components/ui/icon";

type FinancialPositionDateFilterProps = {
  amountTypeOptions: string[];
  dateFrom: string;
  dateTo: string;
  defaultDateFrom: string;
  defaultDateTo: string;
  selectedAmountTypes: string[];
};

type AmountTypeFilterProps = {
  onChange: (amountTypes: string[]) => void;
  options: string[];
  value: string[];
};

function AmountTypeFilter({ onChange, options, value }: AmountTypeFilterProps) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const menuId = useId();
  const selectedCount = value.length;
  const allSelected = options.length > 0 && selectedCount === options.length;
  const selectionLabel = options.length === 0
    ? "No amount types"
    : allSelected
      ? "All amount types"
      : selectedCount === 1
        ? value[0]
        : `${selectedCount} amount types`;

  useEffect(() => {
    function closeOnOutsidePress(event: PointerEvent) {
      if (!containerRef.current?.contains(event.target as Node)) setIsOpen(false);
    }

    document.addEventListener("pointerdown", closeOnOutsidePress);
    return () => document.removeEventListener("pointerdown", closeOnOutsidePress);
  }, []);

  function toggleAmountType(amountType: string, checked: boolean) {
    if (checked) {
      onChange([...value, amountType]);
      return;
    }
    onChange(value.length > 1 ? value.filter((item) => item !== amountType) : [...value]);
  }

  return (
    <div
      className="relative min-w-0"
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          setIsOpen(false);
          containerRef.current?.querySelector<HTMLButtonElement>("button")?.focus();
        }
      }}
      ref={containerRef}
    >
      <button
        aria-controls={isOpen ? menuId : undefined}
        aria-expanded={isOpen}
        aria-haspopup="dialog"
        aria-label={`Amount type filter: ${selectionLabel}`}
        className="flex h-11 w-full min-w-0 items-center gap-2 rounded-md border border-[#c6c6cd] bg-white px-3 text-left text-sm text-[#0b1c30] outline-none transition hover:bg-[#f8f9ff] focus-visible:border-[#2170e4] focus-visible:ring-2 focus-visible:ring-[#2170e4]/20 disabled:cursor-not-allowed disabled:bg-[#f1f1f4] disabled:text-[#76777d]"
        disabled={options.length === 0}
        onClick={() => setIsOpen((current) => !current)}
        type="button"
      >
        <Icon className="size-4 shrink-0 text-[#0058be]" name="category" />
        <span className="min-w-0 flex-1 truncate font-medium">{selectionLabel}</span>
        {options.length > 0 ? (
          <span className="shrink-0 rounded-full bg-[#eff6ff] px-2 py-0.5 text-[0.6875rem] font-bold text-[#0058be]">
            {selectedCount}/{options.length}
          </span>
        ) : null}
        <Icon className={`size-4 shrink-0 text-[#76777d] transition-transform ${isOpen ? "rotate-180" : ""}`} name="chevronDown" />
      </button>

      {isOpen ? (
        <div
          aria-label="Amount type filter"
          className="absolute left-0 top-[calc(100%+0.5rem)] z-40 w-full min-w-0 overflow-hidden rounded-lg border border-[#c6c6cd]/80 bg-white shadow-[0_16px_40px_rgba(15,23,42,0.16)]"
          id={menuId}
          role="dialog"
        >
          <div className="flex items-center justify-between gap-3 border-b border-[#c6c6cd]/50 px-3 py-2.5">
            <div className="min-w-0">
              <p className="text-xs font-bold text-[#0b1c30]">Amount types</p>
              <p className="mt-0.5 text-[0.6875rem] font-medium text-[#76777d]">Select one or more</p>
            </div>
            <button
              className="shrink-0 rounded-md px-2 py-1 text-xs font-bold text-[#0058be] transition hover:bg-[#eff6ff] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2170e4]/25 disabled:text-[#76777d]"
              disabled={allSelected}
              onClick={() => onChange(options)}
              type="button"
            >
              Select all
            </button>
          </div>
          <div className="max-h-64 overflow-y-auto p-1.5">
            {options.map((amountType) => {
              const checked = value.includes(amountType);
              return (
                <label className="flex min-h-10 cursor-pointer items-center gap-3 rounded-md px-2.5 text-sm font-medium text-[#0b1c30] transition hover:bg-[#eff4ff]" key={amountType}>
                  <input
                    checked={checked}
                    className="size-4 shrink-0 accent-[#0058be]"
                    name="amountType"
                    onChange={(event) => toggleAmountType(amountType, event.target.checked)}
                    type="checkbox"
                    value={amountType}
                  />
                  <span className="min-w-0 flex-1 truncate">{amountType}</span>
                  {checked ? <Icon className="size-4 shrink-0 text-[#0058be]" name="check" /> : null}
                </label>
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
}

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
    <form action="/dashboard" className="grid min-w-0 gap-3 sm:grid-cols-2 xl:grid-cols-[minmax(22rem,1fr)_minmax(15rem,20rem)_auto] xl:items-center" method="get">
      <div className="min-w-0 sm:col-span-2 xl:col-span-1">
        <DateRangeField
          fromName="dateFrom"
          fromValue={draftFrom}
          label="Financial position date range"
          onFromChange={updateFrom}
          onToChange={updateTo}
          toName="dateTo"
          toValue={draftTo}
        />
      </div>
      <AmountTypeFilter onChange={setDraftAmountTypes} options={amountTypeOptions} value={draftAmountTypes} />
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
