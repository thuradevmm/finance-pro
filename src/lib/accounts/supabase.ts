import type { SupabaseClient } from "@supabase/supabase-js";

import type { IconName } from "@/components/ui/icon";
import { formatMmk } from "@/lib/currency";
import { formatDisplayDate } from "@/lib/date-format";
import type { AccountAmountType, AccountStatus, AccountType, FinancialAccount, SummaryMetric } from "@/types/finance";

export type AccountRecord = FinancialAccount & {
  amountTypeValues: { amountValue: number; type: string }[];
  availableBalanceValue: number;
  balanceValue: number;
  initialBalanceValue: number;
  monthlyBudgetLimit: number | null;
  notes: string;
};

export type AccountFormData = {
  accountNumber: string;
  bankBookAccountNumber: string;
  cardNumber: string;
  cardSecurityCode: string;
  cardExpiryCode: string;
  cardType: string;
  mobileBankingAccountNumber: string;
  phoneNumber: string;
  amountTypes: { type: string }[];
  category: string;
  currency: string;
  institution: string;
  monthlyBudgetLimit: number | null;
  name: string;
  notes: string;
  status: AccountStatus;
  type: AccountType;
};

function compactIdentifier(value: string) {
  const normalized = value.replace(/\s+/g, "");
  if (!normalized) return "";
  return normalized.length > 4 ? `*${normalized.slice(-4)}` : normalized;
}

export function getAccountOptionLabel(account: AccountRecord, accounts: AccountRecord[] = []) {
  const identifier = compactIdentifier(account.bankBookAccountNumber || account.mobileBankingAccountNumber || account.phoneNumber || account.cardNumber);
  const baseLabel = account.name || "Unnamed account";
  const duplicateNames = accounts.filter((item) => (item.name || "Unnamed account") === baseLabel);
  if (duplicateNames.length <= 1) return baseLabel;

  const labelWithInstitution = [baseLabel, account.institution].filter(Boolean).join(" · ");
  const duplicateInstitutionLabels = duplicateNames.filter((item) => {
    return [item.name || "Unnamed account", item.institution].filter(Boolean).join(" · ") === labelWithInstitution;
  });
  if (labelWithInstitution !== baseLabel && duplicateInstitutionLabels.length <= 1) return labelWithInstitution;

  const labelWithIdentifier = [labelWithInstitution, identifier].filter(Boolean).join(" · ");
  if (labelWithIdentifier !== labelWithInstitution) return labelWithIdentifier;

  return `${baseLabel} · ${account.id.slice(0, 8)}`;
}

export function getAccountOptionLabels(accounts: AccountRecord[]) {
  return accounts.map((account) => getAccountOptionLabel(account, accounts));
}

export function findAccountByOptionLabel(accounts: AccountRecord[], label: string) {
  return accounts.find((account) => getAccountOptionLabel(account, accounts) === label);
}

export function getAccountOptionDescription(account: AccountRecord) {
  const identifier = compactIdentifier(account.bankBookAccountNumber || account.mobileBankingAccountNumber || account.phoneNumber || account.cardNumber);
  return [
    account.type,
    account.category || "Uncategorized",
    account.institution,
    identifier,
  ].filter(Boolean).join(" · ");
}

type AccountRow = {
  color: string | null;
  created_at: string;
  currency_code: string;
  description: string | null;
  icon: string | null;
  id: string;
  initial_balance: number | string;
  is_active: boolean;
  metadata: unknown;
  name: string;
  type: string;
  updated_at: string;
};

type AccountTransactionRow = {
  account_id: string | null;
  amount: number | string;
  metadata: unknown;
  transfer_account_id: string | null;
  type: string;
};

type AccountActivity = {
  inflow: number;
  outflow: number;
  deltas: Map<string, number>;
  transactionCount: number;
};

const typeMap: Record<string, AccountType> = {
  bank: "Bank Account",
  bank_account: "Bank Account",
  cash: "Cash Wallet",
  cash_wallet: "Cash Wallet",
  credit_card: "Credit Card",
  digital_wallet: "Digital Wallet",
  savings: "Savings",
};

