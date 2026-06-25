import type { SupabaseClient } from "@supabase/supabase-js";

import type { IconName } from "@/components/ui/icon";
import { formatMmk } from "@/lib/currency";
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
  availableBalance: number;
  amountTypes: { amount: number; type: string }[];
  category: string;
  currency: string;
  institution: string;
  monthlyBudgetLimit: number | null;
  name: string;
  notes: string;
  openingBalance: number;
  status: AccountStatus;
  type: AccountType;
};

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

type BalanceRow = {
  account_id: string;
  current_balance: number | string | null;
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

function amountTypeBreakdown(type: AccountAmountType, value: unknown) {
  const amountValue = numericValue(value);
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
  return typeof value === "string" && value.trim() ? value.trim() : "Operation";
}

function addActivityDelta(activity: AccountActivity, amountType: AccountAmountType, delta: number) {
  activity.deltas.set(amountType, (activity.deltas.get(amountType) ?? 0) + delta);
}

function normalizeAmountTypeValues(metadata: Record<string, unknown>, initialBalanceValue: number) {
  if (Array.isArray(metadata.amount_types)) {
    const amountTypes = metadata.amount_types
      .map((item) => metadataRecord(item))
      .map((item) => ({
        amountValue: numericValue(item.amount),
        type: normalizeAmountType(item.type),
      }))
      .filter((item) => item.type.trim() !== "");

    if (amountTypes.length > 0) return amountTypes;
  }

  const hasLegacySplit = metadata.operation_amount != null || metadata.saving_amount != null;
  return [
    {
      amountValue: numericValue(hasLegacySplit ? metadata.operation_amount : initialBalanceValue),
      type: "Operation",
    },
    ...(hasLegacySplit ? [{ amountValue: numericValue(metadata.saving_amount), type: "Saving" }] : []),
  ];
}

function buildAccountActivity(transactions: AccountTransactionRow[]) {
  const activityByAccount = new Map<string, AccountActivity>();

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
    const type = transaction.type.toLowerCase();

    if (transaction.account_id) {
      const activity = getActivity(transaction.account_id);
      activity.transactionCount += 1;
      if (type === "income") {
        activity.inflow += amount;
        addActivityDelta(activity, amountType, amount);
      } else if (type === "expense") {
        activity.outflow += amount;
        addActivityDelta(activity, amountType, -amount);
      } else if (type === "transfer") {
        activity.outflow += amount;
        addActivityDelta(activity, amountType, -amount);
      }
    }

    if (type === "transfer" && transaction.transfer_account_id) {
      const transferActivity = getActivity(transaction.transfer_account_id);
      transferActivity.transactionCount += 1;
      transferActivity.inflow += amount;
      addActivityDelta(transferActivity, amountType, amount);
    }
  }

  return activityByAccount;
}

function mapAccount(row: AccountRow, balance?: BalanceRow, activity: AccountActivity = emptyActivity()): AccountRecord {
  const metadata = metadataRecord(row.metadata);
  const type = typeMap[row.type.toLowerCase()] ?? "Bank Account";
  const appearance = appearances[type];
  const balanceValue = numericValue(balance?.current_balance, numericValue(row.initial_balance));
  const initialBalanceValue = numericValue(row.initial_balance);
  const availableBalanceValue = numericValue(metadata.available_balance, balanceValue);
  const bankBookAccountNumber = typeof metadata.bank_book_account_number === "string" ? metadata.bank_book_account_number : "";
  const cardNumber = typeof metadata.card_number === "string" ? metadata.card_number : "";
  const cardSecurityCode = typeof metadata.card_security_code === "string" ? metadata.card_security_code : "";
  const cardExpiryCode = typeof metadata.card_expiry_code === "string" ? metadata.card_expiry_code : "";
  const cardType = typeof metadata.card_type === "string" ? metadata.card_type : "";
  const mobileBankingAccountNumber = typeof metadata.mobile_banking_account_number === "string" ? metadata.mobile_banking_account_number : "";
  const phoneNumber = typeof metadata.phone_number === "string" ? metadata.phone_number : "";
  const legacyAccountNumber = typeof metadata.account_number === "string" ? metadata.account_number : "";
  const accountIdentifier = bankBookAccountNumber || mobileBankingAccountNumber || legacyAccountNumber;
  const amountTypeValues = normalizeAmountTypeValues(metadata, initialBalanceValue);
  const displayAmountTypes = new Map(amountTypeValues.map((item) => [item.type, item.amountValue]));
  for (const [amountType, delta] of activity.deltas) {
    displayAmountTypes.set(amountType, (displayAmountTypes.get(amountType) ?? 0) + delta);
  }
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
    availableBalanceValue,
    balance: formatMmk(balanceValue),
    balanceBreakdowns: Array.from(displayAmountTypes, ([amountType, amountValue]) => amountTypeBreakdown(amountType, amountValue)),
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
    lastUpdated: new Intl.DateTimeFormat("en-US", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(row.updated_at ?? row.created_at)),
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

export async function getAccounts(supabase: SupabaseClient, userId: string) {
  const [accountsResult, balancesResult, transactionsResult] = await Promise.all([
    supabase
      .from("accounts")
      .select("id,name,type,currency_code,initial_balance,description,color,icon,is_active,metadata,created_at,updated_at")
      .eq("user_id", userId)
      .is("deleted_at", null)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true }),
    supabase.from("v_account_balances").select("account_id,current_balance").eq("user_id", userId),
    supabase
      .from("transactions")
      .select("account_id,transfer_account_id,amount,type,metadata")
      .eq("user_id", userId)
      .is("deleted_at", null),
  ]);

  if (accountsResult.error) throw new Error(accountsResult.error.message);
  if (balancesResult.error) throw new Error(balancesResult.error.message);
  if (transactionsResult.error) throw new Error(transactionsResult.error.message);

  const balances = new Map((balancesResult.data as BalanceRow[]).map((balance) => [balance.account_id, balance]));
  const activities = buildAccountActivity(transactionsResult.data as AccountTransactionRow[]);
  return (accountsResult.data as AccountRow[]).map((account) => mapAccount(account, balances.get(account.id), activities.get(account.id)));
}

export async function getAccount(supabase: SupabaseClient, userId: string, accountId: string) {
  const accounts = await getAccounts(supabase, userId);
  return accounts.find((account) => account.id === accountId) ?? null;
}

export function getAccountSummaries(accounts: AccountRecord[]): SummaryMetric[] {
  const activeAccounts = accounts.filter((account) => account.status === "Active");
  const totalBalance = activeAccounts.reduce((total, account) => total + account.balanceValue, 0);
  const cashAvailable = activeAccounts
    .filter((account) => account.type !== "Credit Card")
    .reduce((total, account) => total + account.availableBalanceValue, 0);
  const creditUsed = activeAccounts
    .filter((account) => account.type === "Credit Card")
    .reduce((total, account) => total + Math.abs(Math.min(account.balanceValue, 0)), 0);

  return [
    { label: "Total Balance", value: formatMmk(totalBalance), icon: "account", tone: "text-[#0b1c30]", bg: "bg-[#eff6ff]" },
    { label: "Cash Available", value: formatMmk(cashAvailable), icon: "savings", tone: "text-[#047857]", bg: "bg-[#ecfdf5]" },
    { label: "Credit Used", value: formatMmk(creditUsed), icon: "credit", tone: "text-[#b42318]", bg: "bg-[#fff1f0]" },
    { label: "Active Accounts", value: String(activeAccounts.length), icon: "dashboard", tone: "text-[#4f46e5]", bg: "bg-[#eef2ff]" },
  ];
}
