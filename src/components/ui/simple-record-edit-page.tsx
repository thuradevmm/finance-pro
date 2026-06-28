"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { EditFormSection, EditRecordPage } from "@/components/ui/edit-record-page";
import { useInteractionLoading } from "@/components/app/interaction-loading-provider";
import { SelectInput, TextAreaInput, TextInput } from "@/components/ui/form-controls";
import { Icon, type IconName } from "@/components/ui/icon";
import { calculateUsageDuration } from "@/lib/date-duration";
import { formatDisplayDate } from "@/lib/date-format";
import { formatMmk } from "@/lib/currency";

export type SimpleEditField = {
  key: string;
  label: string;
  options?: string[];
  placeholder?: string;
  type?: "currency" | "date" | "number" | "percent" | "text" | "textarea";
};

type SimpleRecordEditPageProps = {
  cancelHref: string;
  fields: SimpleEditField[];
  preview: {
    icon: IconName;
    iconClassName: string;
    label: string;
    primaryKey: string;
    secondaryKey?: string;
    metrics: { format?: "usageDurationFromDate"; label: string; key: string }[];
  };
  record: Record<string, string>;
  saveLabel: string;
};

export function SimpleRecordEditPage({ cancelHref, fields, preview, record, saveLabel }: SimpleRecordEditPageProps) {
  const router = useRouter();
  const beginLoading = useInteractionLoading();
  const [draft, setDraft] = useState(record);

  function updateDraft(key: string, value: string) {
    setDraft((currentDraft) => ({ ...currentDraft, [key]: value }));
  }

  function getNumericInputValue(value: string) {
    return value.replace(/[^0-9.]/g, "");
  }

  function formatCurrency(value: string) {
    const numericValue = Number(getNumericInputValue(value));

    if (!value.trim() || Number.isNaN(numericValue)) {
      return "";
    }

    return formatMmk(numericValue);
  }

  function formatPercent(value: string) {
    const numericValue = Number(getNumericInputValue(value));

    if (!value.trim() || Number.isNaN(numericValue)) {
      return "";
    }

    return `${numericValue}%`;
  }

  function getDateInputValue(value: string) {
    const parsedDate = new Date(value);

    if (Number.isNaN(parsedDate.getTime())) {
      return "";
    }

    return parsedDate.toISOString().slice(0, 10);
  }

  function formatDate(value: string) {
    if (!value) {
      return "";
    }

    return formatDisplayDate(value);
  }

  function getMetricValue(metric: { format?: "usageDurationFromDate"; key: string }) {
    if (metric.format === "usageDurationFromDate") {
      return calculateUsageDuration(draft[metric.key] ?? "");
    }

    return draft[metric.key] || "-";
  }

  return (
    <EditRecordPage
      cancelHref={cancelHref}
      onSave={() => { beginLoading(); router.push(cancelHref); }}
      preview={
        <div className="sticky top-24 min-w-0 rounded-lg border border-[#c6c6cd]/60 bg-[#eff4ff] p-4 shadow-[0_4px_20px_rgba(15,23,42,0.04)] xl:p-6">
          <div className="rounded-lg border border-[#c6c6cd]/60 bg-white p-5">
            <div className="mb-5 flex items-center gap-3 border-b border-[#c6c6cd]/40 pb-4">
              <span className={`grid size-11 place-items-center rounded-lg ${preview.iconClassName}`}>
                <Icon name={preview.icon} />
              </span>
              <div className="min-w-0">
                <p className="text-xs font-bold uppercase text-[#45464d]">{preview.label}</p>
                <h3 className="truncate text-xl font-semibold text-[#0b1c30]">{draft[preview.primaryKey] || "Untitled"}</h3>
                {preview.secondaryKey ? <p className="mt-1 truncate text-sm font-medium text-[#45464d]">{draft[preview.secondaryKey]}</p> : null}
              </div>
            </div>
            <dl className="space-y-4 rounded-lg border border-[#c6c6cd]/40 bg-[#f8f9ff] p-4">
              {preview.metrics.map((metric) => (
                <div className="flex min-w-0 items-center justify-between gap-4" key={`${metric.label}-${metric.key}`}>
                  <dt className="min-w-0 text-xs font-bold uppercase text-[#45464d]">{metric.label}</dt>
                  <dd className="amount-value max-w-40 text-right text-sm font-semibold text-[#0b1c30]" title={getMetricValue(metric)}>{getMetricValue(metric)}</dd>
                </div>
              ))}
            </dl>
          </div>
        </div>
      }
      saveLabel={saveLabel}
    >
      <EditFormSection title="Edit Details">
        {fields.map((field) => {
          if (field.type === "textarea") {
            return (
              <div className="md:col-span-2" key={field.key}>
                <TextAreaInput
                  label={field.label}
                  onChange={(value) => updateDraft(field.key, value)}
                  placeholder={field.placeholder ?? field.label}
                  value={draft[field.key] ?? ""}
                />
              </div>
            );
          }

          if (field.options) {
            return (
              <SelectInput
                key={field.key}
                label={field.label}
                onChange={(value) => updateDraft(field.key, value)}
                options={field.options}
                value={draft[field.key] ?? field.options[0]}
              />
            );
          }

          return (
            <TextInput
              key={field.key}
              label={field.label}
              onChange={(value) => {
                if (field.type === "currency") {
                  updateDraft(field.key, formatCurrency(value));
                  return;
                }

                if (field.type === "date") {
                  updateDraft(field.key, formatDate(value));
                  return;
                }

                if (field.type === "percent") {
                  updateDraft(field.key, formatPercent(value));
                  return;
                }

                updateDraft(field.key, value);
              }}
              placeholder={field.placeholder ?? field.label}
              type={field.type === "currency" || field.type === "percent" ? "number" : field.type ?? "text"}
              value={
                field.type === "currency" || field.type === "percent"
                  ? getNumericInputValue(draft[field.key] ?? "")
                  : field.type === "date"
                    ? getDateInputValue(draft[field.key] ?? "")
                    : draft[field.key] ?? ""
              }
            />
          );
        })}
      </EditFormSection>
    </EditRecordPage>
  );
}
