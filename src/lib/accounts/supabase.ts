import type { SupabaseClient } from "@supabase/supabase-js";

import type { IconName } from "@/components/ui/icon";
import { maskCardNumber } from "@/lib/accounts/card-display";
import { formatMmk } from "@/lib/currency";
import { formatDisplayDate } from "@/lib/date-format";
import {
  buildAccountLedgerActivities,
  deriveCreditCardDebtMetadata,
  metadataRecord,
  normalizeAccountType,
  normalizeAmountType,
  numericValue,
  roundCurrencyValue,
  type LedgerAccountActivity,
} from "@/lib/ledger";
import type { AccountAmountType, AccountStatus, AccountType, FinancialAccount, SummaryMetric } from "@/types/finance";

export type AccountRecord = FinancialAccount & {
  amountTypeValues: { amountValue: number; type: string }[];
  availableBalanceValue: number;
  balanceValue: number;
  creditAvailable: string;
  creditAvailableValue: number;
  creditBalance: string;
  creditBalanceValue: number;
  creditLimit: string;
  creditLimitValue: number;
  creditMinimumPayment: string;
  creditMinimumPaymentValue: number;
  creditPaymentDueDay: number | null;
  creditStatementDay: number | null;
  creditUsed: string;
  creditUsedValue: number;
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
  creditLimit: number | null;
  creditMinimumPayment: number | null;
  creditPaymentDueDay: number | null;
  creditStatementDay: number | null;
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
  related_entity_id: string | null;
  related_entity_type: string | null;
  status: string | null;
  transfer_account_id: string | null;
  type: string;
};

