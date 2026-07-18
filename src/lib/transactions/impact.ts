import type { TransactionRelatedOption } from "@/lib/transactions/supabase";

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
