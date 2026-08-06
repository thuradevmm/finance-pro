import type { TransactionRelatedOption } from "@/lib/transactions/supabase";
import type { TransactionType } from "@/types/finance";

type RelatedImpactOption = Pick<TransactionRelatedOption, "creditCardDebt" | "type" | "value">;

/**
 * A charge made from a credit-card account can update an explicitly selected
 * record and the card's automatic debt at the same time. An actual card-debt
 * option is already the card impact, while the empty debt option represents
 * the automatic link that will be resolved when the transaction is saved.
 */
export function hasAdditionalAutomaticCreditCardDebtImpact(
  isCreditCardCharge: boolean,
  primaryImpact: RelatedImpactOption | undefined,
) {
  return isCreditCardCharge
    && Boolean(primaryImpact?.value)
    && primaryImpact?.type !== "none"
    && !primaryImpact?.creditCardDebt;
}

export function relatedImpactSupportsTransactionType(
  option: TransactionRelatedOption,
  transactionType: TransactionType,
) {
  if (option.type === "none" || !option.value) return false;
  if (option.type === "asset" || option.type === "subscription") return transactionType === "Expense";
  if (option.type === "savings_goal") return transactionType === "Income" || transactionType === "Expense" || transactionType === "Transfer";
  if (transactionType === "Transfer") return option.debtRepaymentType !== "Income";
  return !option.debtRepaymentType || option.debtRepaymentType === transactionType;
}

export function relatedImpactRecordName(option: TransactionRelatedOption) {
  const separatorIndex = option.label.indexOf(":");
  return separatorIndex >= 0 ? option.label.slice(separatorIndex + 1).trim() : option.label;
}
