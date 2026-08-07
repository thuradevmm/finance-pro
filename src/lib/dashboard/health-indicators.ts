import type { CategoryRecord } from "../categories/supabase.ts";
import { economicTransactionDelta, roundCurrencyValue } from "../ledger.ts";
import type { SavingsGoalRecord } from "../savings-goals/supabase.ts";
import { savingsTransactionDelta } from "../savings-goals/calculations.ts";
import type { TransactionRecord } from "../transactions/supabase.ts";

export type FinancialHealthSignal = {
  detail: string;
  label: string;
  score: number | null;
  signal: "Building" | "Healthy" | "Setup needed" | "Warning" | "Watch" | "Winning";
};

function healthScore(value: number) {
  return Math.round(Math.min(Math.max(value, 0), 100));
}

function inclusiveMonthCount(dateFrom: string, dateTo: string) {
  const [fromYear, fromMonth] = dateFrom.slice(0, 7).split("-").map(Number);
  const [toYear, toMonth] = dateTo.slice(0, 7).split("-").map(Number);
  if (![fromYear, fromMonth, toYear, toMonth].every(Number.isFinite)) return 1;
  return Math.max((toYear - fromYear) * 12 + toMonth - fromMonth + 1, 1);
}

function roleForCategory(categoryId: string, categoriesById: Map<string, CategoryRecord>) {
  const category = categoriesById.get(categoryId);
  if (!category) return "";
  if (category.financialRole) return category.financialRole;
  return category.parentId ? categoriesById.get(category.parentId)?.financialRole ?? "" : "";
}

