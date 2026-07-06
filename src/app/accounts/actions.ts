"use server";

import { revalidatePath } from "next/cache";

import type { AccountFormData } from "@/lib/accounts/supabase";
import { createClient } from "@/lib/supabase/server";
import { getUserSafely } from "@/lib/supabase/auth";

type ActionResult = { error?: string };
type DebtTermRow = {
  id: string;
  metadata: unknown;
  status: string | null;
};

type AccountAmountTypeTransactionRow = {
  account_id: string | null;
  id: string;
  metadata: unknown;
  transfer_account_id: string | null;
};

type AmountTypeEntry = {
  index: number;
  key: string;
  type: string;
};

type AmountTypeMigration = {
  from: string;
  fromKey: string;
  to: string;
};

const databaseTypes: Record<AccountFormData["type"], string> = {
  "Bank Account": "bank_account",
  "Cash Wallet": "cash",
  "Credit Card": "credit_card",
  "Digital Wallet": "digital_wallet",
  Savings: "savings",
};

async function authenticatedClient() {
  const supabase = await createClient();
  const { user } = await getUserSafely(supabase);
  return { supabase, user };
}

function metadataRecord(metadata: unknown) {
  return metadata && typeof metadata === "object" && !Array.isArray(metadata)
    ? metadata as Record<string, unknown>
    : {};
}

function metadataArray(value: unknown) {
  return Array.isArray(value) ? value : [];
}

function hasManualCreditCardTerms(metadata: Record<string, unknown>) {
  return metadata.manual_credit_card_terms === true || metadata.auto_credit_card_terms === false;
}

