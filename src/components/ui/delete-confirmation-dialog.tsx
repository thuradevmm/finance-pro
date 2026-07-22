"use client";

import { Icon, type IconName } from "@/components/ui/icon";
import { LoadingSpinner } from "@/components/ui/loading-state";
import { ModalShell } from "@/components/ui/modal-shell";

type DeleteConfirmationDialogProps = {
  confirmIcon?: IconName;
  confirmLabel?: string;
  description: string;
  icon?: IconName;
  isOpen: boolean;
  isPending?: boolean;
  itemLabel: string;
  onCancel: () => void;
  onConfirm: () => void | Promise<void>;
  pendingLabel?: string;
  title?: string;
  tone?: "danger" | "primary";
};

export function DeleteConfirmationDialog({
  confirmIcon = "trash",
  confirmLabel = "Delete",
  description,
  icon = "trash",
  isOpen,
  isPending = false,
  itemLabel,
  onCancel,
  onConfirm,
  pendingLabel = "Deleting…",
  title = "Delete confirmation",
  tone = "danger",
}: DeleteConfirmationDialogProps) {
  const confirmClassName = tone === "primary"
    ? "bg-[#0b1c30] text-white hover:bg-[#1f2937]"
    : "bg-[#b42318] text-white hover:bg-[#8f1d14]";
  const iconClassName = tone === "primary" ? "bg-[#eff4ff] text-[#0058be]" : "bg-[#fff1f0] text-[#b42318]";
  const messageClassName = tone === "primary"
    ? "border-[#bfdbfe] bg-[#eff6ff] text-[#0b3b75]"
    : "border-[#fecaca] bg-[#fff7f5] text-[#7f1d1d]";

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
            className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-md px-4 text-sm font-semibold shadow-sm transition ${confirmClassName}`}
            disabled={isPending}
            onClick={onConfirm}
            type="button"
          >
            {isPending ? <LoadingSpinner /> : <Icon className="size-4" name={confirmIcon} />}
            {isPending ? pendingLabel : confirmLabel}
          </button>
        </>
      }
      icon={icon}
      iconClassName={iconClassName}
      isOpen={isOpen}
      maxWidthClassName="sm:max-w-md"
      onClose={onCancel}
      subtitle={itemLabel}
      title={title}
    >
      <div className="space-y-4">
        <div className={`rounded-md border px-4 py-3 ${messageClassName}`}>
          <p className="text-sm font-medium">{description}</p>
        </div>
        <p className="text-sm text-[#45464d]">This action updates your saved records immediately.</p>
      </div>
    </ModalShell>
  );
}