type AccountDebtRow = {
  id: string;
  metadata: unknown;
  payment_account_id: string | null;
  type: string | null;
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

function normalizeTypeKey(type: string | null | undefined) {
  const key = normalizeAccountType(type);
  if (key === "bankaccount") return "bank_account";
  if (key === "cashwallet") return "cash_wallet";
  if (key === "creditcard") return "credit_card";
  if (key === "digitalwallet") return "digital_wallet";
  return key;
}

function optionalNumericValue(value: unknown) {
  if (value == null || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function dayOfMonthValue(value: unknown) {
  const number = optionalNumericValue(value);
  if (number == null) return null;
  const day = Math.trunc(number);
  return day >= 1 && day <= 31 ? day : null;
}

function amountTypeBreakdown(type: AccountAmountType, value: unknown) {
  const amountValue = roundCurrencyValue(numericValue(value));
  return {
    amount: formatMmk(amountValue),
    amountValue,
    type,
  };
}

function amountTypeKey(value: unknown) {
  return normalizeAmountType(value).toLowerCase();
}

function storedAmountValue(record: Record<string, unknown>) {
  for (const key of ["amountValue", "amount_value", "amount", "balanceValue", "balance_value", "balance", "initialBalance", "initial_balance"]) {
    const value = optionalNumericValue(record[key]);
    if (value != null) return value;
  }
  return null;
}

function legacySplitAmountValues(metadata: Record<string, unknown>) {
  const values = new Map<string, { amountValue: number; type: string }>();
  const operationAmount = optionalNumericValue(metadata.operation_amount);
  const savingAmount = optionalNumericValue(metadata.saving_amount);

  if (operationAmount != null) values.set(amountTypeKey("Operation"), { amountValue: operationAmount, type: "Operation" });
  if (savingAmount != null) values.set(amountTypeKey("Saving"), { amountValue: savingAmount, type: "Saving" });

  return values;
}

function normalizeAmountTypeValues(metadata: Record<string, unknown>) {
  const legacySplitValues = legacySplitAmountValues(metadata);
  if (Array.isArray(metadata.amount_types)) {
    const amountTypes = metadata.amount_types
      .map((item) => metadataRecord(item))
      .map((item) => {
        const storedAmount = storedAmountValue(item);
        const legacyAmount = legacySplitValues.get(amountTypeKey(item.type))?.amountValue;
        return {
          amountValue: legacyAmount != null && (storedAmount == null || storedAmount === 0) ? legacyAmount : storedAmount ?? 0,
          type: normalizeAmountType(item.type),
        };
      })
      .filter((item) => item.type.trim() !== "");

    if (amountTypes.length > 0) return amountTypes;
  }

  if (legacySplitValues.size > 0) return Array.from(legacySplitValues.values());

  return [
    {
      amountValue: 0,
      type: "Operation",
    },
  ];
}

function transactionBalanceBreakdowns(amountTypeValues: { type: string }[]) {
  const breakdowns = new Map(amountTypeValues.map((item) => [item.type, 0]));
  return breakdowns;
}

function displayAmountTypeBreakdowns(
  amountTypeValues: { type: string }[],
  deltas: Map<string, number>,
) {
  const breakdowns = transactionBalanceBreakdowns(amountTypeValues);
  const fallbackAmountType = amountTypeValues[0]?.type ?? "General";
  const activeAmountTypeByKey = new Map(amountTypeValues.map((item) => [amountTypeKey(item.type), item.type]));

  for (const [amountType, delta] of deltas) {
    const displayAmountType = activeAmountTypeByKey.get(amountTypeKey(amountType)) ?? fallbackAmountType;
    breakdowns.set(displayAmountType, roundCurrencyValue((breakdowns.get(displayAmountType) ?? 0) + delta));
  }

  return breakdowns;
}

function emptyActivity(): LedgerAccountActivity {
  return { creditUsed: 0, deltas: new Map(), inflow: 0, outflow: 0, transactionCount: 0 };
}

function mapAccount(row: AccountRow, activity: LedgerAccountActivity = emptyActivity()): AccountRecord {
  const metadata = metadataRecord(row.metadata);
  const type = typeMap[normalizeTypeKey(row.type)] ?? "Bank Account";
  const isCreditCard = type === "Credit Card";
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
  const displayAmountTypes = isCreditCard
    ? new Map(amountTypeValues.map((item) => [item.type, 0]))
    : displayAmountTypeBreakdowns(amountTypeValues, activity.deltas);
  const storedMonthlyBudgetLimit = optionalNumericValue(metadata.monthly_budget_limit);
  const storedCreditLimit = optionalNumericValue(metadata.credit_limit);
  const monthlyBudgetLimit = isCreditCard ? (storedCreditLimit ?? storedMonthlyBudgetLimit) : storedMonthlyBudgetLimit;
  const cashBalanceValue = roundCurrencyValue(Array.from(displayAmountTypes.values()).reduce((total, amount) => total + roundCurrencyValue(amount), 0));
  const creditLimitValue = isCreditCard ? roundCurrencyValue(monthlyBudgetLimit ?? 0) : 0;
  // The configured credit limit is a fixed ceiling. Repayments can reduce
  // utilization to zero, but they must never manufacture additional limit.
  const signedCreditCardBalance = isCreditCard ? roundCurrencyValue(activity.creditUsed) : 0;
  const creditUsedValue = isCreditCard ? roundCurrencyValue(Math.max(signedCreditCardBalance, 0)) : 0;
  // Payments beyond the amount owed are an asset (the card issuer owes the
  // user), even though available credit remains capped at the fixed limit.
  const creditBalanceValue = isCreditCard ? roundCurrencyValue(Math.max(-signedCreditCardBalance, 0)) : 0;
  const creditAvailableValue = isCreditCard
    ? roundCurrencyValue(Math.min(Math.max(creditLimitValue - creditUsedValue, 0), creditLimitValue))
    : 0;
  const creditMinimumPaymentValue = isCreditCard ? roundCurrencyValue(Math.max(numericValue(metadata.credit_minimum_payment), 0)) : 0;
  const creditStatementDay = isCreditCard ? dayOfMonthValue(metadata.credit_statement_day) : null;
  const creditPaymentDueDay = isCreditCard ? dayOfMonthValue(metadata.credit_payment_due_day) : null;
  const balanceValue = isCreditCard ? creditAvailableValue : cashBalanceValue;
  const availableBalanceValue = isCreditCard ? creditAvailableValue : cashBalanceValue;
  const balanceBreakdowns = Array.from(displayAmountTypes, ([amountType, amountValue]) => amountTypeBreakdown(amountType, amountValue));
  const availableBreakdowns = isCreditCard
    ? [
      amountTypeBreakdown("Credit Limit", creditLimitValue),
      amountTypeBreakdown("Credit Used", creditUsedValue),
      amountTypeBreakdown("Card Credit", creditBalanceValue),
      amountTypeBreakdown("Available Credit", creditAvailableValue),
    ]
    : balanceBreakdowns;
  const metadataStatus = metadata.status;
  const status: AccountStatus = !row.is_active
    ? "Archived"
    : metadataStatus === "Needs Review"
      ? "Needs Review"
      : "Active";

  return {
    ...appearance,
    accountNumber: [accountIdentifier, phoneNumber, cardNumber ? maskCardNumber(cardNumber) : ""].filter(Boolean).join(" / "),
    amountTypeValues,
    availableBalance: formatMmk(availableBalanceValue),
    availableBreakdowns,
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
    creditAvailable: formatMmk(creditAvailableValue),
    creditAvailableValue,
    creditBalance: formatMmk(creditBalanceValue),
    creditBalanceValue,
    creditLimit: formatMmk(creditLimitValue),
    creditLimitValue,
    creditMinimumPayment: formatMmk(creditMinimumPaymentValue),
    creditMinimumPaymentValue,
    creditPaymentDueDay,
    creditStatementDay,
    creditUsed: formatMmk(creditUsedValue),
    creditUsedValue,
    currency: row.currency_code,
    icon: appearance.icon,
    id: row.id,
    institution: typeof metadata.institution === "string" ? metadata.institution : "",
    initialBalanceValue,
    lastUpdated: formatDisplayDate(new Date(row.updated_at ?? row.created_at)),
    monthlyBudgetLimit,
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

  const [accountsResult, transactionsResult, debtsResult] = await Promise.all([
    accountsQuery,
    supabase
      .from("transactions")
      .select("account_id,transfer_account_id,amount,type,metadata,status,related_entity_id,related_entity_type")
      .eq("user_id", userId)
      .is("deleted_at", null),
    supabase
      .from("debts")
      .select("id,payment_account_id,type,metadata")
      .eq("user_id", userId)
      .is("deleted_at", null),
  ]);

  if (accountsResult.error) throw new Error(accountsResult.error.message);
  if (transactionsResult.error) throw new Error(transactionsResult.error.message);
  if (debtsResult.error) throw new Error(debtsResult.error.message);

  const accountRows = accountsResult.data as AccountRow[];
  const debtRows = debtsResult.data as AccountDebtRow[];
  const transactions = (transactionsResult.data as AccountTransactionRow[]).map((transaction) => ({
    ...transaction,
    metadata: deriveCreditCardDebtMetadata(transaction, debtRows, accountRows),
  }));
  const activities = buildAccountLedgerActivities(transactions, accountRows);
  return accountRows.map((account) => mapAccount(account, activities.get(account.id)));
}

export async function getAccount(supabase: SupabaseClient, userId: string, accountId: string) {
  const accounts = await getAccounts(supabase, userId);
  return accounts.find((account) => account.id === accountId) ?? null;
}

export function getAccountSummaries(accounts: AccountRecord[]): SummaryMetric[] {
  const activeAccounts = accounts.filter((account) => account.status === "Active");
  const activeCashAccounts = activeAccounts.filter((account) => account.type !== "Credit Card");
  const activeCreditCards = activeAccounts.filter((account) => account.type === "Credit Card");
  const amountTypeTotals = new Map<string, number>();
  for (const account of activeCashAccounts) {
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

  if (activeCreditCards.length > 0) {
    const creditLimit = activeCreditCards.reduce((sum, account) => sum + account.creditLimitValue, 0);
    const creditUsed = activeCreditCards.reduce((sum, account) => sum + account.creditUsedValue, 0);
    const creditBalance = activeCreditCards.reduce((sum, account) => sum + account.creditBalanceValue, 0);
    const creditAvailable = activeCreditCards.reduce((sum, account) => sum + account.creditAvailableValue, 0);
    summaries.push(
      { label: "Credit Used", value: formatMmk(creditUsed), icon: "credit", tone: "text-[#b42318]", bg: "bg-[#fff1f0]" },
      { label: "Available Credit", value: formatMmk(creditAvailable), icon: "credit", tone: "text-[#0058be]", bg: "bg-[#eff6ff]" },
      { label: "Credit Limit", value: formatMmk(creditLimit), icon: "timeline", tone: "text-[#4f46e5]", bg: "bg-[#eef2ff]" },
    );
    if (creditBalance > 0) {
      summaries.push({ label: "Card Credit", value: formatMmk(creditBalance), icon: "savings", tone: "text-[#047857]", bg: "bg-[#ecfdf5]" });
    }
  }

  return summaries.length > 0
    ? summaries
    : [{ label: "No Amount Types", value: formatMmk(0), icon: "account", tone: "text-[#45464d]", bg: "bg-[#f8f9ff]" }];
}