const appearances: Record<AccountType, { bg: string; icon: IconName; tone: string }> = {
  "Bank Account": { bg: "bg-[#eff6ff]", icon: "account", tone: "text-[#0058be]" },
  "Cash Wallet": { bg: "bg-[#fffbeb]", icon: "box", tone: "text-[#92400e]" },
  "Credit Card": { bg: "bg-[#fff1f0]", icon: "credit", tone: "text-[#b42318]" },
  "Digital Wallet": { bg: "bg-[#eef2ff]", icon: "credit", tone: "text-[#4f46e5]" },
  Savings: { bg: "bg-[#ecfdf5]", icon: "savings", tone: "text-[#047857]" },
};

function metadataRecord(metadata: unknown) {
  return metadata && typeof metadata === "object" && !Array.isArray(metadata)
    ? metadata as Record<string, unknown>
    : {};
}

function numericValue(value: unknown, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function roundCurrencyValue(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function amountTypeBreakdown(type: AccountAmountType, value: unknown) {
  const amountValue = roundCurrencyValue(numericValue(value));
  return {
    amount: formatMmk(amountValue),
    amountValue,
    type,
  };
}

function emptyActivity(): AccountActivity {
  return { deltas: new Map(), inflow: 0, outflow: 0, transactionCount: 0 };
}

function normalizeAmountType(value: unknown): AccountAmountType {
  return typeof value === "string" && value.trim() ? value.trim() : "General";
}

function addActivityDelta(activity: AccountActivity, amountType: AccountAmountType, delta: number) {
  activity.deltas.set(amountType, roundCurrencyValue((activity.deltas.get(amountType) ?? 0) + delta));
}

function isCreditCardType(type: string | null | undefined) {
  return String(type ?? "").toLowerCase() === "credit_card";
}

function transferDirection(metadata: Record<string, unknown>) {
  const direction = typeof metadata.transfer_direction === "string" ? metadata.transfer_direction.toLowerCase() : "";
  if (direction === "debit" || direction === "credit") return direction;

  const legacyRole = typeof metadata.same_account_transfer_role === "string" ? metadata.same_account_transfer_role.toLowerCase() : "";
  if (legacyRole === "out") return "debit";
  if (legacyRole === "in") return "credit";
  return "";
}

function signedAccountDelta(amount: number, isCreditCard: boolean, direction: "credit" | "debit") {
  if (direction === "credit") return isCreditCard ? -amount : amount;
  return isCreditCard ? amount : -amount;
}

function normalizeAmountTypeValues(metadata: Record<string, unknown>) {
  if (Array.isArray(metadata.amount_types)) {
    const amountTypes = metadata.amount_types
      .map((item) => metadataRecord(item))
      .map((item) => ({
        amountValue: 0,
        type: normalizeAmountType(item.type),
      }))
      .filter((item) => item.type.trim() !== "");

    if (amountTypes.length > 0) return amountTypes;
  }

  const hasLegacySplit = metadata.operation_amount != null || metadata.saving_amount != null;
  return [
    {
      amountValue: 0,
      type: "Operation",
    },
    ...(hasLegacySplit ? [{ amountValue: 0, type: "Saving" }] : []),
  ];
}

function buildAccountActivity(transactions: AccountTransactionRow[], accounts: AccountRow[]) {
  const activityByAccount = new Map<string, AccountActivity>();
  const accountTypes = new Map(accounts.map((account) => [account.id, account.type]));

  function getActivity(accountId: string) {
    const existingActivity = activityByAccount.get(accountId);
    if (existingActivity) return existingActivity;
    const nextActivity = emptyActivity();
    activityByAccount.set(accountId, nextActivity);
    return nextActivity;
  }

  for (const transaction of transactions) {
    const amount = numericValue(transaction.amount);
    const metadata = metadataRecord(transaction.metadata);
    const amountType = normalizeAmountType(metadata.account_amount_type);
    const transferAmountType = normalizeAmountType(metadata.transfer_account_amount_type ?? metadata.account_amount_type);
    const type = transaction.type.toLowerCase();
    const direction = transferDirection(metadata);

    if (transaction.account_id) {
      const activity = getActivity(transaction.account_id);
      const isCreditCard = isCreditCardType(accountTypes.get(transaction.account_id));
      activity.transactionCount += 1;
      if (type === "income") {
        activity.inflow += amount;
        addActivityDelta(activity, amountType, isCreditCard ? -amount : amount);
      } else if (type === "expense") {
        activity.outflow += amount;
        addActivityDelta(activity, amountType, isCreditCard ? amount : -amount);
      } else if (type === "transfer") {
        if (direction === "credit") {
          activity.inflow += amount;
          addActivityDelta(activity, amountType, signedAccountDelta(amount, isCreditCard, "credit"));
        } else {
          activity.outflow += amount;
          addActivityDelta(activity, amountType, signedAccountDelta(amount, isCreditCard, "debit"));
        }
      }
    }

    if (type === "transfer" && !direction && transaction.transfer_account_id) {
      const transferActivity = getActivity(transaction.transfer_account_id);
      const isCreditCard = isCreditCardType(accountTypes.get(transaction.transfer_account_id));
      transferActivity.transactionCount += 1;
      transferActivity.inflow += amount;
      addActivityDelta(transferActivity, transferAmountType, isCreditCard ? -amount : amount);
    }
  }

  return activityByAccount;
}

function mapAccount(row: AccountRow, activity: AccountActivity = emptyActivity()): AccountRecord {
  const metadata = metadataRecord(row.metadata);
  const type = typeMap[row.type.toLowerCase()] ?? "Bank Account";
  const appearance = appearances[type];
  const initialBalanceValue = numericValue(row.initial_balance);
  const bankBookAccountNumber = typeof metadata.bank_book_account_number === "string" ? metadata.bank_book_account_number : "";
  const cardNumber = typeof metadata.card_number === "string" ? metadata.card_number : "";
  const cardSecurityCode = typeof metadata.card_security_code === "string" ? metadata.card_security_code : "";
  const cardExpiryCode = typeof metadata.card_expiry_code === "string" ? metadata.card_expiry_code : "";
  const cardType = typeof metadata.card_type === "string" ? metadata.card_type : "";
  const mobileBankingAccountNumber = typeof metadata.mobile_banking_account_number === "string" ? metadata.mobile_banking_account_number : "";
  const phoneNumber = typeof metadata.phone_number === "string" ? metadata.phone_number : "";
  const legacyAccountNumber = typeof metadata.account_number === "string" ? metadata.account_number : "";
  const accountIdentifier = bankBookAccountNumber || mobileBankingAccountNumber || legacyAccountNumber;
  const amountTypeValues = normalizeAmountTypeValues(metadata);
  const displayAmountTypes = new Map(amountTypeValues.map((item) => [item.type, 0]));
  for (const [amountType, delta] of activity.deltas) {
    displayAmountTypes.set(amountType, (displayAmountTypes.get(amountType) ?? 0) + delta);
  }
  const balanceValue = roundCurrencyValue(Array.from(displayAmountTypes.values()).reduce((total, amount) => total + roundCurrencyValue(amount), 0));
  const availableBalanceValue = balanceValue;
  const balanceBreakdowns = Array.from(displayAmountTypes, ([amountType, amountValue]) => amountTypeBreakdown(amountType, amountValue));
  const metadataStatus = metadata.status;
  const status: AccountStatus = !row.is_active
    ? "Archived"
    : metadataStatus === "Needs Review"
      ? "Needs Review"
      : "Active";

  return {
    ...appearance,
    accountNumber: [accountIdentifier, phoneNumber, cardNumber].filter(Boolean).join(" / "),
    amountTypeValues,
    availableBalance: formatMmk(availableBalanceValue),
    availableBreakdowns: balanceBreakdowns,
    availableBalanceValue,
    balance: formatMmk(balanceValue),
    balanceBreakdowns,
    balanceValue,
    bankBookAccountNumber: accountIdentifier,
    bg: appearance.bg,
    cardNumber,
    cardSecurityCode,
    cardExpiryCode,
    cardType,
    category: typeof metadata.category === "string" ? metadata.category : "",
    currency: row.currency_code,
    icon: appearance.icon,
    id: row.id,
    institution: typeof metadata.institution === "string" ? metadata.institution : "",
    initialBalanceValue,
    lastUpdated: formatDisplayDate(new Date(row.updated_at ?? row.created_at)),
    monthlyBudgetLimit: metadata.monthly_budget_limit == null ? null : numericValue(metadata.monthly_budget_limit),
    monthlyInflow: formatMmk(activity.inflow),
    monthlyOutflow: formatMmk(activity.outflow),
    mobileBankingAccountNumber,
    name: row.name,
    notes: row.description ?? "",
    phoneNumber,
    status,
    tone: appearance.tone,
    transactionCount: activity.transactionCount,
    type,
  };
}

export async function getAccounts(supabase: SupabaseClient, userId: string, options: { limit?: number } = {}) {
  let accountsQuery = supabase
    .from("accounts")
    .select("id,name,type,currency_code,initial_balance,description,color,icon,is_active,metadata,created_at,updated_at")
    .eq("user_id", userId)
    .is("deleted_at", null)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });

  if (options.limit) accountsQuery = accountsQuery.limit(options.limit);

  const [accountsResult, transactionsResult] = await Promise.all([
    accountsQuery,
    supabase
      .from("transactions")
      .select("account_id,transfer_account_id,amount,type,metadata")
      .eq("user_id", userId)
      .is("deleted_at", null),
  ]);

  if (accountsResult.error) throw new Error(accountsResult.error.message);
  if (transactionsResult.error) throw new Error(transactionsResult.error.message);

  const accountRows = accountsResult.data as AccountRow[];
  const activities = buildAccountActivity(transactionsResult.data as AccountTransactionRow[], accountRows);
  return accountRows.map((account) => mapAccount(account, activities.get(account.id)));
}

