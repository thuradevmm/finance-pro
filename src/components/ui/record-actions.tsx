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
};

export function RecordActions({
  deleteDescription,
  deleteTitle = "Delete Record",
  editHref,
  itemId,
  itemLabel,
  onDelete,
}: RecordActionsProps) {
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  return (
    <>
      <Link
        aria-label={`Edit ${itemLabel}`}
        className="grid size-8 place-items-center rounded-full text-[#45464d] transition hover:bg-[#eff4ff] hover:text-[#0b1c30]"
        href={editHref}
        title={`Edit ${itemLabel}`}
      >
        <Icon className="size-4" name="edit" />
      </Link>
      <button
        aria-label={`Delete ${itemLabel}`}
        className="grid size-8 place-items-center rounded-full text-[#b42318] transition hover:bg-[#fff1f0]"
        onClick={() => setIsDeleteOpen(true)}
        title={`Delete ${itemLabel}`}
        type="button"
      >
        <Icon className="size-4" name="trash" />
      </button>
      <DeleteConfirmationDialog
        description={deleteDescription ?? `Deleting ${itemLabel} will remove it from the current mock list.`}
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
  );
}
