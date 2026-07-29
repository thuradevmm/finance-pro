import type { SupabaseClient } from "@supabase/supabase-js";

import type { IconName } from "@/components/ui/icon";
import { accountAmountTypeValues, reconcileAccountAmountTypeDeltas } from "@/lib/accounts/amount-types";
import { calculateCreditCardPosition, maskCardNumber } from "@/lib/accounts/card-display";
import { accountStatusContributesToCurrentTotals } from "@/lib/accounts/financial-status";
import { formatCurrencyAmount } from "@/lib/currency";
import { convertToBaseCurrency, exchangeRateFor, type CurrencySettings } from "@/lib/currency-conversion";
import { getCurrencySettings } from "@/lib/currency-settings";
import { formatDisplayDate } from "@/lib/date-format";
import { creditCardOpeningBalancesByAccount } from "@/lib/debts/transactions";
import { fetchSupabaseRows } from "@/lib/supabase/pagination";
import {
  buildAccountLedgerActivities,
  deriveCreditCardDebtMetadata,
  metadataRecord,
  normalizeAccountType,
  numericValue,
  roundCurrencyValue,
  summarizeFinancialPosition,
  type LedgerAccountActivity,
} from "@/lib/ledger";
import type { AccountAmountType, AccountStatus, AccountType, FinancialAccount, SummaryMetric } from "@/types/finance";

export type AccountRecord = FinancialAccount & {
  amountTypeValues: { amountValue: number; type: string }[];
  availableBalanceValue: number;
  availableBalanceBaseValue: number;
  baseCurrency: string;
  balanceValue: number;
  balanceBaseValue: number;
  creditAvailable: string;
  creditAvailableValue: number;
  creditAvailableBaseValue: number;
  creditBalance: string;
  creditBalanceValue: number;
  creditBalanceBaseValue: number;
  creditLimit: string;
  creditLimitValue: number;
  creditLimitBaseValue: number;
  creditMinimumPayment: string;
  creditMinimumPaymentValue: number;
  creditPaymentDueDay: number | null;
  creditStatementDay: number | null;
  creditUsed: string;
  creditUsedValue: number;
  creditUsedBaseValue: number;
  exchangeRateToBase: number | null;
  hasExchangeRate: boolean;
  categoryId: string;
  initialBalanceValue: number;
  monthlyBudgetLimit: number | null;
  monthlyInflowValue: number;
  monthlyOutflowValue: number;
  notes: string;
  cardFeeValue: number;
  cardCashAdvanceValue: number;
  cardCreditedValue: number;
  cardDebitedValue: number;
  cardInterestValue: number;
  cardRefundValue: number;
  pendingCreditValue: number;
  pendingDebitValue: number;
  repaymentValue: number;
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
  categoryId: string;
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
  transaction_date: string | null;
  transfer_account_id: string | null;
  type: string;
};

