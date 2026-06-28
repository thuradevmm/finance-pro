import { Icon } from "@/components/ui/icon";
import { categoryStyles, transactionTypeBadgeClass, transactionTypeIcon } from "@/features/transactions/transaction-styles";
import type { Transaction, TransactionType } from "@/types/finance";

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
