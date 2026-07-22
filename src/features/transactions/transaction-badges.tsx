import { Icon } from "@/components/ui/icon";
import { categoryStyles, transactionTypeBadgeClass, transactionTypeIcon } from "@/features/transactions/transaction-styles";
import { normalizeTransactionStatus, transactionStatusLabel } from "@/lib/transactions/status";
import type { Transaction, TransactionStatus, TransactionType } from "@/types/finance";

export function TransactionTypeBadge({ transferDirection, type }: { transferDirection?: Transaction["transferDirection"]; type: TransactionType }) {
  return (
    <span className={`inline-flex min-w-0 max-w-full items-center gap-1 rounded-full border px-2 py-1 text-xs font-semibold ${transactionTypeBadgeClass(type)}`}>
      <Icon className="size-3.5 shrink-0" name={transactionTypeIcon(type)} />
      <span className="truncate">{type === "Transfer" && transferDirection ? `Transfer ${transferDirection}` : type}</span>
    </span>
  );
}

export function CategoryBadge({ category }: { category: string }) {
  return (
    <span className={`inline-flex min-w-0 max-w-full items-center gap-2 rounded-md border px-2.5 py-1 text-xs font-semibold ${categoryStyles[category] ?? "border-[#d4d4d8] bg-[#f4f4f5] text-[#3f3f46]"}`}>
      <span className="size-1.5 shrink-0 rounded-full bg-current" />
      <span className="truncate">{category}</span>
    </span>
  );
}

const statusStyles: Record<TransactionStatus, string> = {
  cancelled: "border-[#e4e4e7] bg-[#f8f9ff] text-[#45464d]",
  cleared: "border-[#bbf7d0] bg-[#ecfdf5] text-[#166534]",
  failed: "border-[#fecaca] bg-[#fff1f0] text-[#991b1b]",
  pending: "border-[#fde68a] bg-[#fffbeb] text-[#92400e]",
  scheduled: "border-[#bfdbfe] bg-[#eff6ff] text-[#0058be]",
  unknown: "border-[#e4e4e7] bg-[#f8f9ff] text-[#45464d]",
  void: "border-[#e4e4e7] bg-[#f8f9ff] text-[#45464d]",
};

export function TransactionStatusBadge({ status }: { status: unknown }) {
  const normalized = normalizeTransactionStatus(status);
  return (
    <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-bold ${statusStyles[normalized]}`}>
      {transactionStatusLabel(normalized)}
    </span>
  );
}