export async function getAccount(supabase: SupabaseClient, userId: string, accountId: string) {
  const accounts = await getAccounts(supabase, userId);
  return accounts.find((account) => account.id === accountId) ?? null;
}

export function getAccountSummaries(accounts: AccountRecord[]): SummaryMetric[] {
  const activeAccounts = accounts.filter((account) => account.status === "Active");
  const amountTypeTotals = new Map<string, number>();
  for (const account of activeAccounts) {
    for (const breakdown of account.balanceBreakdowns) {
      amountTypeTotals.set(breakdown.type, roundCurrencyValue((amountTypeTotals.get(breakdown.type) ?? 0) + breakdown.amountValue));
    }
  }

  const summaryStyles: Array<Pick<SummaryMetric, "bg" | "icon" | "tone">> = [
    { icon: "account", tone: "text-[#0058be]", bg: "bg-[#eff6ff]" },
    { icon: "savings", tone: "text-[#047857]", bg: "bg-[#ecfdf5]" },
    { icon: "credit", tone: "text-[#b42318]", bg: "bg-[#fff1f0]" },
    { icon: "timeline", tone: "text-[#4f46e5]", bg: "bg-[#eef2ff]" },
  ];

  const summaries = Array.from(amountTypeTotals, ([amountType, amountValue], index) => ({
    label: amountType,
    value: formatMmk(amountValue),
    ...summaryStyles[index % summaryStyles.length],
  }));

  return summaries.length > 0
    ? summaries
    : [{ label: "No Amount Types", value: formatMmk(0), icon: "account", tone: "text-[#45464d]", bg: "bg-[#f8f9ff]" }];
}
