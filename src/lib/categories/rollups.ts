import { calculateCreditCardPosition } from "../accounts/card-display.ts";
import { resolveAssetPurchaseValue } from "../assets/calculations.ts";
import {
  buildDebtTransactionLedgers,
  creditCardOpeningBalancesByAccount,
  type DebtLedgerDebtInput,
} from "../debts/transactions.ts";
import {
  buildAccountLedgerActivities,
  deriveCreditCardDebtMetadata,
  economicTransactionDelta,
  isCreditCardType,
  linkedExpenseContributionDelta,
  metadataRecord,
  numericValue,
  roundCurrencyValue,
  type LedgerAccountActivity,
  type LedgerTransactionInput,
} from "../ledger.ts";
import {
  isOngoingSubscriptionStatus,
  monthlySubscriptionCost,
  normalizeSubscriptionStatus,
} from "../subscriptions/calculations.ts";

export type CategoryActivityRow = {
  amount: number;
  category_id: string | null;
  date: string | null;
};

export type CategoryActivity = {
  monthlyAverage: number;
  total: number;
  transactionCount: number;
};

export type CategoryRollupAccount = {
  created_at: string | null;
  id: string;
  metadata: unknown;
  type: string | null;
};

export type CategoryRollupAsset = {
  category_id: string | null;
  created_at: string | null;
  id: string;
  metadata: unknown;
  purchase_amount: number | string | null;
  purchase_date: string | null;
};

export type CategoryRollupDebt = DebtLedgerDebtInput & {
  category_id: string | null;
  created_at: string | null;
  start_date: string | null;
};

export type CategoryRollupSavingsGoal = {
  category_id: string | null;
  created_at: string | null;
  metadata: unknown;
  target_amount: number | string | null;
  target_date: string | null;
};

export type CategoryRollupSubscription = {
  amount: number | string | null;
  billing_cycle: string | null;
  category_id: string | null;
  created_at: string | null;
  metadata: unknown;
  next_billing_date: string | null;
  status: string | null;
};

export type CategoryRollupTransaction = LedgerTransactionInput & {
  category_id: string | null;
  id: string;
  transaction_date: string;
};

export type PageCategoryType = "Account" | "Asset" | "Debt" | "Savings Goal" | "Subscription";

export const pageCategoryRollupLabels: Record<PageCategoryType, { activity: string; count: string }> = {
  Account: { activity: "Current Balance", count: "Accounts" },
  Asset: { activity: "Purchase Value", count: "Assets" },
  Debt: { activity: "Total Debt", count: "Debts" },
  "Savings Goal": { activity: "Total Target", count: "Goals" },
  Subscription: { activity: "Monthly Cost", count: "Ongoing Subscriptions" },
};

