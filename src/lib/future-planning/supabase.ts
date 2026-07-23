import type { SupabaseClient } from "@supabase/supabase-js";

import { accountStatusContributesToCurrentTotals } from "@/lib/accounts/financial-status";
import { getAccounts, type AccountRecord } from "@/lib/accounts/supabase";
import { getBudgets, type BudgetRecord } from "@/lib/budgets/supabase";
import { getCategories, type CategoryRecord } from "@/lib/categories/supabase";
import { formatMmk } from "@/lib/currency";
import { getDebts, getUpcomingDebtPayments } from "@/lib/debts/supabase";
import { calculateOpeningCashPosition } from "@/lib/future-planning/opening-position";
import { normalizePlanningYears, type FuturePlanningAmount, type FuturePlanningColumn, type FuturePlanningColumnDirection } from "@/lib/future-planning/manual-table";
import type { ForecastItem, HistoricalActualItem } from "@/lib/future-planning/projection";
import { futureLinkAmountSnapshot, futurePredictedAmount, type FutureTransactionRecord } from "@/lib/future-planning/records";
import { economicTransactionDelta } from "@/lib/ledger";
import { getSavingsGoals } from "@/lib/savings-goals/supabase";
import { getSubscriptions } from "@/lib/subscriptions/supabase";
import {
  isMissingDatabaseObject,
  jsonSettingsSection,
} from "@/lib/supabase/schema-compat";
import { getTransaction, getTransactions, type TransactionRecord } from "@/lib/transactions/supabase";
import { transactionStatusIsFinalized } from "@/lib/transactions/status";

export type FuturePlanningSourceCounts = {
  debtPayments: number;
  plannedTransactions: number;
  savingsGoals: number;
  subscriptions: number;
};

export type FuturePlanningData = {
  budgets: BudgetRecord[];
  forecastItems: ForecastItem[];
  historicalActuals: HistoricalActualItem[];
  openingBalance: number;
  openingCardCredits: Record<string, number>;
  openingSavings: number;
  plannedTransactions: FutureTransactionRecord[];
  sourceCounts: FuturePlanningSourceCounts;
};

export type ManualFuturePlanningData = {
  amounts: FuturePlanningAmount[];
  categories: CategoryRecord[];
  columns: FuturePlanningColumn[];
  plannedTransactions: FutureTransactionRecord[];
  selectedYears: number[];
};

export type FuturePlanningTransactionOption = {
  amount: number;
  direction: FuturePlanningColumnDirection;
  id: string;
  label: string;
  periodMonth: string;
};

function planningColumnDirection(value: string): FuturePlanningColumnDirection {
  if (value === "income" || value === "neutral" || value === "saving") return value;
  return "expense";
}

function clampedDate(value: string, today: string) {
  return value && value > today ? value : today;
}

function monthDayCount(year: number, monthIndex: number) {
  return new Date(year, monthIndex + 1, 0).getDate();
}

function addAnchoredMonths(value: string, monthCount: number) {
  const [year, month, day] = value.split("-").map(Number);
  const target = new Date(year, month - 1 + monthCount, 1);
  target.setDate(Math.min(day, monthDayCount(target.getFullYear(), target.getMonth())));
  return `${target.getFullYear()}-${String(target.getMonth() + 1).padStart(2, "0")}-${String(target.getDate()).padStart(2, "0")}`;
}

function asFutureTransaction(transaction: TransactionRecord): FutureTransactionRecord | null {
  if (transaction.status.toLowerCase() !== "scheduled" || (transaction.type !== "Expense" && transaction.type !== "Income")) return null;
  const amountValue = futurePredictedAmount(transaction.amountValue, transaction.ledgerMetadata);
  return {
    account: transaction.account,
    accountAmountType: transaction.accountAmountType,
    accountId: transaction.accountId,
    amountValue,
    category: transaction.category,
    categoryId: transaction.categoryId,
    date: transaction.date,
    dateValue: transaction.dateValue,
    endDate: transaction.futurePlan?.endDate ?? "",
    id: transaction.id,
    note: transaction.note,
    recurrence: transaction.futurePlan?.recurrence ?? "Once",
    relatedEntityAmountSnapshot: transaction.relatedEntityType === "none"
      ? null
      : futureLinkAmountSnapshot(transaction.ledgerMetadata, amountValue),
    relatedEntityId: transaction.relatedEntityId,
    relatedEntityLabel: typeof transaction.ledgerMetadata.future_link_label === "string"
      ? transaction.ledgerMetadata.future_link_label
      : "",
    relatedEntityType: transaction.relatedEntityType,
    status: transaction.futurePlan?.status ?? "Active",
    title: transaction.title,
    type: transaction.type,
  };
}

