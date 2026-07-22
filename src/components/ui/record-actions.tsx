"use client";

import Link from "next/link";
import { useState } from "react";

import { DeleteConfirmationDialog } from "@/components/ui/delete-confirmation-dialog";
import { Icon } from "@/components/ui/icon";

type RecordActionsProps = {
  deleteDescription?: string;
  deleteTitle?: string;
  editHref: string;
  itemId: string;
  itemLabel: string;
  onDelete?: (itemId: string) => void | Promise<void>;
  showDelete?: boolean;
  showEdit?: boolean;
  viewHref?: string;
  viewLabel?: string;
};

export function RecordActions({
  deleteDescription,
  deleteTitle = "Delete Record",
  editHref,
  itemId,
  itemLabel,
  onDelete,
  showDelete = true,
  showEdit = true,
  viewHref,
  viewLabel = "View related records",
}: RecordActionsProps) {
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  return (
    <>
      {viewHref ? (
        <Link
          aria-label={`${viewLabel} for ${itemLabel}`}
          className="grid size-11 place-items-center rounded-full text-[#45464d] transition hover:bg-[#eff4ff] hover:text-[#2170e4] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2170e4]/25"
          href={viewHref}
          title={`${viewLabel} for ${itemLabel}`}
        >
          <Icon className="size-4" name="eye" />
        </Link>
      ) : null}
      {showEdit ? (
        <Link
          aria-label={`Edit ${itemLabel}`}
          className="grid size-11 place-items-center rounded-full text-[#45464d] transition hover:bg-[#eff4ff] hover:text-[#0b1c30] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2170e4]/25"
          href={editHref}
          title={`Edit ${itemLabel}`}
        >
          <Icon className="size-4" name="edit" />
        </Link>
      ) : null}
      {showDelete ? (
        <>
          <button
            aria-label={`Delete ${itemLabel}`}
            className="grid size-11 place-items-center rounded-full text-[#b42318] transition hover:bg-[#fff1f0] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#b42318]/25"
            onClick={() => setIsDeleteOpen(true)}
            title={`Delete ${itemLabel}`}
            type="button"
          >
            <Icon className="size-4" name="trash" />
          </button>
          <DeleteConfirmationDialog
            description={deleteDescription ?? `Deleting ${itemLabel} will remove it from your saved records.`}
            isOpen={isDeleteOpen}
            isPending={isDeleting}
            itemLabel={itemLabel}
            onCancel={() => setIsDeleteOpen(false)}
            onConfirm={async () => {
              if (isDeleting) return;
              setIsDeleting(true);
              try {
                await onDelete?.(itemId);
                setIsDeleteOpen(false);
              } finally {
                setIsDeleting(false);
              }
            }}
            title={deleteTitle}
          />
        </>
      ) : null}
    </>
  );
}
