import { Icon } from "@/components/ui/icon";
import { categoryStyles, transactionTypeBadgeClass, transactionTypeIcon } from "@/features/transactions/transaction-styles";
import type { TransactionCategoryName, TransactionType } from "@/types/finance";

export function TransactionTypeBadge({ type }: { type: TransactionType }) {
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-1 text-xs font-semibold ${transactionTypeBadgeClass(type)}`}>
      <Icon className="size-3.5" name={transactionTypeIcon(type)} />
      {type}
    </span>
  );
}

export function CategoryBadge({ category }: { category: TransactionCategoryName }) {
  return (
    <span className={`inline-flex items-center gap-2 rounded-md border px-2.5 py-1 text-xs font-semibold ${categoryStyles[category]}`}>
      <span className="size-1.5 rounded-full bg-current" />
      {category}
    </span>
  );
}