function savingsForecastItems(
  goals: Awaited<ReturnType<typeof getSavingsGoals>>,
  today: string,
): ForecastItem[] {
  return goals.flatMap((goal) => {
    if (goal.status === "Completed" || goal.monthlyContributionValue <= 0) return [];
    let remaining = Math.max(goal.targetAmountValue - goal.savedAmountValue, 0);
    if (remaining <= 0) return [];

    const items: ForecastItem[] = [];
    const futureTarget = goal.targetDateValue >= today ? goal.targetDateValue : "";
    for (let index = 0; index < 60 && remaining > 0; index += 1) {
      const date = addAnchoredMonths(today, index);
      if (futureTarget && date > futureTarget) break;
      const amount = Math.min(goal.monthlyContributionValue, remaining);
      items.push({
        active: true,
        amount,
        category: "Savings",
        endDate: date,
        entityId: goal.id,
        entityType: "savings_goal",
        id: `savings:${goal.id}:${date}`,
        kind: "saving",
        label: goal.name,
        recurrence: "Once",
        source: "Savings Goal",
        startDate: date,
      });
      remaining -= amount;
    }
    return items;
  });
}

function openingCashPosition(
  accounts: AccountRecord[],
  goals: Awaited<ReturnType<typeof getSavingsGoals>>,
) {
  const activeAccounts = accounts.filter((account) => accountStatusContributesToCurrentTotals(account.status));
  return calculateOpeningCashPosition(
    activeAccounts.map((account) => ({
      balanceValues: account.balanceBreakdowns.map((breakdown) => breakdown.amountValue),
      id: account.id,
      type: account.type,
    })),
    goals.map((goal) => ({ accountId: goal.accountId, savedAmount: goal.cashReserveAmountValue })),
  );
}

