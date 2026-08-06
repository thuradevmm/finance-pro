import type { SupabaseClient } from "@supabase/supabase-js";

import { getAccounts, type AccountRecord } from "@/lib/accounts/supabase";
import { getCategories, type CategoryRecord } from "@/lib/categories/supabase";
import { formatMmk } from "@/lib/currency";
import { categoryMonthlyAverages, planningDirectionForCategoryType, type CategoryActual } from "@/lib/future-planning/category-controls";
import { normalizePlanningYears, resolvePercentagePlanningAmounts, type FuturePlanningAmount, type FuturePlanningColumn, type FuturePlanningColumnDirection } from "@/lib/future-planning/manual-table";
import { futureLinkAmountSnapshot, futurePredictedAmount, type FutureTransactionRecord } from "@/lib/future-planning/records";
import { economicTransactionDelta } from "@/lib/ledger";
import { getSavingsGoals } from "@/lib/savings-goals/supabase";
import { savingsTransactionDelta } from "@/lib/savings-goals/calculations";
import { isMissingDatabaseObject, jsonSettingsSection } from "@/lib/supabase/schema-compat";
import { getTransaction, getTransactions, type TransactionRecord } from "@/lib/transactions/supabase";
import { transactionStatusIsFinalized } from "@/lib/transactions/status";
import type { CategoryType } from "@/types/finance";

export type ManualFuturePlanningData = {
  amounts: FuturePlanningAmount[];
  categories: CategoryRecord[];
  columns: FuturePlanningColumn[];
  plannedTransactions: FutureTransactionRecord[];
  selectedYears: number[];
};

export type FuturePlanningTransactionOption = {
  amount: number;
  categoryId: string;
  direction: FuturePlanningColumnDirection;
  id: string;
  label: string;
  periodMonth: string;
};