type AccountDebtRow = {
  created_at: string | null;
  id: string;
  metadata: unknown;
  payment_account_id: string | null;
  repaid_amount: number | string | null;
  start_date: string | null;
  total_amount: number | string | null;
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

function amountTypeBreakdown(type: AccountAmountType, value: unknown, currencyCode = "MMK") {
  const amountValue = roundCurrencyValue(numericValue(value));
  return {
    amount: formatCurrencyAmount(amountValue, currencyCode),
    amountValue,
    type,
  };
}

function emptyActivity(): LedgerAccountActivity {
  return {
    cashAdvances: 0,
    credited: 0,
    creditUsed: 0,
    debited: 0,
    deltas: new Map(),
    fees: 0,
    inflow: 0,
    interest: 0,
    outflow: 0,
    pendingInflow: 0,
    pendingOutflow: 0,
    refunds: 0,
    repayments: 0,
    transactionCount: 0,
  };
}

function mapAccount(
  row: AccountRow,
  activity: LedgerAccountActivity = emptyActivity(),
  categoryNames = new Map<string, string>(),
  currencySettings: CurrencySettings = { baseCurrency: "MMK", rates: [] },
  asOfDate?: string,
): AccountRecord {
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
  const amountTypeValues = accountAmountTypeValues(metadata);
  const displayAmountTypes = isCreditCard
    ? new Map(amountTypeValues.map((item) => [item.type, 0]))
    : reconcileAccountAmountTypeDeltas(amountTypeValues, activity.deltas);
  const storedMonthlyBudgetLimit = optionalNumericValue(metadata.monthly_budget_limit);
  const storedCreditLimit = optionalNumericValue(metadata.credit_limit);
  const configuredCreditLimit = storedCreditLimit ?? storedMonthlyBudgetLimit ?? 0;
  const creditPosition = calculateCreditCardPosition(isCreditCard ? activity.creditUsed : 0, configuredCreditLimit);
  const monthlyBudgetLimit = isCreditCard ? creditPosition.limit : storedMonthlyBudgetLimit;
  const cashBalanceValue = roundCurrencyValue(Array.from(displayAmountTypes.values()).reduce((total, amount) => total + roundCurrencyValue(amount), 0));
  const creditLimitValue = isCreditCard ? creditPosition.limit : 0;
  // The configured credit limit is a fixed ceiling. Repayments can reduce
  // utilization to zero, but they must never manufacture additional limit.
  const creditUsedValue = isCreditCard ? creditPosition.outstanding : 0;
  // Payments beyond the amount owed are an asset (the card issuer owes the
  // user), even though available credit remains capped at the fixed limit.
  const creditBalanceValue = isCreditCard ? creditPosition.cardCredit : 0;
  const creditAvailableValue = isCreditCard ? creditPosition.available : 0;
  const creditMinimumPaymentValue = isCreditCard ? roundCurrencyValue(Math.max(numericValue(metadata.credit_minimum_payment), 0)) : 0;
  const creditStatementDay = isCreditCard ? dayOfMonthValue(metadata.credit_statement_day) : null;
  const creditPaymentDueDay = isCreditCard ? dayOfMonthValue(metadata.credit_payment_due_day) : null;
  const balanceValue = isCreditCard ? creditAvailableValue : cashBalanceValue;
  const availableBalanceValue = isCreditCard ? creditAvailableValue : cashBalanceValue;
  const exchangeRateToBase = exchangeRateFor(currencySettings, row.currency_code, asOfDate);
  const toBase = (value: number) => convertToBaseCurrency(value, row.currency_code, currencySettings, asOfDate) ?? 0;
  const balanceBaseValue = toBase(balanceValue);
  const availableBalanceBaseValue = toBase(availableBalanceValue);
  const balanceBreakdowns = Array.from(displayAmountTypes, ([amountType, amountValue]) => amountTypeBreakdown(amountType, amountValue, row.currency_code));
  const availableBreakdowns = isCreditCard
    ? [
      amountTypeBreakdown("Credit Limit", creditLimitValue, row.currency_code),
      amountTypeBreakdown("Credit Used", creditUsedValue, row.currency_code),
      amountTypeBreakdown("Card Credit", creditBalanceValue, row.currency_code),
      amountTypeBreakdown("Available Credit", creditAvailableValue, row.currency_code),
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
    availableBalance: formatCurrencyAmount(availableBalanceValue, row.currency_code),
    availableBalanceBaseValue,
    availableBreakdowns,
    availableBalanceValue,
    balance: formatCurrencyAmount(balanceValue, row.currency_code),
    balanceBaseValue,
    balanceBreakdowns,
    balanceValue,
    bankBookAccountNumber: accountIdentifier,
    bg: appearance.bg,
    cardNumber,
    cardSecurityCode,
    cardExpiryCode,
    cardType,
    baseCurrency: currencySettings.baseCurrency,
    cardFeeValue: activity.fees,
    cardCashAdvanceValue: activity.cashAdvances,
    cardCreditedValue: activity.credited,
    cardDebitedValue: activity.debited,
    cardInterestValue: activity.interest,
    cardRefundValue: activity.refunds,
    category: categoryNames.get(typeof metadata.category_id === "string" ? metadata.category_id : "")
      ?? (typeof metadata.category === "string" ? metadata.category : ""),
    categoryId: typeof metadata.category_id === "string" ? metadata.category_id : "",
    creditAvailable: formatCurrencyAmount(creditAvailableValue, row.currency_code),
    creditAvailableBaseValue: toBase(creditAvailableValue),
    creditAvailableValue,
    creditBalance: formatCurrencyAmount(creditBalanceValue, row.currency_code),
    creditBalanceBaseValue: toBase(creditBalanceValue),
    creditBalanceValue,
    creditLimit: formatCurrencyAmount(creditLimitValue, row.currency_code),
    creditLimitBaseValue: toBase(creditLimitValue),
    creditLimitValue,
    creditMinimumPayment: formatCurrencyAmount(creditMinimumPaymentValue, row.currency_code),
    creditMinimumPaymentValue,
    creditPaymentDueDay,
    creditStatementDay,
    creditUsed: formatCurrencyAmount(creditUsedValue, row.currency_code),
    creditUsedBaseValue: toBase(creditUsedValue),
    creditUsedValue,
    currency: row.currency_code,
    icon: appearance.icon,
    id: row.id,
    institution: typeof metadata.institution === "string" ? metadata.institution : "",
    initialBalanceValue,
    exchangeRateToBase,
    hasExchangeRate: exchangeRateToBase != null,
    lastUpdated: formatDisplayDate(new Date(row.updated_at ?? row.created_at)),
    monthlyBudgetLimit,
    monthlyInflow: formatCurrencyAmount(activity.inflow, row.currency_code),
    monthlyInflowValue: activity.inflow,
    monthlyOutflow: formatCurrencyAmount(activity.outflow, row.currency_code),
    monthlyOutflowValue: activity.outflow,
    mobileBankingAccountNumber,
    name: row.name,
    notes: row.description ?? "",
    pendingCreditValue: activity.pendingInflow,
    pendingDebitValue: activity.pendingOutflow,
    phoneNumber,
    repaymentValue: activity.repayments,
    status,
    tone: appearance.tone,
    transactionCount: activity.transactionCount,
    type,
  };
}

export async function getAccounts(
  supabase: SupabaseClient,
  userId: string,
  options: { asOfDate?: string; limit?: number } = {},
) {
  const asOfTimestamp = options.asOfDate ? `${options.asOfDate}T23:59:59.999Z` : "";
  const [accountRows, transactionRows, debtRows, categoryRows, currencySettings] = await Promise.all([
    fetchSupabaseRows<AccountRow>(
      (from, to) => {
        const query = supabase
          .from("accounts")
          .select("id,name,type,currency_code,initial_balance,description,color,icon,is_active,metadata,created_at,updated_at")
          .eq("user_id", userId)
          .is("deleted_at", null)
          .order("sort_order", { ascending: true })
          .order("created_at", { ascending: true })
          .range(from, to);
        return asOfTimestamp ? query.lte("created_at", asOfTimestamp) : query;
      },
      { limit: options.limit },
    ),
    fetchSupabaseRows<AccountTransactionRow>((from, to) => {
      const query = supabase
        .from("transactions")
        .select("account_id,transfer_account_id,amount,type,metadata,status,related_entity_id,related_entity_type,transaction_date")
        .eq("user_id", userId)
        .is("deleted_at", null)
        .order("created_at", { ascending: true })
        .range(from, to);
      return options.asOfDate ? query.lte("transaction_date", options.asOfDate) : query;
    }),
    fetchSupabaseRows<AccountDebtRow>((from, to) => {
      const query = supabase
        .from("debts")
        .select("id,payment_account_id,total_amount,repaid_amount,type,metadata,start_date,created_at")
        .eq("user_id", userId)
        .is("deleted_at", null)
        .order("created_at", { ascending: true })
        .range(from, to);
      return asOfTimestamp ? query.lte("created_at", asOfTimestamp) : query;
    }),
    fetchSupabaseRows<{ id: string; name: string }>((from, to) => supabase
      .from("categories")
      .select("id,name")
      .eq("user_id", userId)
      .is("deleted_at", null)
      .order("created_at", { ascending: true })
      .range(from, to)),
    getCurrencySettings(supabase, userId, options.asOfDate),
  ]);

  const datedDebtRows = options.asOfDate
    ? debtRows.filter((debt) => {
      const metadata = metadataRecord(debt.metadata);
      const startDate = debt.start_date ?? (typeof metadata.start_date === "string" ? metadata.start_date.slice(0, 10) : "");
      return !startDate || startDate <= options.asOfDate!;
    })
    : debtRows;
  const transactions = transactionRows.map((transaction) => ({
    ...transaction,
    metadata: deriveCreditCardDebtMetadata(transaction, datedDebtRows, accountRows),
  }));
  const activities = buildAccountLedgerActivities(transactions, accountRows);
  const accountById = new Map(accountRows.map((account) => [account.id, account]));
  for (const [accountId, openingBalance] of creditCardOpeningBalancesByAccount(datedDebtRows)) {
    const account = accountById.get(accountId);
    if (!account || normalizeTypeKey(account.type) !== "credit_card") continue;
    const activity = activities.get(accountId) ?? emptyActivity();
    activity.creditUsed = roundCurrencyValue(activity.creditUsed + openingBalance);
    activities.set(accountId, activity);
  }
  const categoryNames = new Map(categoryRows.map((category) => [category.id, category.name]));
  return accountRows.map((account) => mapAccount(
    account,
    activities.get(account.id),
    categoryNames,
    currencySettings,
    options.asOfDate,
  ));
}

export async function getAccount(supabase: SupabaseClient, userId: string, accountId: string) {
  const accounts = await getAccounts(supabase, userId);
  return accounts.find((account) => account.id === accountId) ?? null;
}

/**
 * Canonical account position used by Account Lookup. This balance-sheet value
 * is deliberately distinct from a filtered transaction-type Net: it includes
 * current working balances and card liabilities, but excludes standard debts
 * and lending receivables that are tracked on the Debts page.
 */
export function summarizeAccountPosition(accounts: AccountRecord[]) {
  const currentAccounts = accounts.filter((account) => accountStatusContributesToCurrentTotals(account.status));
  return summarizeFinancialPosition({
    cashBalances: currentAccounts
      .filter((account) => account.type !== "Credit Card")
      .map((account) => account.balanceBaseValue),
    creditCardBalances: currentAccounts
      .filter((account) => account.type === "Credit Card")
      .map((account) => account.creditUsedBaseValue - account.creditBalanceBaseValue),
  });
}

export function getAccountSummaries(accounts: AccountRecord[]): SummaryMetric[] {
  const activeAccounts = accounts.filter((account) => accountStatusContributesToCurrentTotals(account.status));
  const activeCashAccounts = activeAccounts.filter((account) => account.type !== "Credit Card");
  const activeCreditCards = activeAccounts.filter((account) => account.type === "Credit Card");
  const baseCurrency = activeAccounts[0]?.baseCurrency ?? "MMK";
  const amountTypeTotals = new Map<string, number>();
  for (const account of activeCashAccounts) {
    for (const breakdown of account.balanceBreakdowns) {
      const convertedValue = convertToBaseCurrency(
        breakdown.amountValue,
        account.currency,
        {
          baseCurrency: account.baseCurrency,
          rates: account.exchangeRateToBase == null ? [] : [{
            currencyCode: account.currency,
            effectiveDate: "0001-01-01",
            rateToBase: account.exchangeRateToBase,
          }],
        },
      ) ?? 0;
      amountTypeTotals.set(breakdown.type, roundCurrencyValue((amountTypeTotals.get(breakdown.type) ?? 0) + convertedValue));
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
    value: formatCurrencyAmount(amountValue, baseCurrency),
    ...summaryStyles[index % summaryStyles.length],
  }));

  if (activeCreditCards.length > 0) {
    const creditLimit = activeCreditCards.reduce((sum, account) => sum + account.creditLimitBaseValue, 0);
    const creditUsed = activeCreditCards.reduce((sum, account) => sum + account.creditUsedBaseValue, 0);
    const creditBalance = activeCreditCards.reduce((sum, account) => sum + account.creditBalanceBaseValue, 0);
    const creditAvailable = activeCreditCards.reduce((sum, account) => sum + account.creditAvailableBaseValue, 0);
    summaries.push(
      { label: "Credit Used", value: formatCurrencyAmount(creditUsed, baseCurrency), icon: "credit", tone: "text-[#b42318]", bg: "bg-[#fff1f0]" },
      { label: "Available Credit", value: formatCurrencyAmount(creditAvailable, baseCurrency), icon: "credit", tone: "text-[#0058be]", bg: "bg-[#eff6ff]" },
      { label: "Credit Limit", value: formatCurrencyAmount(creditLimit, baseCurrency), icon: "timeline", tone: "text-[#4f46e5]", bg: "bg-[#eef2ff]" },
    );
    if (creditBalance > 0) {
      summaries.push({ label: "Card Credit", value: formatCurrencyAmount(creditBalance, baseCurrency), icon: "savings", tone: "text-[#047857]", bg: "bg-[#ecfdf5]" });
    }
  }

  return summaries.length > 0
    ? summaries
    : [{ label: "No Amount Types", value: formatCurrencyAmount(0, baseCurrency), icon: "account", tone: "text-[#45464d]", bg: "bg-[#f8f9ff]" }];
}