export async function getFuturePlanningData(
  supabase: SupabaseClient,
  userId: string,
  today: string,
): Promise<FuturePlanningData> {
  const [accounts, categories] = await Promise.all([
    getAccounts(supabase, userId),
    getCategories(),
  ]);
  const [transactions, subscriptions, debts, savingsGoals, budgets] = await Promise.all([
    getTransactions(supabase, userId, accounts, categories),
    getSubscriptions(supabase, userId, accounts, categories),
    getDebts(supabase, userId, categories),
    getSavingsGoals(supabase, userId, accounts, categories),
    getBudgets(supabase, userId, { limit: 500 }),
  ]);

  const plannedTransactions = transactions.flatMap((transaction) => {
    const plan = asFutureTransaction(transaction);
    return plan ? [plan] : [];
  });
  const debtPayments = getUpcomingDebtPayments(debts);

  const accountsById = new Map(accounts.map((account) => [account.id, account]));
  const scheduledItems: ForecastItem[] = plannedTransactions.map((transaction) => {
    const account = accountsById.get(transaction.accountId);
    const isCardCharge = account?.type === "Credit Card" && transaction.type === "Expense";
    return {
      active: transaction.status === "Active",
      amount: transaction.amountValue,
      ...(isCardCharge ? {
        cashTiming: {
          accountId: account.id,
          kind: "credit_card_settlement" as const,
          paymentDueDay: account.creditPaymentDueDay,
          statementDay: account.creditStatementDay,
        },
      } : {}),
      category: transaction.category,
      endDate: transaction.endDate || null,
      entityId: transaction.relatedEntityId || null,
      entityType: transaction.relatedEntityType === "none" ? null : transaction.relatedEntityType,
      id: transaction.id,
      kind: transaction.type === "Income" ? "income" as const : "expense" as const,
      label: isCardCharge ? `${transaction.title} (card settlement)` : transaction.title,
      recurrence: transaction.recurrence,
      source: "Scheduled" as const,
      startDate: transaction.recurrence === "Once" ? clampedDate(transaction.dateValue, today) : transaction.dateValue,
    };
  });

  const subscriptionItems: ForecastItem[] = subscriptions.flatMap((subscription) => {
    if (subscription.status === "Paused" || !subscription.nextBillingDateValue || subscription.amountValue <= 0) return [];
    const overdue = subscription.nextBillingDateValue < today;
    const billingAnchor = subscription.nextBillingDateValue;
    const recurringItem: ForecastItem = {
      active: true,
      amount: subscription.amountValue,
      ...(accountsById.get(subscription.accountId)?.type === "Credit Card" ? {
        cashTiming: {
          accountId: subscription.accountId,
          kind: "credit_card_settlement" as const,
          paymentDueDay: accountsById.get(subscription.accountId)?.creditPaymentDueDay ?? null,
          statementDay: accountsById.get(subscription.accountId)?.creditStatementDay ?? null,
        },
      } : {}),
      category: subscription.category,
      entityId: subscription.id,
      entityType: "subscription",
      id: `subscription:${subscription.id}`,
      kind: "expense" as const,
      label: subscription.name,
      recurrence: subscription.billingCycle,
      source: "Subscription" as const,
      startDate: billingAnchor,
    };
    if (!overdue) return [recurringItem];
    return [{
      ...recurringItem,
      endDate: today,
      id: `subscription:${subscription.id}:overdue`,
      label: `${subscription.name} (overdue)`,
      recurrence: "Once" as const,
      startDate: today,
    }, recurringItem];
  });

  const debtItems: ForecastItem[] = debtPayments.map((payment) => ({
    active: true,
    amount: payment.amountValue,
    category: payment.category,
    endDate: clampedDate(payment.dueDateValue, today),
    entityId: payment.debtId,
    entityType: "debt",
    id: `debt:${payment.id}`,
    kind: "expense",
    label: payment.debtName,
    recurrence: "Once",
    source: "Debt",
    startDate: clampedDate(payment.dueDateValue, today),
  }));

  const historicalActuals: HistoricalActualItem[] = transactions.flatMap((transaction) => {
    if (!transactionStatusIsFinalized(transaction.status) || transaction.type === "Transfer") return [];
    if (["savings_goal", "subscription"].includes(transaction.relatedEntityType)) return [];
    if (transaction.relatedEntityType === "debt" && transaction.creditCardDebtImpact !== "charge") return [];
    const delta = economicTransactionDelta({
      amount: transaction.amountValue,
      metadata: transaction.ledgerMetadata,
      status: transaction.status,
      type: transaction.type,
    });
    return [
      ...(delta.incomeDelta !== 0 ? [{
        amount: delta.incomeDelta,
        category: transaction.category,
        date: transaction.dateValue,
        id: `${transaction.id}:income`,
        kind: "income" as const,
      }] : []),
      ...(delta.expenseDelta !== 0 ? [{
        amount: delta.expenseDelta,
        category: transaction.category,
        date: transaction.dateValue,
        id: `${transaction.id}:expense`,
        kind: "expense" as const,
      }] : []),
    ];
  });

  const position = openingCashPosition(accounts, savingsGoals);
  const openingCardCredits = Object.fromEntries(
    accounts
      .filter((account) => accountStatusContributesToCurrentTotals(account.status) && account.type === "Credit Card" && account.creditBalanceValue > 0)
      .map((account) => [account.id, account.creditBalanceValue]),
  );
  return {
    budgets,
    forecastItems: [
      ...scheduledItems,
      ...subscriptionItems,
      ...debtItems,
      ...savingsForecastItems(savingsGoals, today),
    ],
    historicalActuals,
    openingBalance: position.spendableCash,
    openingCardCredits,
    openingSavings: savingsGoals.reduce((total, goal) => total + goal.savedAmountValue, 0),
    plannedTransactions: plannedTransactions.sort((first, second) => first.dateValue.localeCompare(second.dateValue)),
    sourceCounts: {
      debtPayments: debtPayments.length,
      plannedTransactions: plannedTransactions.length,
      savingsGoals: savingsGoals.filter((goal) => goal.status !== "Completed" && goal.monthlyContributionValue > 0).length,
      subscriptions: subscriptions.filter((subscription) => subscription.status !== "Paused" && Boolean(subscription.nextBillingDateValue)).length,
    },
  };
}

