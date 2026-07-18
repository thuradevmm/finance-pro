export type AccountArchivalPosition = {
  balanceValue: number;
  creditBalanceValue: number;
  creditUsedValue: number;
  type: string;
};

function isCreditCard(type: string) {
  return type.trim().toLowerCase().replace(/[\s-]+/g, "_") === "credit_card";
}

function hasCurrencyPosition(value: number) {
  return Number.isFinite(value) && Math.abs(value) >= 0.005;
}

export function accountArchivalIntegrityError(
  account: AccountArchivalPosition,
  activeDependents: string[],
) {
  const hasPosition = isCreditCard(account.type)
    ? hasCurrencyPosition(account.creditUsedValue) || hasCurrencyPosition(account.creditBalanceValue)
    : hasCurrencyPosition(account.balanceValue);
  if (hasPosition) {
    return isCreditCard(account.type)
      ? "Settle the card balance or card credit before archiving this account."
      : "Move or settle the account balance before archiving this account.";
  }

  const dependencies = Array.from(new Set(activeDependents.filter(Boolean)));
  return dependencies.length > 0
    ? `Resolve active or scheduled linked records before archiving this account: ${dependencies.join(", ")}.`
    : "";
}
