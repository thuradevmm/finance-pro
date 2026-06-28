"use client";

import { Icon, type IconName } from "@/components/ui/icon";
import { LoadingSpinner } from "@/components/ui/loading-state";
import { ModalShell } from "@/components/ui/modal-shell";

type DeleteConfirmationDialogProps = {
  confirmLabel?: string;
  description: string;
  icon?: IconName;
  isOpen: boolean;
  isPending?: boolean;
  itemLabel: string;
  onCancel: () => void;
  onConfirm: () => void | Promise<void>;
  title?: string;
};

export function DeleteConfirmationDialog({
  confirmLabel = "Delete",
  description,
  icon = "trash",
  isOpen,
  isPending = false,
  itemLabel,
  onCancel,
  onConfirm,
  title = "Delete confirmation",
}: DeleteConfirmationDialogProps) {
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
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md bg-[#b42318] px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-[#8f1d14]"
            disabled={isPending}
            onClick={onConfirm}
            type="button"
          >
            {isPending ? <LoadingSpinner /> : <Icon className="size-4" name="trash" />}
            {isPending ? "Deleting…" : confirmLabel}
          </button>
        </>
      }
      icon={icon}
      iconClassName="bg-[#fff1f0] text-[#b42318]"
      isOpen={isOpen}
      maxWidthClassName="sm:max-w-md"
      onClose={onCancel}
      subtitle={itemLabel}
      title={title}
    >
      <div className="space-y-4">
        <div className="rounded-md border border-[#fecaca] bg-[#fff7f5] px-4 py-3">
          <p className="text-sm font-medium text-[#7f1d1d]">{description}</p>
        </div>
        <p className="text-sm text-[#45464d]">This action updates your saved records immediately.</p>
      </div>
    </ModalShell>
  );
}