export async function getManualFuturePlanningData(
  supabase: SupabaseClient,
  userId: string,
  today: string,
): Promise<ManualFuturePlanningData> {
  const [accounts, categories, settingsResult, columnsResult, amountsResult, userSettingsResult] = await Promise.all([
    getAccounts(supabase, userId),
    getCategories(),
    supabase
      .from("future_planning_settings")
      .select("selected_years")
      .eq("user_id", userId)
      .maybeSingle(),
    supabase
      .from("future_planning_columns")
      .select("id,name,direction,sort_order")
      .eq("user_id", userId)
      .eq("is_active", true)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true }),
    supabase
      .from("future_planning_amounts")
      .select("id,column_id,period_month,amount")
      .eq("user_id", userId),
    supabase
      .from("user_settings")
      .select("settings")
      .eq("user_id", userId)
      .maybeSingle(),
  ]);
  const settingsTableMissing = isMissingDatabaseObject(settingsResult.error, ["future_planning_settings"]);
  if (settingsResult.error && !settingsTableMissing) throw new Error(settingsResult.error.message);
  const columnsTableMissing = isMissingDatabaseObject(columnsResult.error, ["future_planning_columns"]);
  if (columnsResult.error && !columnsTableMissing) throw new Error(columnsResult.error.message);
  const amountsTableMissing = isMissingDatabaseObject(amountsResult.error, ["future_planning_amounts"]);
  if (amountsResult.error && !amountsTableMissing) throw new Error(amountsResult.error.message);

  const transactions = await getTransactions(supabase, userId, accounts, categories);
  const actualsByAmountId = new Map<string, number>();
  for (const transaction of transactions) {
    if (!transactionStatusIsFinalized(transaction.status) || transaction.type === "Transfer") continue;
    const amountId = typeof transaction.ledgerMetadata.future_planning_amount_id === "string"
      ? transaction.ledgerMetadata.future_planning_amount_id
      : "";
    if (!amountId) continue;
    const delta = economicTransactionDelta({
      amount: transaction.amountValue,
      metadata: transaction.ledgerMetadata,
      status: transaction.status,
      type: transaction.type,
    });
    const actualAmount = delta.incomeDelta + delta.expenseDelta;
    actualsByAmountId.set(amountId, (actualsByAmountId.get(amountId) ?? 0) + actualAmount);
  }
  const plannedTransactions = transactions
    .flatMap((transaction) => {
      const plan = asFutureTransaction(transaction);
      return plan ? [plan] : [];
    })
    .sort((first, second) => first.dateValue.localeCompare(second.dateValue));
  const currentYear = Number(today.slice(0, 4));
  const fallbackSettings = jsonSettingsSection(userSettingsResult.data?.settings, "future_planning");
  const directYears = normalizePlanningYears(settingsResult.data?.selected_years ?? []);
  if (userSettingsResult.error && directYears.length === 0) throw new Error(userSettingsResult.error.message);
  const fallbackYears = normalizePlanningYears(
    Array.isArray(fallbackSettings.selected_years) ? fallbackSettings.selected_years : [],
  );
  const savedYears = directYears.length > 0 ? directYears : fallbackYears;
  const selectedYears = savedYears.length > 0
    ? savedYears
    : normalizePlanningYears([
      currentYear,
      ...plannedTransactions.map((plan) => Number(plan.dateValue.slice(0, 4))),
    ], currentYear);

  return {
    amounts: (amountsTableMissing ? [] : amountsResult.data ?? []).map((amount) => ({
      actualAmount: actualsByAmountId.get(amount.id) ?? 0,
      amount: Number(amount.amount) || 0,
      columnId: amount.column_id,
      id: amount.id,
      periodMonth: amount.period_month,
    })),
    categories,
    columns: (columnsTableMissing ? [] : columnsResult.data ?? []).map((column) => ({
      direction: planningColumnDirection(column.direction),
      id: column.id,
      name: column.name,
      sortOrder: column.sort_order,
    })),
    plannedTransactions,
    selectedYears,
  };
}

export async function getFutureTransaction(
  supabase: SupabaseClient,
  userId: string,
  transactionId: string,
  accounts: AccountRecord[],
  categories: CategoryRecord[],
) {
  const transaction = await getTransaction(supabase, userId, transactionId, accounts, categories);
  return transaction ? asFutureTransaction(transaction) : null;
}

export async function getFuturePlanningTransactionOptions(
  supabase: SupabaseClient,
  userId: string,
  preservedAmountId = "",
): Promise<FuturePlanningTransactionOption[]> {
  const [columnsResult, amountsResult] = await Promise.all([
    supabase
      .from("future_planning_columns")
      .select("id,name,direction,is_active")
      .eq("user_id", userId),
    supabase
      .from("future_planning_amounts")
      .select("id,column_id,period_month,amount")
      .eq("user_id", userId)
      .order("period_month", { ascending: true }),
  ]);
  if (isMissingDatabaseObject(amountsResult.error, ["future_planning_amounts"])) return [];
  if (columnsResult.error) throw new Error(columnsResult.error.message);
  if (amountsResult.error) throw new Error(amountsResult.error.message);
  const columns = new Map((columnsResult.data ?? []).map((column) => [column.id, column]));
  return (amountsResult.data ?? []).flatMap((amount) => {
    const column = columns.get(amount.column_id);
    const amountValue = Number(amount.amount) || 0;
    if (!column || ((!column.is_active || amountValue <= 0) && amount.id !== preservedAmountId)) return [];
    const periodLabel = new Intl.DateTimeFormat("en", { month: "short", year: "numeric", timeZone: "UTC" })
      .format(new Date(`${amount.period_month}T00:00:00Z`));
    return [{
      amount: amountValue,
      direction: planningColumnDirection(column.direction),
      id: amount.id,
      label: `${column.name} · ${periodLabel} · ${formatMmk(amountValue)}`,
      periodMonth: amount.period_month,
    }];
  });
}
