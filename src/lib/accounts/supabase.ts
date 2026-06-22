import type { SupabaseClient } from "@supabase/supabase-js";

import type { IconName } from "@/components/ui/icon";
import { formatMmk } from "@/lib/currency";
import type { AccountStatus, AccountType, FinancialAccount, SummaryMetric } from "@/types/finance";

export type AccountRecord = FinancialAccount & {
  availableBalanceValue: number;
  balanceValue: number;
  category: string;
  initialBalanceValue: number;
  monthlyBudgetLimit: number | null;
  notes: string;
};

export type AccountFormData = {
  accountNumber: string;
  availableBalance: number;
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

function mapAccount(row: AccountRow, balance?: BalanceRow): AccountRecord {
  const metadata = metadataRecord(row.metadata);
  const type = typeMap[row.type.toLowerCase()] ?? "Bank Account";
  const appearance = appearances[type];
  const balanceValue = numericValue(balance?.current_balance, numericValue(row.initial_balance));
  const initialBalanceValue = numericValue(row.initial_balance);
  const availableBalanceValue = numericValue(metadata.available_balance, balanceValue);
  const metadataStatus = metadata.status;
  const status: AccountStatus = !row.is_active
    ? "Archived"
    : metadataStatus === "Needs Review"
      ? "Needs Review"
      : "Active";

  return {
    ...appearance,
    accountNumber: typeof metadata.account_number === "string" ? metadata.account_number : "",
    availableBalance: formatMmk(availableBalanceValue),
    availableBalanceValue,
    balance: formatMmk(balanceValue),
    balanceValue,
    bg: appearance.bg,
    category: typeof metadata.category === "string" ? metadata.category : "",
    currency: row.currency_code,
    icon: appearance.icon,
    id: row.id,
    institution: typeof metadata.institution === "string" ? metadata.institution : "",
    initialBalanceValue,
    lastUpdated: new Intl.DateTimeFormat("en-US", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(row.updated_at ?? row.created_at)),
    monthlyBudgetLimit: metadata.monthly_budget_limit == null ? null : numericValue(metadata.monthly_budget_limit),
    monthlyInflow: formatMmk(0),
    monthlyOutflow: formatMmk(0),
    name: row.name,
    notes: row.description ?? "",
    status,
    tone: appearance.tone,
    transactionCount: 0,
    type,
  };
}

export async function getAccounts(supabase: SupabaseClient, userId: string) {
  const [accountsResult, balancesResult] = await Promise.all([
    supabase
      .from("accounts")
      .select("id,name,type,currency_code,initial_balance,description,color,icon,is_active,metadata,created_at,updated_at")
      .eq("user_id", userId)
      .is("deleted_at", null)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true }),
    supabase.from("v_account_balances").select("account_id,current_balance").eq("user_id", userId),
  ]);

  if (accountsResult.error) throw new Error(accountsResult.error.message);
  if (balancesResult.error) throw new Error(balancesResult.error.message);

  const balances = new Map((balancesResult.data as BalanceRow[]).map((balance) => [balance.account_id, balance]));
  return (accountsResult.data as AccountRow[]).map((account) => mapAccount(account, balances.get(account.id)));
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
