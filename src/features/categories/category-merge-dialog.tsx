"use client";

import { useState } from "react";

import { Icon } from "@/components/ui/icon";
import { LoadingSpinner } from "@/components/ui/loading-state";
import { ModalShell } from "@/components/ui/modal-shell";
import type { CategoryRecord } from "@/lib/categories/supabase";

export function CategoryMergeDialog({
  isOpen,
  isPending,
  onCancel,
  onMerge,
  source,
  targets,
}: {
  isOpen: boolean;
  isPending: boolean;
  onCancel: () => void;
  onMerge: (targetCategoryId: string) => void | Promise<void>;
  source: CategoryRecord;
  targets: CategoryRecord[];
}) {
  const [targetCategoryId, setTargetCategoryId] = useState(targets[0]?.id ?? "");

  return (
    <ModalShell
      actions={
        <>
          <button
            className="inline-flex min-h-11 items-center justify-center rounded-md border border-[#c6c6cd] bg-white px-4 text-sm font-semibold text-[#0b1c30] transition hover:bg-[#eff4ff]"
            onClick={onCancel}
            type="button"
          >
            Cancel
          </button>
          <button
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md bg-[#0b1c30] px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-[#1f2937] disabled:cursor-not-allowed disabled:opacity-60"
            disabled={isPending || !targetCategoryId}
            onClick={() => onMerge(targetCategoryId)}
            type="button"
          >
            {isPending ? <LoadingSpinner /> : <Icon className="size-4" name="sync" />}
            {isPending ? "Merging…" : "Merge & reassign"}
          </button>
        </>
      }
      icon="sync"
      iconClassName="bg-[#eff4ff] text-[#0058be]"
      isOpen={isOpen}
      maxWidthClassName="sm:max-w-lg"
      onClose={onCancel}
      subtitle={`${source.name} · ${source.type}`}
      title="Merge category"
    >
      <div className="space-y-4">
        <div className="rounded-md border border-[#bfdbfe] bg-[#eff6ff] px-4 py-3 text-sm leading-6 text-[#0b3b75]">
          All transactions, budgets, linked module records, defaults, and account references will move to the target. {source.name} will remain as a hidden audit record so existing data is never discarded.
        </div>
        {targets.length > 0 ? (
          <label className="block">
            <span className="mb-2 block text-xs font-bold uppercase text-[#45464d]">Merge into</span>
            <span className="relative block">
              <select
                className="h-12 w-full appearance-none rounded-lg border border-[#c6c6cd] bg-white px-4 pr-12 text-sm font-semibold text-[#0b1c30] outline-none transition focus:border-[#2170e4] focus:ring-2 focus:ring-[#2170e4]/20"
                onChange={(event) => setTargetCategoryId(event.target.value)}
                value={targetCategoryId}
              >
                {targets.map((target) => (
                  <option key={target.id} value={target.id}>{target.name}</option>
                ))}
              </select>
              <Icon className="pointer-events-none absolute right-4 top-1/2 size-4 -translate-y-1/2 text-[#76777d]" name="chevronDown" />
            </span>
          </label>
        ) : (
          <div className="rounded-md border border-[#fde68a] bg-[#fffbeb] px-4 py-3 text-sm font-medium text-[#92400e]">
            Create or restore another {source.type.toLowerCase()} category before merging this one.
          </div>
        )}
      </div>
    </ModalShell>
  );
}
