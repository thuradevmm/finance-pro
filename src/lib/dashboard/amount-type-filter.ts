import type { AccountRecord } from "../accounts/supabase.ts";
import { accountStatusContributesToCurrentTotals } from "../accounts/financial-status.ts";
import type { DebtRecordWithValues } from "../debts/supabase.ts";
import { roundCurrencyValue, summarizeFinancialPosition } from "../ledger.ts";
import type { SavingsGoalRecord } from "../savings-goals/supabase.ts";
import type { TransactionRecord } from "../transactions/supabase.ts";

function amountTypeKey(value: unknown) {
  return String(value ?? "").trim().toLowerCase();
}

export function dashboardAmountTypeOptions(accounts: AccountRecord[]) {
  const options = new Map<string, string>();
  for (const account of accounts) {
    if (!accountStatusContributesToCurrentTotals(account.status)) continue;
    if (account.type === "Credit Card") {
      options.set("credit card", "Credit Card");
      continue;
    }
    for (const breakdown of account.balanceBreakdowns) {
      const key = amountTypeKey(breakdown.type);
      if (key && !options.has(key)) options.set(key, breakdown.type);
    }
  }
  return Array.from(options.values()).sort((first, second) => first.localeCompare(second));
}

export function sanitizeDashboardAmountTypes(requested: string[], options: string[]) {
  const optionByKey = new Map(options.map((option) => [amountTypeKey(option), option]));
  const selected = new Map<string, string>();
  for (const value of requested) {
    const option = optionByKey.get(amountTypeKey(value));
    if (option) selected.set(amountTypeKey(option), option);
  }
  return selected.size > 0 ? Array.from(selected.values()) : options;
}

function selectedKeys(amountTypes: string[]) {
  return new Set(amountTypes.map(amountTypeKey));
}

export function transactionMatchesDashboardAmountTypes(
  transaction: TransactionRecord,
  amountTypes: string[],
  creditCardAccountIds: Set<string>,
) {
  const keys = selectedKeys(amountTypes);
  const effectiveType = creditCardAccountIds.has(transaction.accountId)
    ? "credit card"
    : amountTypeKey(transaction.accountAmountType);
  return keys.has(effectiveType);
}

export function summarizeAccountPositionForAmountTypes(accounts: AccountRecord[], amountTypes: string[]) {
  const keys = selectedKeys(amountTypes);
  const currentAccounts = accounts.filter((account) => accountStatusContributesToCurrentTotals(account.status));
  return summarizeFinancialPosition({
    cashBalances: currentAccounts
      .filter((account) => account.type !== "Credit Card")
      .map((account) => roundCurrencyValue(account.balanceBreakdowns
        .filter((breakdown) => keys.has(amountTypeKey(breakdown.type)))
        .reduce((total, breakdown) => total + (account.exchangeRateToBase == null ? 0 : breakdown.amountValue * account.exchangeRateToBase), 0))),
    creditCardBalances: keys.has("credit card")
      ? currentAccounts
        .filter((account) => account.type === "Credit Card")
        .map((account) => account.creditUsedBaseValue - account.creditBalanceBaseValue)
      : [],
  });
}

export function filterDebtsForDashboardAmountTypes(debts: DebtRecordWithValues[], amountTypes: string[], includeUnassigned = false) {
  const keys = selectedKeys(amountTypes);
  return debts.filter((debt) => debt.isCreditCardDebt
    ? keys.has("credit card")
    : (includeUnassigned && !debt.accountAmountType.trim()) || keys.has(amountTypeKey(debt.accountAmountType)));
}

export function filterSavingsGoalsForDashboardAmountTypes(goals: SavingsGoalRecord[], amountTypes: string[]) {
  const keys = selectedKeys(amountTypes);
  return goals.filter((goal) => keys.has(amountTypeKey(goal.accountAmountType)));
}

export function dashboardScopeTransferNet(transactions: TransactionRecord[]) {
  return roundCurrencyValue(transactions.reduce((total, transaction) => {
    if (transaction.type !== "Transfer") return total;
    if (transaction.transferDirection === "Credit") return total + transaction.amountBaseValue;
    if (transaction.transferDirection === "Debit") return total - transaction.amountBaseValue;
    return total;
  }, 0));
}
