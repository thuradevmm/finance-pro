import type { SupabaseClient } from "@supabase/supabase-js";

import type { IconName } from "@/components/ui/icon";
import { formatMmk } from "@/lib/currency";
import { combineDateWithTimestampTime, dateTimeSortValue } from "@/lib/date-format";
import type { AccountRecord } from "@/lib/accounts/supabase";
import type { CategoryRecord } from "@/lib/categories/supabase";
import { roundCurrencyValue } from "@/lib/ledger";
import {
  calculateLinkedSavingsAmounts,
  resolveStoredSavingsAmount,
  type SavingsGoalEntryInput,
} from "@/lib/savings-goals/calculations";
import type { SavingsGoal, SavingsGoalStatus, SummaryMetric } from "@/types/finance";

export type SavingsGoalRecord = SavingsGoal & {
  accountId: string;
  cashReserveAmountValue: number;
  categoryId: string;
  createdAtValue: string;
  description: string;
  linkedSavedAmountValue: number;
  monthlyContributionValue: number;
  savedAmountValue: number;
  storedSavedAmountValue: number;
  targetAmountValue: number;
  targetDateValue: string;
};

export type SavingsGoalFormData = {
  accountId: string;
  categoryId: string;
  description: string;
  monthlyContribution: number;
  name: string;
  savedAmount: number;
  targetAmount: number;
  targetDate: string;
};

type SavingsGoalRow = {
  account_id?: string | null;
  category_id?: string | null;
  created_at?: string | null;
  current_amount?: number | string | null;
  description?: string | null;
  id: string;
  initial_saved_amount?: number | string | null;
  metadata?: unknown;
  monthly_contribution?: number | string | null;
  name: string;
  saved_amount?: number | string | null;
  status?: string | null;
  target_amount?: number | string | null;
  target_date?: string | null;
};

type LinkedTransactionRow = {
  account_id: string | null;
  amount: number | string | null;
  id: string;
  metadata: unknown;
  related_entity_id: string | null;
  status: string | null;
  transfer_account_id: string | null;
  type: string | null;
};

const fallbackAppearance: Pick<SavingsGoal, "bg" | "icon" | "tone"> = {
  bg: "bg-[#eff6ff]",
  icon: "target",
  tone: "text-[#0058be]",
};

const iconNames = new Set<IconName>(["account", "box", "credit", "home", "savings", "target", "travel"]);

function metadataRecord(metadata: unknown) {
  return metadata && typeof metadata === "object" && !Array.isArray(metadata)
    ? metadata as Record<string, unknown>
    : {};
}

