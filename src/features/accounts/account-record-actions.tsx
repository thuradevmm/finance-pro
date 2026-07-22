"use client";

import { useState } from "react";

import { DeleteConfirmationDialog } from "@/components/ui/delete-confirmation-dialog";
import { Icon } from "@/components/ui/icon";
import { RecordActions } from "@/components/ui/record-actions";
import type { AccountRecord } from "@/lib/accounts/supabase";

export function AccountRecordActions({
  account,
  editHref,
  onArchive,
  onDelete,
  onRestore,
}: {
  account: AccountRecord;
  editHref: string;
  onArchive: (account: AccountRecord) => Promise<boolean>;
  onDelete: (id: string) => void | Promise<void>;
  onRestore: (account: AccountRecord) => Promise<boolean>;
}) {
  const [lifecycleAction, setLifecycleAction] = useState<"archive" | "restore" | null>(null);
  const [isPending, setIsPending] = useState(false);
  const isArchived = account.status === "Archived";
  const isRetiredMpuCard = account.type === "Credit Card" && account.cardType.trim().toLowerCase() === "mpu";
  const lifecycleLabel = isArchived ? "Restore" : "Archive";
  const description = isArchived
    ? `Restore ${account.name} so it can be selected for new transactions and linked records again. Historical activity is already preserved.`
    : isRetiredMpuCard
      ? `Retire this MPU credit-card account without deleting its transaction history. Settle any outstanding balance or card credit and resolve active links first; past transactions and reports will remain available.`
      : `Archive ${account.name} after its balance is settled and active links are resolved. Past transactions and reports will remain available, but the account cannot be used for new activity.`;

  return (
    <>
      <button
        aria-label={`${lifecycleLabel} ${account.name}`}
        className={isArchived
          ? "grid size-11 place-items-center rounded-full text-[#0058be] transition hover:bg-[#eff4ff] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2170e4]/25"
          : "grid size-11 place-items-center rounded-full text-[#92400e] transition hover:bg-[#fffbeb] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#b45309]/25"}
        onClick={() => setLifecycleAction(isArchived ? "restore" : "archive")}
        title={`${lifecycleLabel} ${account.name}`}
        type="button"
      >
        <Icon className="size-4" name={isArchived ? "sync" : "eyeOff"} />
      </button>
      <RecordActions
        deleteDescription={`Delete ${account.name} only if it has never been used. Accounts with transactions or linked records are retained and should be archived instead.`}
        deleteTitle="Delete unused account"
        editHref={editHref}
        itemId={account.id}
        itemLabel={account.name}
        onDelete={onDelete}
        showDelete={account.transactionCount === 0}
      />
      <DeleteConfirmationDialog
        confirmIcon={isArchived ? "sync" : "eyeOff"}
        confirmLabel={lifecycleLabel}
        description={description}
        icon={isArchived ? "sync" : "eyeOff"}
        isOpen={lifecycleAction !== null}
        isPending={isPending}
        itemLabel={account.name}
        onCancel={() => setLifecycleAction(null)}
        onConfirm={async () => {
          if (isPending) return;
          setIsPending(true);
          const succeeded = lifecycleAction === "restore"
            ? await onRestore(account)
            : await onArchive(account);
          setIsPending(false);
          if (succeeded) setLifecycleAction(null);
        }}
        pendingLabel={isArchived ? "Restoring…" : "Archiving…"}
        title={isArchived ? "Restore account" : isRetiredMpuCard ? "Retire MPU card account" : "Archive account"}
        tone="primary"
      />
    </>
  );
}
