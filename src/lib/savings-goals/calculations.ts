import {
  linkedExpenseContributionDelta,
  reversedTransactionType,
  roundCurrencyValue,
  transferDirection,
  type LedgerTransactionInput,
} from "../ledger.ts";
import { transactionStatusIsFinalized } from "../transactions/status.ts";

export type SavingsGoalEntryInput = {
  amount: number | string | null;
  savings_goal_id: string;
  transaction_id: string | null;
  type: string | null;
};

export type SavingsGoalTransactionInput = LedgerTransactionInput & {
  account_id?: string | null;
  id: string | null;
  related_entity_id?: string | null;
  transfer_account_id?: string | null;
};

function presentNumber(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

export function resolveStoredSavingsAmount(values: {
  currentAmount: unknown;
  initialSavedAmount: unknown;
  metadataCurrentAmount: unknown;
  metadataSavedAmount: unknown;
  savedAmount: unknown;
}) {
  return presentNumber(values.savedAmount)
    ?? presentNumber(values.initialSavedAmount)
    ?? presentNumber(values.currentAmount)
    ?? presentNumber(values.metadataCurrentAmount)
    ?? presentNumber(values.metadataSavedAmount)
    ?? 0;
}

export function calculateSavingsContributionCapacity(input: {
  contributionAmount: number;
  linkedSavedAmount: number;
  storedSavedAmount: number;
  targetAmount: number;
}) {
  const savedAmount = roundCurrencyValue(Math.max(
    Number(input.storedSavedAmount || 0) + Number(input.linkedSavedAmount || 0),
    0,
  ));
  const remainingAmount = roundCurrencyValue(Math.max(Number(input.targetAmount || 0) - savedAmount, 0));
  const contributionAmount = roundCurrencyValue(Math.max(Number(input.contributionAmount || 0), 0));
  return {
    isComplete: remainingAmount <= 0.005,
    exceedsRemaining: contributionAmount > remainingAmount + 0.005,
    remainingAmount,
    savedAmount,
  };
}

export function signedSavingsEntryAmount(entry: Pick<SavingsGoalEntryInput, "amount" | "type">) {
  const amount = Math.abs(presentNumber(entry.amount) ?? 0);
  const type = String(entry.type ?? "deposit").trim().toLowerCase();
  return roundCurrencyValue(["expense", "withdrawal"].includes(type) ? -amount : amount);
}

function transactionReservesTrackedCash(transaction: SavingsGoalTransactionInput) {
  const sourceType = reversedTransactionType(transaction)
    || String(transaction.type ?? "").trim().toLowerCase();
  return sourceType === "transfer";
}

function transferContributionForGoal(transaction: SavingsGoalTransactionInput, goalAccountId: string) {
  const metadata = transaction.metadata && typeof transaction.metadata === "object" && !Array.isArray(transaction.metadata)
    ? transaction.metadata as Record<string, unknown>
    : {};
  const direction = transferDirection(metadata);
  if (direction === "credit") return 0;
  const amount = roundCurrencyValue(Math.abs(Number(transaction.amount) || 0));
  if (transaction.transfer_account_id === goalAccountId) return amount;
  if (transaction.account_id === goalAccountId) return -amount;
  return 0;
}

/**
 * Entries are authoritative when they reference a transaction. Expense-based
 * contributions already reduced the account balance, while transfers and
 * manual entries still represent cash that must be reserved from spendable
 * forecast capacity.
 */
export function calculateLinkedSavingsAmounts(
  entries: SavingsGoalEntryInput[],
  transactions: SavingsGoalTransactionInput[],
  goalAccountIdByGoalId: Map<string, string> = new Map(),
) {
  const transactionById = new Map(transactions.flatMap((transaction) => transaction.id ? [[transaction.id, transaction] as const] : []));
  const representedTransactionIds = new Set(entries.flatMap((entry) => entry.transaction_id ? [entry.transaction_id] : []));
  const progressByGoalId = new Map<string, number>();
  const reserveByGoalId = new Map<string, number>();

  function add(target: Map<string, number>, goalId: string, amount: number) {
    target.set(goalId, roundCurrencyValue((target.get(goalId) ?? 0) + amount));
  }

  for (const entry of entries) {
    const transaction = entry.transaction_id ? transactionById.get(entry.transaction_id) : undefined;
    if (transaction && !transactionStatusIsFinalized(transaction.status)) continue;
    const amount = signedSavingsEntryAmount(entry);
    add(progressByGoalId, entry.savings_goal_id, amount);
    if (!transaction || transactionReservesTrackedCash(transaction)) add(reserveByGoalId, entry.savings_goal_id, amount);
  }

  for (const transaction of transactions) {
    if (!transaction.related_entity_id || (transaction.id && representedTransactionIds.has(transaction.id))) continue;
    if (!transactionStatusIsFinalized(transaction.status)) continue;
    const goalAccountId = goalAccountIdByGoalId.get(transaction.related_entity_id) ?? "";
    const amount = transactionReservesTrackedCash(transaction) && goalAccountId
      ? transferContributionForGoal(transaction, goalAccountId)
      : linkedExpenseContributionDelta(transaction);
    add(progressByGoalId, transaction.related_entity_id, amount);
    if (transactionReservesTrackedCash(transaction)) add(reserveByGoalId, transaction.related_entity_id, amount);
  }

  return { progressByGoalId, reserveByGoalId };
}
