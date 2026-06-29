export type LedgerAccountInput = {
  id: string;
  type?: string | null;
};

export type LedgerTransactionInput = {
  account_id?: string | null;
  amount?: number | string | null;
  id?: string | null;
  metadata?: unknown;
  status?: string | null;
  transfer_account_id?: string | null;
  type?: string | null;
};

export type LedgerAccountActivity = {
  creditUsed: number;
  deltas: Map<string, number>;
  inflow: number;
  outflow: number;
  transactionCount: number;
};

export type LedgerSummary = {
  expenses: number;
  income: number;
  net: number;
};

type LedgerEffect = {
  accountId: string;
  amount: number;
  amountType: string;
  cashDelta: number;
  creditUsedDelta: number;
  flow: "inflow" | "outflow";
  isCreditCard: boolean;
  transactionType: string;
};

export function metadataRecord(metadata: unknown) {
  return metadata && typeof metadata === "object" && !Array.isArray(metadata)
    ? metadata as Record<string, unknown>
    : {};
}

export function numericValue(value: unknown, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

export function roundCurrencyValue(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function normalizeAmountType(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : "General";
}

export function normalizeAccountType(value: unknown) {
  const key = String(value ?? "").trim().toLowerCase().replace(/[\s-]+/g, "_");
  if (key === "bankaccount") return "bank_account";
  if (key === "cashwallet") return "cash_wallet";
  if (key === "creditcard") return "credit_card";
  if (key === "digitalwallet") return "digital_wallet";
  return key;
}

export function isCreditCardType(value: unknown) {
  return normalizeAccountType(value) === "credit_card";
}

export function transactionStatusAffectsBalance(value: unknown) {
  const status = String(value ?? "cleared").trim().toLowerCase();
  return !["scheduled", "cancelled", "canceled", "void", "failed"].includes(status);
}

export function transferDirection(metadata: Record<string, unknown>) {
  const direction = typeof metadata.transfer_direction === "string" ? metadata.transfer_direction.toLowerCase() : "";
  if (direction === "debit" || direction === "credit") return direction;

  const legacyRole = typeof metadata.same_account_transfer_role === "string" ? metadata.same_account_transfer_role.toLowerCase() : "";
  if (legacyRole === "out") return "debit";
  if (legacyRole === "in") return "credit";
  return "";
}

function emptyActivity(): LedgerAccountActivity {
  return { creditUsed: 0, deltas: new Map(), inflow: 0, outflow: 0, transactionCount: 0 };
}

function signedCashDelta(amount: number, isCreditCard: boolean, direction: "credit" | "debit") {
  if (isCreditCard) return 0;
  return direction === "credit" ? amount : -amount;
}

function signedCreditUsedDelta(amount: number, isCreditCard: boolean, direction: "credit" | "debit") {
  if (!isCreditCard) return 0;
  return direction === "credit" ? -amount : amount;
}

function accountTypeById(accounts: LedgerAccountInput[]) {
  return new Map(accounts.map((account) => [account.id, account.type ?? null]));
}

function ledgerEffects(transaction: LedgerTransactionInput, accountTypes: Map<string, string | null>): LedgerEffect[] {
  if (!transactionStatusAffectsBalance(transaction.status)) return [];

  const amount = Math.abs(numericValue(transaction.amount));
  if (amount <= 0) return [];

  const metadata = metadataRecord(transaction.metadata);
  const transactionType = String(transaction.type ?? "").toLowerCase();
  const direction = transferDirection(metadata);
  const amountType = normalizeAmountType(metadata.account_amount_type);
  const transferAmountType = normalizeAmountType(metadata.transfer_account_amount_type ?? metadata.account_amount_type);
  const effects: LedgerEffect[] = [];

  function pushEffect(accountId: string | null | undefined, effectAmountType: string, effectDirection: "credit" | "debit") {
    if (!accountId) return;
    const isCreditCard = isCreditCardType(accountTypes.get(accountId));
    effects.push({
      accountId,
      amount,
      amountType: effectAmountType,
      cashDelta: signedCashDelta(amount, isCreditCard, effectDirection),
      creditUsedDelta: signedCreditUsedDelta(amount, isCreditCard, effectDirection),
      flow: effectDirection === "credit" ? "inflow" : "outflow",
      isCreditCard,
      transactionType,
    });
  }

  if (transactionType === "income") {
    pushEffect(transaction.account_id, amountType, "credit");
  } else if (transactionType === "expense") {
    pushEffect(transaction.account_id, amountType, "debit");
  } else if (transactionType === "transfer") {
    if (direction === "credit") {
      pushEffect(transaction.account_id, amountType, "credit");
    } else {
      pushEffect(transaction.account_id, amountType, "debit");
    }

    if (!direction) {
      pushEffect(transaction.transfer_account_id, transferAmountType, "credit");
    }
  }

  return effects;
}

export function buildAccountLedgerActivities(
  transactions: LedgerTransactionInput[],
  accounts: LedgerAccountInput[],
) {
  const activities = new Map<string, LedgerAccountActivity>();
  const accountTypes = accountTypeById(accounts);

  function getActivity(accountId: string) {
    const existing = activities.get(accountId);
    if (existing) return existing;
    const activity = emptyActivity();
    activities.set(accountId, activity);
    return activity;
  }

  for (const transaction of transactions) {
    for (const effect of ledgerEffects(transaction, accountTypes)) {
      const activity = getActivity(effect.accountId);
      activity.transactionCount += 1;
      if (effect.flow === "inflow") {
        activity.inflow = roundCurrencyValue(activity.inflow + effect.amount);
      } else {
        activity.outflow = roundCurrencyValue(activity.outflow + effect.amount);
      }
      if (effect.isCreditCard) {
        activity.creditUsed = roundCurrencyValue(activity.creditUsed + effect.creditUsedDelta);
      } else {
        activity.deltas.set(effect.amountType, roundCurrencyValue((activity.deltas.get(effect.amountType) ?? 0) + effect.cashDelta));
      }
    }
  }

  return activities;
}

export function summarizeLedgerTransactions(
  transactions: LedgerTransactionInput[],
  accounts: LedgerAccountInput[],
): LedgerSummary {
  const accountTypes = accountTypeById(accounts);
  const summary: LedgerSummary = { expenses: 0, income: 0, net: 0 };

  for (const transaction of transactions) {
    for (const effect of ledgerEffects(transaction, accountTypes)) {
      if (effect.isCreditCard) continue;

      summary.net = roundCurrencyValue(summary.net + effect.cashDelta);
      if (effect.transactionType === "income") {
        summary.income = roundCurrencyValue(summary.income + effect.amount);
      } else if (effect.transactionType === "expense") {
        summary.expenses = roundCurrencyValue(summary.expenses + effect.amount);
      }
    }
  }

  return summary;
}