function presentNumber(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function metadataCategoryId(rowCategoryId: string | null | undefined, metadata: Record<string, unknown>) {
  return rowCategoryId ?? (typeof metadata.category_id === "string" ? metadata.category_id : null);
}

function storedNumber(columnValue: unknown, metadataValue: unknown) {
  return presentNumber(columnValue) ?? numericValue(metadataValue);
}

function accountCategoryId(
  account: CategoryRollupAccount,
  categoryIdByName: ReadonlyMap<string, string>,
) {
  const metadata = metadataRecord(account.metadata);
  if (typeof metadata.category_id === "string" && metadata.category_id) return metadata.category_id;
  return typeof metadata.category === "string"
    ? categoryIdByName.get(metadata.category.trim().toLowerCase()) ?? null
    : null;
}

function configuredCreditLimit(metadata: Record<string, unknown>) {
  return presentNumber(metadata.credit_limit)
    ?? presentNumber(metadata.monthly_budget_limit)
    ?? 0;
}

/**
 * Returns the same primary value shown for an account: transaction-derived
 * cash for cash accounts and available credit for credit cards. Stored opening
 * values are intentionally not added because account balances are ledger-driven.
 */
function accountCurrentValue(
  account: CategoryRollupAccount,
  activity: LedgerAccountActivity | undefined,
  creditCardOpeningBalance: number,
) {
  if (isCreditCardType(account.type)) {
    const creditUsed = roundCurrencyValue((activity?.creditUsed ?? 0) + creditCardOpeningBalance);
    return calculateCreditCardPosition(
      creditUsed,
      configuredCreditLimit(metadataRecord(account.metadata)),
    ).available;
  }

  return roundCurrencyValue(
    Array.from(activity?.deltas.values() ?? []).reduce((total, amount) => total + amount, 0),
  );
}

export function transactionCategoryActivityRows(
  transactions: CategoryRollupTransaction[],
): CategoryActivityRow[] {
  return transactions.flatMap((transaction) => {
    const { expenseDelta, incomeDelta } = economicTransactionDelta(transaction);
    const amount = expenseDelta + incomeDelta;
    if (amount === 0) return [];
    return [{
      amount,
      category_id: transaction.category_id ?? null,
      date: transaction.transaction_date,
    }];
  });
}

export function pageCategoryActivityRows(input: {
  accounts: CategoryRollupAccount[];
  assets: CategoryRollupAsset[];
  categoryIdByName: ReadonlyMap<string, string>;
  debts: CategoryRollupDebt[];
  savingsGoals: CategoryRollupSavingsGoal[];
  subscriptions: CategoryRollupSubscription[];
  transactions: CategoryRollupTransaction[];
}): CategoryActivityRow[] {
  const derivedTransactions = input.transactions.map((transaction) => ({
    ...transaction,
    metadata: deriveCreditCardDebtMetadata(transaction, input.debts, input.accounts),
  }));
  const accountActivities = buildAccountLedgerActivities(derivedTransactions, input.accounts);
  const creditCardOpenings = creditCardOpeningBalancesByAccount(input.debts);
  const debtLedgers = buildDebtTransactionLedgers(derivedTransactions, input.debts);
  const linkedPurchasesByAssetId = new Map<string, number>();

  for (const transaction of derivedTransactions) {
    if (String(transaction.related_entity_type ?? "").toLowerCase() !== "asset" || !transaction.related_entity_id) continue;
    linkedPurchasesByAssetId.set(
      transaction.related_entity_id,
      roundCurrencyValue(
        (linkedPurchasesByAssetId.get(transaction.related_entity_id) ?? 0)
        + linkedExpenseContributionDelta(transaction),
      ),
    );
  }

  return [
    ...input.accounts.flatMap((account): CategoryActivityRow[] => {
      const categoryId = accountCategoryId(account, input.categoryIdByName);
      if (!categoryId) return [];
      return [{
        amount: accountCurrentValue(
          account,
          accountActivities.get(account.id),
          creditCardOpenings.get(account.id) ?? 0,
        ),
        category_id: categoryId,
        date: account.created_at,
      }];
    }),
    ...input.assets.flatMap((asset): CategoryActivityRow[] => {
      const metadata = metadataRecord(asset.metadata);
      const categoryId = metadataCategoryId(asset.category_id, metadata);
      if (!categoryId) return [];
      return [{
        amount: resolveAssetPurchaseValue(
          asset.purchase_amount,
          metadata.purchase_amount,
          linkedPurchasesByAssetId.get(asset.id),
        ),
        category_id: categoryId,
        date: asset.purchase_date ?? asset.created_at,
      }];
    }),
    ...input.debts.flatMap((debt): CategoryActivityRow[] => {
      const metadata = metadataRecord(debt.metadata);
      const categoryId = metadataCategoryId(debt.category_id, metadata);
      if (!categoryId) return [];
      return [{
        amount: roundCurrencyValue(
          storedNumber(debt.total_amount, metadata.total_amount)
          + (debtLedgers.get(debt.id)?.charges ?? 0),
        ),
        category_id: categoryId,
        date: debt.start_date ?? debt.created_at,
      }];
    }),
    ...input.savingsGoals.flatMap((goal): CategoryActivityRow[] => {
      const metadata = metadataRecord(goal.metadata);
      const categoryId = metadataCategoryId(goal.category_id, metadata);
      if (!categoryId) return [];
      return [{
        amount: numericValue(goal.target_amount) || numericValue(metadata.target_amount),
        category_id: categoryId,
        date: goal.target_date ?? goal.created_at,
      }];
    }),
    ...input.subscriptions.flatMap((subscription): CategoryActivityRow[] => {
      const metadata = metadataRecord(subscription.metadata);
      const status = normalizeSubscriptionStatus(subscription.status ?? metadata.status);
      if (!isOngoingSubscriptionStatus(status)) return [];
      const categoryId = metadataCategoryId(subscription.category_id, metadata);
      if (!categoryId) return [];
      const amount = numericValue(subscription.amount) || numericValue(metadata.amount);
      const billingCycle = subscription.billing_cycle
        ?? (typeof metadata.billing_cycle === "string" ? metadata.billing_cycle : "monthly");
      return [{
        amount: monthlySubscriptionCost(amount, billingCycle),
        category_id: categoryId,
        date: subscription.next_billing_date ?? subscription.created_at,
      }];
    }),
  ];
}

export function buildCategoryActivity(rows: CategoryActivityRow[]) {
  const monthlyTotalsByCategory = new Map<string, Map<string, number>>();
  const transactionCounts = new Map<string, number>();

  for (const row of rows) {
    if (!row.category_id || !row.date) continue;

    const categoryMonths = monthlyTotalsByCategory.get(row.category_id) ?? new Map<string, number>();
    const month = row.date.slice(0, 7);
    categoryMonths.set(month, roundCurrencyValue((categoryMonths.get(month) ?? 0) + numericValue(row.amount)));
    monthlyTotalsByCategory.set(row.category_id, categoryMonths);
    transactionCounts.set(row.category_id, (transactionCounts.get(row.category_id) ?? 0) + 1);
  }

  const activityByCategory = new Map<string, CategoryActivity>();
  for (const [categoryId, monthlyTotals] of monthlyTotalsByCategory) {
    const total = roundCurrencyValue(Array.from(monthlyTotals.values()).reduce((sum, value) => sum + value, 0));
    const monthOrdinals = [...monthlyTotals.keys()].map((month) => {
      const [year, monthNumber] = month.split("-").map(Number);
      return (year * 12) + monthNumber - 1;
    });
    const monthSpan = monthOrdinals.length === 0 ? 0 : Math.max(...monthOrdinals) - Math.min(...monthOrdinals) + 1;
    activityByCategory.set(categoryId, {
      monthlyAverage: monthSpan === 0 ? 0 : total / monthSpan,
      total,
      transactionCount: transactionCounts.get(categoryId) ?? 0,
    });
  }

  return activityByCategory;
}
