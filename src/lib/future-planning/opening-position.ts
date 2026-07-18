export type OpeningCashAccount = {
  balanceValues: number[];
  id: string;
  type: string;
};

export type OpeningSavingsGoal = {
  accountId: string;
  savedAmount: number;
};

function roundMoney(value: number) {
  if (!Number.isFinite(value) || value === 0) return 0;
  const magnitude = Math.round((Math.abs(value) + Number.EPSILON) * 100) / 100;
  return value < 0 ? -magnitude : magnitude;
}

function isCreditCard(type: string) {
  return type.trim().toLowerCase().replace(/[\s-]+/g, "_") === "credit_card";
}

/**
 * Savings held inside a tracked account remain part of total cash but are not
 * spendable. Reserve linked goal balances once, capped by the positive balance
 * in that account, so transfers into savings do not inflate forecast capacity.
 */
export function calculateOpeningCashPosition(accounts: OpeningCashAccount[], goals: OpeningSavingsGoal[]) {
  const cashAccounts = accounts.filter((account) => !isCreditCard(account.type));
  const balancesByAccount = new Map(cashAccounts.map((account) => [
    account.id,
    roundMoney(account.balanceValues.reduce((total, value) => total + (Number.isFinite(value) ? value : 0), 0)),
  ]));
  const savedByAccount = new Map<string, number>();
  for (const goal of goals) {
    if (!goal.accountId || !balancesByAccount.has(goal.accountId)) continue;
    savedByAccount.set(
      goal.accountId,
      roundMoney((savedByAccount.get(goal.accountId) ?? 0) + Math.max(Number.isFinite(goal.savedAmount) ? goal.savedAmount : 0, 0)),
    );
  }

  const cashBalance = roundMoney([...balancesByAccount.values()].reduce((total, value) => total + value, 0));
  const reservedCash = roundMoney([...savedByAccount].reduce((total, [accountId, saved]) => (
    total + Math.min(saved, Math.max(balancesByAccount.get(accountId) ?? 0, 0))
  ), 0));

  return {
    cashBalance,
    reservedCash,
    spendableCash: roundMoney(cashBalance - reservedCash),
  };
}