function planningColumnDirection(value: string): FuturePlanningColumnDirection {
  if (value === "income" || value === "neutral" || value === "saving") return value;
  return "expense";
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

function categoryType(category: CategoryRecord | undefined): CategoryType {
  return category?.type ?? "Expense";
}

function transactionActual(
  transaction: TransactionRecord,
  savingsGoalCategoryById: Map<string, string>,
  savingsGoalAccountById: Map<string, string>,
): CategoryActual | null {
  if (!transactionStatusIsFinalized(transaction.status)) return null;
  const savingsCategoryId = transaction.relatedEntityType === "savings_goal"
    ? savingsGoalCategoryById.get(transaction.relatedEntityId) ?? ""
    : "";
  const categoryId = savingsCategoryId || transaction.categoryId;
  if (!categoryId) return null;
  const amount = savingsCategoryId
    ? savingsTransactionDelta({
      account_id: transaction.accountId,
      amount: transaction.amountValue,
      id: transaction.id,
      metadata: transaction.ledgerMetadata,
      related_entity_id: transaction.relatedEntityId,
      related_entity_type: transaction.relatedEntityType,
      status: transaction.status,
      transfer_account_id: transaction.transferAccountId,
      type: transaction.type,
    }, savingsGoalAccountById.get(transaction.relatedEntityId) ?? "")
    : (() => {
      const delta = economicTransactionDelta({
        amount: transaction.amountValue,
        metadata: transaction.ledgerMetadata,
        related_entity_id: transaction.relatedEntityId || null,
        related_entity_type: transaction.relatedEntityType || null,
        status: transaction.status,
        type: transaction.type,
      });
      return delta.incomeDelta + delta.expenseDelta;
    })();
  if (amount === 0) return null;
  return { amount, categoryId, dateValue: transaction.dateValue };
}

export async function getManualFuturePlanningData(
  supabase: SupabaseClient,
  userId: string,
  today: string,
): Promise<ManualFuturePlanningData> {
  const [accounts, categories, settingsResult, columnsResult, amountsResult, userSettingsResult] = await Promise.all([
    getAccounts(supabase, userId),
    getCategories(),
    supabase.from("future_planning_settings").select("selected_years").eq("user_id", userId).maybeSingle(),
    supabase
      .from("future_planning_columns")
      .select("id,name,direction,category_id,sort_order")
      .eq("user_id", userId)
      .eq("is_active", true)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true }),
    supabase.from("future_planning_amounts").select("id,column_id,period_month,amount,amount_type,percentage").eq("user_id", userId),
    supabase.from("user_settings").select("settings").eq("user_id", userId).maybeSingle(),
  ]);
  const settingsTableMissing = isMissingDatabaseObject(settingsResult.error, ["future_planning_settings"]);
  if (settingsResult.error && !settingsTableMissing) throw new Error(settingsResult.error.message);
  const columnsTableMissing = isMissingDatabaseObject(columnsResult.error, ["future_planning_columns", "category_id"]);
  if (columnsResult.error && !columnsTableMissing) throw new Error(columnsResult.error.message);
  const amountsTableMissing = isMissingDatabaseObject(amountsResult.error, ["future_planning_amounts"]);
  if (amountsResult.error && !amountsTableMissing) throw new Error(amountsResult.error.message);

  const [transactions, savingsGoals] = await Promise.all([
    getTransactions(supabase, userId, accounts, categories),
    getSavingsGoals(supabase, userId, accounts, categories),
  ]);
  const savingsGoalCategoryById = new Map(savingsGoals.map((goal) => [goal.id, goal.categoryId]));
  const savingsGoalAccountById = new Map(savingsGoals.map((goal) => [goal.id, goal.accountId]));
  const actuals = transactions.flatMap((transaction) => {
    const actual = transactionActual(transaction, savingsGoalCategoryById, savingsGoalAccountById);
    return actual ? [actual] : [];
  });
  const actualByCategoryMonth = new Map<string, number>();
  for (const actual of actuals) {
    const key = `${actual.categoryId}:${actual.dateValue.slice(0, 7)}`;
    actualByCategoryMonth.set(key, (actualByCategoryMonth.get(key) ?? 0) + actual.amount);
  }
  const averages = categoryMonthlyAverages(actuals, today);
  const categoriesById = new Map(categories.map((category) => [category.id, category]));
  const linkedGoalsByCategoryId = new Map<string, FuturePlanningColumn["linkedSavingsGoals"]>();
  for (const goal of savingsGoals) {
    if (!goal.categoryId) continue;
    linkedGoalsByCategoryId.set(goal.categoryId, [
      ...(linkedGoalsByCategoryId.get(goal.categoryId) ?? []),
      {
        contributionPercentage: goal.contributionPercentage,
        contributionType: goal.contributionType,
        id: goal.id,
        monthlyContribution: goal.monthlyContributionValue,
        name: goal.name,
        targetDate: goal.targetDateValue,
      },
    ]);
  }
  const columns: FuturePlanningColumn[] = (columnsTableMissing ? [] : columnsResult.data ?? []).flatMap((column) => {
    const category = categoriesById.get(column.category_id);
    if (!category) return [];
    return [{
      categoryId: category.id,
      categoryType: categoryType(category),
      direction: planningDirectionForCategoryType(category.type),
      id: column.id,
      linkedSavingsGoals: linkedGoalsByCategoryId.get(category.id) ?? [],
      monthlyAverage: averages.get(category.id) ?? 0,
      name: category.name,
      sortOrder: column.sort_order,
    }];
  });
  const plannedTransactions = transactions.flatMap((transaction) => {
    const plan = asFutureTransaction(transaction);
    return plan ? [plan] : [];
  }).sort((first, second) => first.dateValue.localeCompare(second.dateValue));
  const currentYear = Number(today.slice(0, 4));
  const fallbackSettings = jsonSettingsSection(userSettingsResult.data?.settings, "future_planning");
  const directYears = normalizePlanningYears(settingsResult.data?.selected_years ?? []);
  if (userSettingsResult.error && directYears.length === 0) throw new Error(userSettingsResult.error.message);
  const fallbackYears = normalizePlanningYears(Array.isArray(fallbackSettings.selected_years) ? fallbackSettings.selected_years : []);
  const savedYears = directYears.length > 0 ? directYears : fallbackYears;
  const selectedYears = savedYears.length > 0 ? savedYears : normalizePlanningYears([currentYear], currentYear);
  const storedAmountsByColumnMonth = new Map((amountsTableMissing ? [] : amountsResult.data ?? []).map((amount) => [
    `${amount.column_id}:${amount.period_month.slice(0, 7)}`,
    amount,
  ]));
  const rawAmounts: FuturePlanningAmount[] = columns.flatMap((column) => selectedYears.flatMap((year) => (
    Array.from({ length: 12 }, (_, monthIndex) => {
      const monthKey = `${year}-${String(monthIndex + 1).padStart(2, "0")}`;
      const stored = storedAmountsByColumnMonth.get(`${column.id}:${monthKey}`);
      return {
        actualAmount: actualByCategoryMonth.get(`${column.categoryId}:${monthKey}`) ?? 0,
        amount: Number(stored?.amount) || 0,
        amountType: stored?.amount_type === "percentage" ? "Percentage" : "Fixed",
        columnId: column.id,
        id: stored?.id ?? `category:${column.categoryId}:${monthKey}`,
        percentage: Number(stored?.percentage) || 0,
        periodMonth: stored?.period_month ?? `${monthKey}-01`,
      };
    })
  )));
  const amounts = resolvePercentagePlanningAmounts(rawAmounts, columns);

  return { amounts, categories, columns, plannedTransactions, selectedYears };
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
    supabase.from("future_planning_columns").select("id,name,direction,category_id,is_active").eq("user_id", userId),
    supabase.from("future_planning_amounts").select("id,column_id,period_month,amount,amount_type,percentage").eq("user_id", userId).order("period_month", { ascending: true }),
  ]);
  if (isMissingDatabaseObject(amountsResult.error, ["future_planning_amounts"])) return [];
  if (columnsResult.error) throw new Error(columnsResult.error.message);
  if (amountsResult.error) throw new Error(amountsResult.error.message);
  const columnRows = columnsResult.data ?? [];
  const columns = new Map(columnRows.map((column) => [column.id, column]));
  const resolvedAmounts = resolvePercentagePlanningAmounts((amountsResult.data ?? []).map((amount) => ({
    actualAmount: 0,
    amount: Number(amount.amount) || 0,
    amountType: amount.amount_type === "percentage" ? "Percentage" as const : "Fixed" as const,
    columnId: amount.column_id,
    id: amount.id,
    percentage: Number(amount.percentage) || 0,
    periodMonth: amount.period_month,
  })), columnRows.map((column) => ({ direction: planningColumnDirection(column.direction), id: column.id })));
  return resolvedAmounts.flatMap((amount) => {
    const column = columns.get(amount.columnId);
    const amountValue = amount.amount;
    if (!column || ((!column.is_active || amountValue <= 0) && amount.id !== preservedAmountId)) return [];
    const periodLabel = new Intl.DateTimeFormat("en", { month: "short", year: "numeric", timeZone: "UTC" })
      .format(new Date(`${amount.periodMonth}T00:00:00Z`));
    return [{
      amount: amountValue,
      categoryId: column.category_id,
      direction: planningColumnDirection(column.direction),
      id: amount.id,
      label: `${column.name} · ${periodLabel} · ${formatMmk(amountValue)}`,
      periodMonth: amount.periodMonth,
    }];
  });
}
