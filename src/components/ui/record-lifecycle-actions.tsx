"use client";

import { useState } from "react";

import { DeleteConfirmationDialog } from "@/components/ui/delete-confirmation-dialog";
import { Icon } from "@/components/ui/icon";
import { RecordActions } from "@/components/ui/record-actions";

type RecordLifecycleActionsProps = {
  deactivateDescription: string;
  deactivateLabel?: string;
  deactivatePendingLabel?: string;
  deactivateTitle?: string;
  deleteDescription: string;
  deleteTitle?: string;
  editHref: string;
  isInactive: boolean;
  itemId: string;
  itemLabel: string;
  onDeactivate: (itemId: string) => Promise<boolean>;
  onDelete: (itemId: string) => void | Promise<void>;
  onRestore: (itemId: string) => Promise<boolean>;
  onView?: () => void;
  restoreDescription: string;
  restoreLabel?: string;
  restorePendingLabel?: string;
  restoreTitle?: string;
  showDelete?: boolean;
  showEdit?: boolean;
};

/**
 * Keeps financial-history retirement separate from deletion. Deactivation
 * preserves the parent record and every linked transaction; Delete is only
 * exposed when the caller has determined that the record is unused.
 */
export function RecordLifecycleActions({
  deactivateDescription,
  deactivateLabel = "Deactivate",
  deactivatePendingLabel = "Deactivating…",
  deactivateTitle = "Deactivate record",
  deleteDescription,
  deleteTitle = "Delete unused record",
  editHref,
  isInactive,
  itemId,
  itemLabel,
  onDeactivate,
  onDelete,
  onRestore,
  onView,
  restoreDescription,
  restoreLabel = "Restore",
  restorePendingLabel = "Restoring…",
  restoreTitle = "Restore record",
  showDelete = true,
  showEdit = true,
}: RecordLifecycleActionsProps) {
  const [isLifecycleOpen, setIsLifecycleOpen] = useState(false);
  const [isPending, setIsPending] = useState(false);
  const actionLabel = isInactive ? restoreLabel : deactivateLabel;

  return (
    <>
      <button
        aria-label={`${actionLabel} ${itemLabel}`}
        className={isInactive
          ? "grid size-11 place-items-center rounded-full text-[#0058be] transition hover:bg-[#eff4ff] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2170e4]/25"
          : "grid size-11 place-items-center rounded-full text-[#92400e] transition hover:bg-[#fffbeb] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#b45309]/25"}
        onClick={() => setIsLifecycleOpen(true)}
        title={`${actionLabel} ${itemLabel}`}
        type="button"
      >
        <Icon className="size-4" name={isInactive ? "sync" : "eyeOff"} />
      </button>
      <RecordActions
        deleteDescription={deleteDescription}
        deleteTitle={deleteTitle}
        editHref={editHref}
        itemId={itemId}
        itemLabel={itemLabel}
        onDelete={onDelete}
        onView={onView}
        showDelete={showDelete}
        showEdit={showEdit}
      />
      <DeleteConfirmationDialog
        confirmIcon={isInactive ? "sync" : "eyeOff"}
        confirmLabel={actionLabel}
        description={isInactive ? restoreDescription : deactivateDescription}
        icon={isInactive ? "sync" : "eyeOff"}
        isOpen={isLifecycleOpen}
        isPending={isPending}
        itemLabel={itemLabel}
        onCancel={() => setIsLifecycleOpen(false)}
        onConfirm={async () => {
          if (isPending) return;
          setIsPending(true);
          try {
            const succeeded = isInactive
              ? await onRestore(itemId)
              : await onDeactivate(itemId);
            if (succeeded) setIsLifecycleOpen(false);
          } finally {
            setIsPending(false);
          }
        }}
        pendingLabel={isInactive ? restorePendingLabel : deactivatePendingLabel}
        title={isInactive ? restoreTitle : deactivateTitle}
        tone="primary"
      />
    </>
  );
}
