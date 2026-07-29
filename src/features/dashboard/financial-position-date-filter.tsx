"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { DateRangeField } from "@/components/ui/date-range-field";
import { FilterActions } from "@/components/ui/filter-actions";

type FinancialPositionDateFilterProps = {
  dateFrom: string;
  dateTo: string;
  defaultDateFrom: string;
  defaultDateTo: string;
};

export function FinancialPositionDateFilter({
  dateFrom,
  dateTo,
  defaultDateFrom,
  defaultDateTo,
}: FinancialPositionDateFilterProps) {
  const router = useRouter();
  const [draftFrom, setDraftFrom] = useState(dateFrom);
  const [draftTo, setDraftTo] = useState(dateTo);

  function updateFrom(value: string) {
    setDraftFrom(value);
    if (value && draftTo && value > draftTo) setDraftTo(value);
  }

  function updateTo(value: string) {
    setDraftTo(value);
    if (value && draftFrom && value < draftFrom) setDraftFrom(value);
  }

  return (
    <form action="/dashboard" className="grid min-w-0 gap-3 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end" method="get">
      <DateRangeField
        fromName="dateFrom"
        fromValue={draftFrom}
        label="Financial position date range"
        onFromChange={updateFrom}
        onToChange={updateTo}
        toName="dateTo"
        toValue={draftTo}
      />
      <FilterActions
        onReset={() => {
          setDraftFrom(defaultDateFrom);
          setDraftTo(defaultDateTo);
          router.replace("/dashboard", { scroll: false });
        }}
        searchLabel="Apply Date"
      />
    </form>
  );
}