function numericValue(value: unknown, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function formatDate(value: string) {
  if (!value) return "Not set";
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-US", { month: "short", year: "numeric" }).format(date);
}

function deriveStatus(rowStatus: string | null | undefined, progressPercent: number, targetDate: string): SavingsGoalStatus {
  const normalizedStatus = rowStatus?.toLowerCase();
  // Progress is authoritative. A linked contribution can complete a goal and
  // a later reversal can reopen it even when the stored status is stale.
  if (progressPercent >= 100) return "Completed";
  if (normalizedStatus === "behind") return "Behind";
  if (targetDate) {
    const targetTime = new Date(`${targetDate}T23:59:59`).getTime();
    if (!Number.isNaN(targetTime) && targetTime < Date.now()) return "Behind";
  }
  // Without contribution timing evidence, do not claim the goal is on pace.
  // "In Progress" is the conservative health label until completion or a
  // missed target date provides an objective behind-schedule signal.
  return "In Progress";
}

function mapGoal(
  row: SavingsGoalRow,
  accountsById: Map<string, AccountRecord>,
  categoriesById: Map<string, CategoryRecord>,
  linkedSavingsByGoalId: Map<string, number>,
  reserveSavingsByGoalId: Map<string, number>,
): SavingsGoalRecord {
  const metadata = metadataRecord(row.metadata);
  const accountId = row.account_id ?? (typeof metadata.account_id === "string" ? metadata.account_id : "");
  const categoryId = row.category_id ?? (typeof metadata.category_id === "string" ? metadata.category_id : "");
  const account = accountId ? accountsById.get(accountId) : undefined;
  const category = categoryId ? categoriesById.get(categoryId) : undefined;
  const targetAmountValue = numericValue(row.target_amount) || numericValue(metadata.target_amount);
  const storedSavedAmountValue = resolveStoredSavingsAmount({
    currentAmount: row.current_amount,
    initialSavedAmount: row.initial_saved_amount,
    metadataCurrentAmount: metadata.current_amount,
    metadataSavedAmount: metadata.saved_amount,
    savedAmount: row.saved_amount,
  });
  const linkedSavedAmountValue = linkedSavingsByGoalId.get(row.id) ?? 0;
  const savedAmountValue = Math.max(0, roundCurrencyValue(storedSavedAmountValue + linkedSavedAmountValue));
  const cashReserveAmountValue = Math.min(
    savedAmountValue,
    Math.max(0, roundCurrencyValue(storedSavedAmountValue + (reserveSavingsByGoalId.get(row.id) ?? 0))),
  );
  const monthlyContributionValue = row.monthly_contribution !== null
    && row.monthly_contribution !== undefined
    && Number.isFinite(Number(row.monthly_contribution))
    ? numericValue(row.monthly_contribution)
    : numericValue(metadata.monthly_contribution);
  const remainingAmountValue = Math.max(targetAmountValue - savedAmountValue, 0);
  const progressPercent = targetAmountValue > 0 ? Math.min(Math.round((savedAmountValue / targetAmountValue) * 100), 100) : 0;
  const targetDateValue = row.target_date ?? (typeof metadata.target_date === "string" ? metadata.target_date : "");
  const appearance = category
    ? { bg: category.bg, icon: category.icon, tone: category.tone }
    : {
      ...fallbackAppearance,
      icon: typeof metadata.icon === "string" && iconNames.has(metadata.icon as IconName) ? metadata.icon as IconName : fallbackAppearance.icon,
    };

  return {
    ...appearance,
    account: account?.name ?? (typeof metadata.account_name === "string" ? metadata.account_name : "No account selected"),
    accountId,
    cashReserveAmountValue,
    categoryId,
    createdAtValue: row.created_at ?? "",
    description: row.description ?? (typeof metadata.description === "string" ? metadata.description : ""),
    id: row.id,
    linkedSavedAmountValue,
    monthlyContribution: formatMmk(monthlyContributionValue),
    monthlyContributionValue,
    name: row.name,
    progressPercent,
    remainingAmount: formatMmk(remainingAmountValue),
    savedAmount: formatMmk(savedAmountValue),
    savedAmountValue,
    storedSavedAmountValue,
    status: deriveStatus(row.status, progressPercent, targetDateValue),
    targetAmount: formatMmk(targetAmountValue),
    targetAmountValue,
    targetDate: formatDate(targetDateValue),
    targetDateTimeValue: combineDateWithTimestampTime(targetDateValue, row.created_at),
    targetDateValue,
  };
}

export async function getSavingsGoals(
  supabase: SupabaseClient,
  userId: string,
  accounts: AccountRecord[],
  categories: CategoryRecord[],
  options: { limit?: number } = {},
) {
  let goalsQuery = supabase
    .from("savings_goals")
    .select("*")
    .eq("user_id", userId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false });

  if (options.limit) goalsQuery = goalsQuery.limit(options.limit);

  const [goalsResult, entriesResult, transactionsResult] = await Promise.all([
    goalsQuery,
    supabase
      .from("savings_goal_entries")
      .select("savings_goal_id,transaction_id,amount,type")
      .eq("user_id", userId),
    supabase
      .from("transactions")
      .select("id,account_id,transfer_account_id,related_entity_id,type,amount,status,metadata")
      .eq("user_id", userId)
      .eq("related_entity_type", "savings_goal")
      .is("deleted_at", null),
  ]);

  if (goalsResult.error) throw new Error(goalsResult.error.message);
  if (entriesResult.error) throw new Error(entriesResult.error.message);
  if (transactionsResult.error) throw new Error(transactionsResult.error.message);

  const accountsById = new Map(accounts.map((account) => [account.id, account]));
  const categoriesById = new Map(categories.map((category) => [category.id, category]));
  const goalAccountIdByGoalId = new Map((goalsResult.data as SavingsGoalRow[]).map((goal) => {
    const metadata = metadataRecord(goal.metadata);
    return [goal.id, goal.account_id ?? (typeof metadata.account_id === "string" ? metadata.account_id : "")];
  }));
  const linkedAmounts = calculateLinkedSavingsAmounts(
    entriesResult.data as SavingsGoalEntryInput[],
    transactionsResult.data as LinkedTransactionRow[],
    goalAccountIdByGoalId,
  );

  return (goalsResult.data as SavingsGoalRow[])
    .map((goal) => mapGoal(
      goal,
      accountsById,
      categoriesById,
      linkedAmounts.progressByGoalId,
      linkedAmounts.reserveByGoalId,
    ))
    .sort((first, second) => dateTimeSortValue(first.targetDateTimeValue ?? "") - dateTimeSortValue(second.targetDateTimeValue ?? ""));
}

export async function getSavingsGoal(
  supabase: SupabaseClient,
  userId: string,
  goalId: string,
  accounts: AccountRecord[],
  categories: CategoryRecord[],
) {
  const goals = await getSavingsGoals(supabase, userId, accounts, categories);
  return goals.find((goal) => goal.id === goalId) ?? null;
}

export function getSavingsGoalSummaries(goals: SavingsGoalRecord[]): SummaryMetric[] {
  const totalTarget = goals.reduce((total, goal) => total + goal.targetAmountValue, 0);
  const totalSaved = goals.reduce((total, goal) => total + goal.savedAmountValue, 0);
  const remaining = goals.reduce((total, goal) => total + Math.max(goal.targetAmountValue - goal.savedAmountValue, 0), 0);

  return [
    { label: "Total Target", value: formatMmk(totalTarget), icon: "target", tone: "text-[#0b1c30]", bg: "bg-[#eff6ff]" },
    { label: "Total Saved", value: formatMmk(totalSaved), icon: "savings", tone: "text-[#0058be]", bg: "bg-[#eff6ff]" },
    { label: "Remaining", value: formatMmk(remaining), icon: "timeline", tone: "text-[#047857]", bg: "bg-[#ecfdf5]" },
    { label: "Active Goals", value: String(goals.filter((goal) => goal.status !== "Completed").length), icon: "dashboard", tone: "text-[#4f46e5]", bg: "bg-[#eef2ff]" },
  ];
}