function formatDateInput(value: Date) {
  if (Number.isNaN(value.getTime())) return "";
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`;
}

function daysInMonth(year: number, monthIndex: number) {
  return new Date(year, monthIndex + 1, 0).getDate();
}

function dateForDay(year: number, monthIndex: number, day: number) {
  return new Date(year, monthIndex, Math.min(day, daysInMonth(year, monthIndex)));
}

function nextMonthlyDateForDay(day: number) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const candidate = dateForDay(today.getFullYear(), today.getMonth(), day);
  return candidate < today ? dateForDay(today.getFullYear(), today.getMonth() + 1, day) : candidate;
}

function creditLimitValue(input: AccountFormData) {
  return input.creditLimit ?? input.monthlyBudgetLimit;
}

function amountTypeKey(value: unknown) {
  return String(value ?? "").trim().toLowerCase();
}

function activeAmountTypeEntries(amountTypes: { type: string }[]): AmountTypeEntry[] {
  return amountTypes
    .map((item, index) => ({ index, key: amountTypeKey(item.type), type: item.type.trim() }))
    .filter((item) => item.type !== "");
}

function storedAmountTypeEntries(metadata: Record<string, unknown>): AmountTypeEntry[] {
  if (!Array.isArray(metadata.amount_types)) return [];

  return metadata.amount_types
    .map((item, index) => {
      const amountType = metadataRecord(item).type;
      const type = typeof amountType === "string" ? amountType.trim() : "";
      return { index, key: amountTypeKey(type), type };
    })
    .filter((item) => item.type !== "");
}

function amountTypeMigrationTargets(existingMetadata: Record<string, unknown>, amountTypes: { type: string }[]) {
  const existingAmountTypes = storedAmountTypeEntries(existingMetadata);
  const nextAmountTypes = activeAmountTypeEntries(amountTypes);
  if (existingAmountTypes.length === 0 || nextAmountTypes.length === 0) return [];

  const existingKeys = new Set(existingAmountTypes.map((item) => item.key));
  const nextKeys = new Set(nextAmountTypes.map((item) => item.key));
  const addedKeys = new Set(nextAmountTypes.filter((item) => !existingKeys.has(item.key)).map((item) => item.key));
  const fallbackAmountType = nextAmountTypes[0]?.type ?? "General";

  return existingAmountTypes.flatMap<AmountTypeMigration>((item) => {
    if (nextKeys.has(item.key)) return [];

    const sameIndexTarget = nextAmountTypes[item.index];
    const to = sameIndexTarget && addedKeys.has(sameIndexTarget.key)
      ? sameIndexTarget.type
      : fallbackAmountType;

    return [{ from: item.type, fromKey: item.key, to }];
  });
}

function activeAmountTypeOrFallback(value: unknown, amountTypes: { type: string }[]) {
  const nextAmountTypes = activeAmountTypeEntries(amountTypes);
  if (nextAmountTypes.length === 0) return null;

  const nextByKey = new Map(nextAmountTypes.map((item) => [item.key, item.type]));
  return nextByKey.get(amountTypeKey(value)) ?? nextAmountTypes[0].type;
}

function amountTypePayload(amountTypes: { type: string }[], existingMetadata: Record<string, unknown>) {
  const existingAmountTypes = Array.isArray(existingMetadata.amount_types)
    ? existingMetadata.amount_types.map((item) => metadataRecord(item))
    : [];
  const existingByType = new Map(existingAmountTypes.map((item) => [amountTypeKey(item.type), item]));
  const amountValueKeys = ["amountValue", "amount_value", "amount", "balanceValue", "balance_value", "balance", "initialBalance", "initial_balance"];

  return amountTypes.map((item) => {
    const type = item.type.trim();
    const existing = existingByType.get(amountTypeKey(type));
    const preservedAmounts = Object.fromEntries(
      amountValueKeys
        .filter((key) => existing?.[key] != null)
        .map((key) => [key, existing?.[key]]),
    );
    return { ...preservedAmounts, type };
  });
}

function accountPayload(input: AccountFormData, options: { existingMetadata?: Record<string, unknown>; includeInitialBalance?: boolean } = {}) {
  const creditLimit = input.type === "Credit Card" ? creditLimitValue(input) : null;
  const monthlyBudgetLimit = input.type === "Credit Card" ? creditLimit : input.monthlyBudgetLimit;
  const existingMetadata = options.existingMetadata ?? {};
  const openingBalanceAmountType = activeAmountTypeOrFallback(existingMetadata.opening_balance_amount_type, input.amountTypes);
  const amountTypeKeys = new Set(activeAmountTypeEntries(input.amountTypes).map((item) => item.key));

  return {
    currency_code: input.currency,
    description: input.notes.trim() || null,
    ...(options.includeInitialBalance === false ? {} : { initial_balance: 0 }),
    is_active: input.status !== "Archived",
    metadata: {
      account_number: input.accountNumber.trim(),
      amount_types: amountTypePayload(input.amountTypes, existingMetadata),
      available_balance: existingMetadata.available_balance ?? 0,
      bank_book_account_number: input.bankBookAccountNumber.trim(),
      card_expiry_code: input.cardExpiryCode.trim(),
      card_number: input.cardNumber.trim(),
      card_security_code: input.cardSecurityCode.trim(),
      card_type: input.cardType,
      category: input.category,
      credit_limit: creditLimit,
      credit_minimum_payment: input.type === "Credit Card" ? input.creditMinimumPayment : null,
      credit_payment_due_day: input.type === "Credit Card" ? input.creditPaymentDueDay : null,
      credit_statement_day: input.type === "Credit Card" ? input.creditStatementDay : null,
      institution: input.institution.trim(),
      monthly_budget_limit: monthlyBudgetLimit,
      mobile_banking_account_number: input.mobileBankingAccountNumber.trim(),
      opening_balance_amount_type: openingBalanceAmountType,
      operation_amount: amountTypeKeys.has(amountTypeKey("Operation")) ? existingMetadata.operation_amount ?? null : null,
      phone_number: input.phoneNumber.trim(),
      saving_amount: amountTypeKeys.has(amountTypeKey("Saving")) ? existingMetadata.saving_amount ?? null : null,
      status: input.status,
    },
    name: input.name.trim(),
    type: databaseTypes[input.type],
  };
}

function validateAccountInput(input: AccountFormData) {
  if (input.type !== "Credit Card") {
    const amountTypes = activeAmountTypeEntries(input.amountTypes);
    if (amountTypes.length === 0 || amountTypes.length !== input.amountTypes.length) {
      return "Each amount type needs a name.";
    }

    const uniqueAmountTypeKeys = new Set(amountTypes.map((item) => item.key));
    if (uniqueAmountTypeKeys.size !== amountTypes.length) {
      return "Amount type names must be unique.";
    }
  }

  if (input.type === "Credit Card") {
    const creditLimit = creditLimitValue(input);
    if (creditLimit == null || !Number.isFinite(creditLimit) || creditLimit <= 0) {
      return "Credit card accounts require a credit limit greater than zero.";
    }
    if (input.creditMinimumPayment != null && (!Number.isFinite(input.creditMinimumPayment) || input.creditMinimumPayment < 0)) {
      return "Credit card minimum payment cannot be negative.";
    }
    if (input.creditStatementDay != null && (!Number.isInteger(input.creditStatementDay) || input.creditStatementDay < 1 || input.creditStatementDay > 31)) {
      return "Credit card statement day must be between 1 and 31.";
    }
    if (input.creditPaymentDueDay != null && (!Number.isInteger(input.creditPaymentDueDay) || input.creditPaymentDueDay < 1 || input.creditPaymentDueDay > 31)) {
      return "Credit card payment due day must be between 1 and 31.";
    }
    if (input.cardType === "No Card" || !input.cardNumber.trim() || !input.cardSecurityCode.trim() || !input.cardExpiryCode.trim()) {
      return "Credit card accounts require card type, card number, security code, and expiry code.";
    }
  }

  return null;
}

function migratedAmountType(value: unknown, migrations: AmountTypeMigration[]) {
  const migration = migrations.find((item) => item.fromKey === amountTypeKey(value));
  return migration?.to ?? null;
}

async function migrateRemovedAmountTypeTransactions(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  accountId: string,
  migrations: AmountTypeMigration[],
) {
  if (migrations.length === 0) return null;

  const { data, error } = await supabase
    .from("transactions")
    .select("id,account_id,transfer_account_id,metadata")
    .eq("user_id", userId)
    .is("deleted_at", null)
    .or(`account_id.eq.${accountId},transfer_account_id.eq.${accountId},metadata->>counter_account_id.eq.${accountId},metadata->>transfer_account_id.eq.${accountId}`);

  if (error) return error.message;

  const migratedAt = new Date().toISOString();
  for (const transaction of data as AccountAmountTypeTransactionRow[]) {
    const metadata = metadataRecord(transaction.metadata);
    const nextMetadata = { ...metadata };
    const changedFields: Array<{ field: string; from: string; to: string }> = [];
    const transferAccountId = transaction.transfer_account_id ?? (typeof metadata.transfer_account_id === "string" ? metadata.transfer_account_id : null);
    const isSameAccountTransfer = Boolean(transaction.account_id && transferAccountId && transaction.account_id === transferAccountId);

    function wouldViolateSameAccountTransfer(candidateMetadata: Record<string, unknown>) {
      if (!isSameAccountTransfer) return false;
      const accountAmountType = String(candidateMetadata.account_amount_type ?? "").trim();
      const transferAmountType = String(candidateMetadata.transfer_account_amount_type ?? "").trim();
      return accountAmountType !== "" && transferAmountType !== "" && amountTypeKey(accountAmountType) === amountTypeKey(transferAmountType);
    }

    function migrateField(field: "account_amount_type" | "counter_account_amount_type" | "transfer_account_amount_type") {
      const nextAmountType = migratedAmountType(nextMetadata[field], migrations);
      if (!nextAmountType) return;
      const candidateMetadata = { ...nextMetadata, [field]: nextAmountType };
      if (wouldViolateSameAccountTransfer(candidateMetadata)) return;
      if (
        isSameAccountTransfer
        && field === "counter_account_amount_type"
        && nextMetadata.transfer_account_amount_type != null
        && amountTypeKey(nextMetadata.transfer_account_amount_type) !== amountTypeKey(nextAmountType)
      ) {
        return;
      }
      const previousAmountType = String(nextMetadata[field] ?? "").trim();
      nextMetadata[field] = nextAmountType;
      changedFields.push({ field, from: previousAmountType, to: nextAmountType });
    }

    if (transaction.account_id === accountId) migrateField("account_amount_type");
    if (transaction.transfer_account_id === accountId || metadata.transfer_account_id === accountId) {
      migrateField("transfer_account_amount_type");
      migrateField("counter_account_amount_type");
    }
    if (metadata.counter_account_id === accountId) migrateField("counter_account_amount_type");

    if (changedFields.length === 0) continue;

    nextMetadata.amount_type_migration_history = [
      ...metadataArray(metadata.amount_type_migration_history).slice(-20),
      ...changedFields.map((change) => ({
        account_id: accountId,
        field: change.field,
        from: change.from,
        migrated_at: migratedAt,
        reason: "account_amount_type_removed",
        to: change.to,
      })),
    ];

    const updateResult = await supabase
      .from("transactions")
      .update({ metadata: nextMetadata })
      .eq("id", transaction.id)
      .eq("user_id", userId);
    if (updateResult.error) return updateResult.error.message;
  }

  return null;
}

async function syncCreditCardDebtTerms(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  accountId: string,
  input: AccountFormData,
) {
  if (input.type !== "Credit Card") return null;

  const { data, error } = await supabase
    .from("debts")
    .select("id,status,metadata")
    .eq("user_id", userId)
    .is("deleted_at", null)
    .or(`metadata->>credit_card_account_id.eq.${accountId},metadata->>auto_credit_card_account_id.eq.${accountId}`);

  if (error) return error.message;
  const creditLimit = creditLimitValue(input);
  const minimumPayment = input.creditMinimumPayment ?? 0;
  const nextPaymentDate = input.creditPaymentDueDay ? formatDateInput(nextMonthlyDateForDay(input.creditPaymentDueDay)) : null;

  for (const debt of data as DebtTermRow[]) {
    const metadata = metadataRecord(debt.metadata);
    const status = String(debt.status ?? metadata.status ?? "").toLowerCase();
    if (status === "paid" || status === "archived") continue;
    const isManualTerms = hasManualCreditCardTerms(metadata);

    const payload = {
      metadata: {
        ...metadata,
        auto_credit_card_account_id: accountId,
        credit_card_account_id: accountId,
        credit_limit: creditLimit,
        credit_minimum_payment: minimumPayment,
        credit_payment_due_day: input.creditPaymentDueDay,
        credit_statement_day: input.creditStatementDay,
        lender: input.name.trim() || metadata.lender,
        payment_account_id: accountId,
        ...(isManualTerms ? {} : { duration_months: 1, requires_full_payment: true }),
        ...(nextPaymentDate ? { next_payment_date: nextPaymentDate } : {}),
      },
      ...(nextPaymentDate ? { next_payment_date: nextPaymentDate } : {}),
      payment_account_id: accountId,
    };
    const updateResult = await supabase.from("debts").update(payload).eq("id", debt.id).eq("user_id", userId);
    if (updateResult.error) return updateResult.error.message;
  }

  return null;
}

export async function createAccount(input: AccountFormData): Promise<ActionResult> {
  const { supabase, user } = await authenticatedClient();
  if (!user) return { error: "You must be signed in." };
  const validationError = validateAccountInput(input);
  if (validationError) return { error: validationError };

  const { error } = await supabase.from("accounts").insert({ ...accountPayload(input), user_id: user.id });
  if (error) return { error: error.message };

  revalidatePath("/accounts");
  revalidatePath("/debts");
  revalidatePath("/dashboard");
  revalidatePath("/reports");
  return {};
}

export async function updateAccount(accountId: string, input: AccountFormData): Promise<ActionResult> {
  const { supabase, user } = await authenticatedClient();
  if (!user) return { error: "You must be signed in." };
  const validationError = validateAccountInput(input);
  if (validationError) return { error: validationError };

  const { data: existingAccount, error: existingError } = await supabase
    .from("accounts")
    .select("id,metadata")
    .eq("id", accountId)
    .eq("user_id", user.id)
    .is("deleted_at", null)
    .maybeSingle();
  if (existingError) return { error: existingError.message };
  if (!existingAccount) return { error: "Account not found." };

  const existingMetadata = metadataRecord(existingAccount.metadata);
  const amountTypeMigrations = amountTypeMigrationTargets(existingMetadata, input.amountTypes);
  const { data, error } = await supabase
    .from("accounts")
    .update(accountPayload(input, { existingMetadata, includeInitialBalance: false }))
    .eq("id", accountId)
    .eq("user_id", user.id)
    .select("id")
    .maybeSingle();
  if (error) return { error: error.message };
  if (!data) return { error: "Account not found." };
  const migrationError = await migrateRemovedAmountTypeTransactions(supabase, user.id, accountId, amountTypeMigrations);
  if (migrationError) return { error: migrationError };
  const syncError = await syncCreditCardDebtTerms(supabase, user.id, accountId, input);
  if (syncError) return { error: syncError };

  revalidatePath("/accounts");
  revalidatePath("/debts");
  revalidatePath("/dashboard");
  revalidatePath("/reports");
  revalidatePath("/transactions");
  revalidatePath(`/accounts/${accountId}/edit`);
  return {};
}

export async function deleteAccount(accountId: string): Promise<ActionResult> {
  const { supabase, user } = await authenticatedClient();
  if (!user) return { error: "You must be signed in." };

  const { data, error } = await supabase
    .from("accounts")
    .update({ deleted_at: new Date().toISOString(), is_active: false })
    .eq("id", accountId)
    .eq("user_id", user.id)
    .select("id")
    .maybeSingle();
  if (error) return { error: error.message };
  if (!data) return { error: "Account not found." };

  revalidatePath("/accounts");
  return {};
}
