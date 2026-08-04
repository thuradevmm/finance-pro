import type { FuturePlanningTransactionOption } from "./supabase.ts";
import { futurePlanningDirectionSupportsTransactionType } from "./transaction-link.ts";
import type { TransactionType } from "../../types/finance.ts";

export type ContextualPlanningOptionInput = {
  categoryId: string;
  date: string;
  relatedSavingsGoalCategoryId?: string;
  transactionType: TransactionType;
};

export function planningOptionMatchesTransaction(
  option: FuturePlanningTransactionOption,
  input: ContextualPlanningOptionInput,
) {
  if (!futurePlanningDirectionSupportsTransactionType(option.direction, input.transactionType)) return false;
  if (option.periodMonth.slice(0, 7) !== input.date.slice(0, 7)) return false;

  if (option.direction === "saving") {
    return Boolean(input.relatedSavingsGoalCategoryId)
      && option.categoryId === input.relatedSavingsGoalCategoryId;
  }

  return Boolean(input.categoryId) && option.categoryId === input.categoryId;
}

export function findContextualPlanningOption(
  options: FuturePlanningTransactionOption[],
  input: ContextualPlanningOptionInput,
  preferredOptionId = "",
) {
  const matches = options.filter((option) => planningOptionMatchesTransaction(option, input));
  return matches.find((option) => option.id === preferredOptionId) ?? matches[0];
}