export function buildFinancialHealthSignals(input: {
  categories: CategoryRecord[];
  dateFrom: string;
  dateTo: string;
  savingsGoals: SavingsGoalRecord[];
  transactions: TransactionRecord[];
}): FinancialHealthSignal[] {
  const categoriesById = new Map(input.categories.map((category) => [category.id, category]));
  const goalAccountById = new Map(input.savingsGoals.map((goal) => [goal.id, goal.accountId]));
  let income = 0;
  let expenses = 0;
  let essentialExpenses = 0;
  let netSavings = 0;

  for (const transaction of input.transactions) {
    const delta = economicTransactionDelta({
      amount: transaction.amountBaseValue,
      metadata: transaction.ledgerMetadata,
      status: transaction.status,
      type: transaction.type,
    });
    income = roundCurrencyValue(income + delta.incomeDelta);
    expenses = roundCurrencyValue(expenses + delta.expenseDelta);
    if (delta.expenseDelta !== 0 && roleForCategory(transaction.categoryId, categoriesById) === "essential") {
      essentialExpenses = roundCurrencyValue(essentialExpenses + delta.expenseDelta);
    }
    if (transaction.relatedEntityType === "savings_goal" && transaction.relatedEntityId) {
      const goalAccountId = goalAccountById.get(transaction.relatedEntityId);
      if (!goalAccountId) continue;
      netSavings = roundCurrencyValue(netSavings + savingsTransactionDelta({
        account_id: transaction.accountId,
        amount: transaction.amountBaseValue,
        id: transaction.id,
        metadata: transaction.ledgerMetadata,
        related_entity_id: transaction.relatedEntityId,
        status: transaction.status,
        transfer_account_id: transaction.transferAccountId,
        type: transaction.type,
      }, goalAccountId));
    }
  }

  const netCashFlow = roundCurrencyValue(income - expenses);
  const essentialRatio = income > 0 ? essentialExpenses / income : null;
  const savingsRate = income > 0 ? netSavings / income : null;
  const emergencyGoals = input.savingsGoals
    .filter((goal) => roleForCategory(goal.categoryId, categoriesById) === "emergency_reserve");
  const emergencyBalance = emergencyGoals.reduce((total, goal) => total + goal.savedAmountValue, 0);
  const hasEssentialClassification = input.categories
    .some((category) => roleForCategory(category.id, categoriesById) === "essential");
  const monthlyEssentials = essentialExpenses / inclusiveMonthCount(input.dateFrom, input.dateTo);
  const emergencyCoverage = monthlyEssentials > 0 ? emergencyBalance / monthlyEssentials : null;

  const cashFlow: Omit<FinancialHealthSignal, "score"> = income <= 0 && expenses <= 0
    ? { detail: "Add finalized Credits and Debits in this period to activate the signal.", label: "Cash-flow direction", signal: "Setup needed" }
    : netCashFlow < 0
      ? { detail: "Finalized Debits are running above Credits in the selected period.", label: "Cash-flow direction", signal: "Warning" }
      : income > 0 && netCashFlow >= income * 0.1
        ? { detail: "The selected period has a meaningful positive margin after spending.", label: "Cash-flow direction", signal: "Winning" }
        : { detail: "Credits are covering Debits, but the remaining margin is narrow.", label: "Cash-flow direction", signal: "Healthy" };

  const essentialLoad: Omit<FinancialHealthSignal, "score"> = expenses > 0 && essentialExpenses <= 0
    ? { detail: "Group living-cost subcategories under an Essential living super category.", label: "Essential expense load", signal: "Setup needed" }
    : essentialRatio == null
      ? { detail: "Finalized Credit is needed to compare essential costs with available income.", label: "Essential expense load", signal: "Setup needed" }
      : essentialRatio <= 0.5
        ? { detail: "Essential living costs are within the common needs guideline for this period.", label: "Essential expense load", signal: "Healthy" }
        : essentialRatio <= 0.65
          ? { detail: "Essential costs are taking a larger share of income and deserve attention.", label: "Essential expense load", signal: "Watch" }
          : { detail: "Essential costs are consuming most of the period's income.", label: "Essential expense load", signal: "Warning" };

  const savingMomentum: Omit<FinancialHealthSignal, "score"> = savingsRate == null
    ? { detail: "Finalized Credit is needed to evaluate saving activity.", label: "Saving momentum", signal: "Setup needed" }
    : savingsRate >= 0.2
      ? { detail: "Net deposits to linked savings goals and funds show strong momentum.", label: "Saving momentum", signal: "Winning" }
      : savingsRate > 0
        ? { detail: "Linked savings are growing; keep the contribution habit consistent.", label: "Saving momentum", signal: "Building" }
        : { detail: "Linked funds had no net growth in the selected period.", label: "Saving momentum", signal: "Warning" };

  const emergencyReadiness: Omit<FinancialHealthSignal, "score"> = emergencyGoals.length === 0
    ? { detail: "Create or group a savings fund under an Emergency reserve super category.", label: "Emergency readiness", signal: "Setup needed" }
    : !hasEssentialClassification
      ? { detail: "Classify living-cost Debits as Essential living so coverage can be estimated.", label: "Emergency readiness", signal: "Setup needed" }
      : emergencyBalance <= 0
        ? { detail: "The emergency fund is configured but currently has no saved balance.", label: "Emergency readiness", signal: "Warning" }
        : emergencyCoverage == null
          ? { detail: "The reserve is configured and funded. No essential Debit activity exists in this period, so coverage months are unavailable.", label: "Emergency readiness", signal: "Building" }
          : emergencyCoverage >= 6
            ? { detail: "Emergency funds cover a strong multi-month cushion of essential costs.", label: "Emergency readiness", signal: "Winning" }
            : emergencyCoverage >= 1
              ? { detail: "An emergency cushion exists and is progressing toward stronger coverage.", label: "Emergency readiness", signal: "Building" }
              : { detail: "The emergency cushion covers less than one typical month of essential costs.", label: "Emergency readiness", signal: "Warning" };

  const cashFlowScore = income <= 0 && expenses <= 0
    ? null
    : healthScore(50 + (income > 0 ? netCashFlow / income : -1) * 250);
  const essentialScore = essentialRatio == null || (expenses > 0 && essentialExpenses <= 0)
    ? null
    : healthScore((0.8 - essentialRatio) / 0.5 * 100);
  const savingsScore = savingsRate == null ? null : healthScore(savingsRate / 0.2 * 100);
  const emergencyScore = emergencyGoals.length === 0 || !hasEssentialClassification
    ? null
    : emergencyCoverage == null
      ? emergencyBalance > 0 ? 20 : 0
      : healthScore(emergencyCoverage / 6 * 100);

  return [
    { ...cashFlow, score: cashFlowScore },
    { ...essentialLoad, score: essentialScore },
    { ...savingMomentum, score: savingsScore },
    { ...emergencyReadiness, score: emergencyScore },
  ];
}
