"use server";

import { revalidatePath } from "next/cache";

import { nextCreditCardPaymentDate } from "@/lib/accounts/credit-card-dates";
import { accountArchivalIntegrityError } from "@/lib/accounts/archive-integrity";
import { categoryRowSupports } from "@/lib/categories/category-scopes";
import { getAccounts, type AccountFormData } from "@/lib/accounts/supabase";
import { accountTypeChangesLedgerMeaning } from "@/lib/accounts/type-integrity";
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

function revalidateAccountPaths(extraPaths: string[] = []) {
  for (const path of [
    "/accounts",
    "/assets",
    "/categories",
    "/dashboard",
    "/debts",
    "/future-planning",
    "/people-payments",
    "/reports",
    "/savings-goals",
    "/scenario-budgeting",
    "/subscriptions",
    "/transactions",
    ...extraPaths,
  ]) revalidatePath(path);
}

async function getAccountUsage(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  accountId: string,
) {
  const results = await Promise.all([
    supabase
      .from("transactions")
      .select("id")
      .eq("user_id", userId)
      .or(`account_id.eq.${accountId},transfer_account_id.eq.${accountId},metadata->>credit_card_account_id.eq.${accountId}`)
      .limit(1),
    supabase.from("assets").select("id").eq("user_id", userId).eq("account_id", accountId).limit(1),
    supabase
      .from("debts")
      .select("id")
      .eq("user_id", userId)
      .or(`account_id.eq.${accountId},payment_account_id.eq.${accountId},metadata->>credit_card_account_id.eq.${accountId},metadata->>auto_credit_card_account_id.eq.${accountId}`)
      .limit(1),
    supabase.from("savings_goals").select("id").eq("user_id", userId).eq("account_id", accountId).limit(1),
    supabase.from("subscriptions").select("id").eq("user_id", userId).eq("account_id", accountId).limit(1),
    supabase.from("scenario_items").select("id").eq("user_id", userId).eq("account_id", accountId).limit(1),
    supabase.from("user_settings").select("user_id").eq("user_id", userId).eq("default_account_id", accountId).limit(1),
  ]);
  const usageError = results.find((result) => result.error)?.error;

  return {
    error: usageError?.message,
    isUsed: results.some((result) => (result.data?.length ?? 0) > 0),
  };
}

function normalizedStatus(value: unknown) {
  return String(value ?? "").trim().toLowerCase();
}

async function activeAccountDependents(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  accountId: string,
) {
  const [transactionsResult, assetsResult, debtsResult, goalsResult, subscriptionsResult, scenarioItemsResult, settingsResult] = await Promise.all([
    supabase
      .from("transactions")
      .select("id,status,metadata")
      .eq("user_id", userId)
      .ilike("status", "scheduled")
      .is("deleted_at", null)
      .or(`account_id.eq.${accountId},transfer_account_id.eq.${accountId},metadata->>credit_card_account_id.eq.${accountId}`),
    supabase.from("assets").select("id,status,metadata").eq("user_id", userId).eq("account_id", accountId).is("deleted_at", null),
    supabase
      .from("debts")
      .select("id,status,metadata")
      .eq("user_id", userId)
      .is("deleted_at", null)
      .or(`account_id.eq.${accountId},payment_account_id.eq.${accountId},metadata->>credit_card_account_id.eq.${accountId},metadata->>auto_credit_card_account_id.eq.${accountId}`),
    supabase.from("savings_goals").select("id,status,metadata").eq("user_id", userId).eq("account_id", accountId).is("deleted_at", null),
    supabase.from("subscriptions").select("id,status,metadata").eq("user_id", userId).eq("account_id", accountId).is("deleted_at", null),
    supabase.from("scenario_items").select("id,scenario_id").eq("user_id", userId).eq("account_id", accountId),
    supabase.from("user_settings").select("user_id").eq("user_id", userId).eq("default_account_id", accountId).limit(1),
  ]);
  const firstError = [transactionsResult, assetsResult, debtsResult, goalsResult, subscriptionsResult, scenarioItemsResult, settingsResult]
    .find((result) => result.error)?.error;
  if (firstError) return { dependencies: [] as string[], error: firstError.message };

  const dependencies: string[] = [];
  const hasScheduledTransaction = (transactionsResult.data ?? []).some((transaction) => {
    if (normalizedStatus(transaction.status) !== "scheduled") return false;
    return normalizedStatus(metadataRecord(transaction.metadata).future_status || "active") !== "paused";
  });
  if (hasScheduledTransaction) dependencies.push("scheduled transactions");
  if ((assetsResult.data ?? []).some((asset) => normalizedStatus(asset.status || metadataRecord(asset.metadata).status) === "active")) {
    dependencies.push("active assets");
  }
  if ((debtsResult.data ?? []).some((debt) => !["archived", "cancelled", "canceled", "completed", "paid"].includes(normalizedStatus(debt.status || metadataRecord(debt.metadata).status)))) {
    dependencies.push("active debts");
  }
  if ((goalsResult.data ?? []).some((goal) => !["archived", "completed"].includes(normalizedStatus(goal.status || metadataRecord(goal.metadata).status)))) {
    dependencies.push("active savings goals");
  }
  if ((subscriptionsResult.data ?? []).some((subscription) => ["active", "expiring"].includes(normalizedStatus(subscription.status || metadataRecord(subscription.metadata).status)))) {
    dependencies.push("active subscriptions");
  }

  const scenarioIds = Array.from(new Set((scenarioItemsResult.data ?? []).map((item) => item.scenario_id).filter(Boolean)));
  if (scenarioIds.length > 0) {
    const { data: scenarios, error: scenariosError } = await supabase
      .from("financial_scenarios")
      .select("id,status")
      .eq("user_id", userId)
      .is("deleted_at", null)
      .in("id", scenarioIds);
    if (scenariosError) return { dependencies: [], error: scenariosError.message };
    if ((scenarios ?? []).some((scenario) => ["active", "running", "scheduled"].includes(normalizedStatus(scenario.status)))) {
      dependencies.push("active scenarios");
    }
  }
  if ((settingsResult.data?.length ?? 0) > 0) dependencies.push("the default account setting");
  return { dependencies, error: "" };
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
      category_id: input.categoryId,
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
  if (!input.categoryId) return "Select an account category.";
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

async function validateAccountCategory(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  categoryId: string,
  allowInactive = false,
) {
  const { data, error } = await supabase
    .from("categories")
    .select("id,name,is_active,type,metadata")
    .eq("id", categoryId)
    .eq("user_id", userId)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) return { error: error.message, name: "" };
  if (!data || (!allowInactive && data.is_active === false) || !categoryRowSupports(data, "Accounts", "Account")) {
    return { error: "Select an active account category.", name: "" };
  }
  return { error: "", name: data.name };
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
  previousAccountMetadata: Record<string, unknown>,
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
  const nextPaymentDate = nextCreditCardPaymentDate({
    paymentDueDay: input.creditPaymentDueDay,
    referenceDate: new Date(),
    statementDay: input.creditStatementDay,
  }) || null;
  const billingTermsChanged = Number(previousAccountMetadata.credit_payment_due_day ?? 0) !== Number(input.creditPaymentDueDay ?? 0)
    || Number(previousAccountMetadata.credit_statement_day ?? 0) !== Number(input.creditStatementDay ?? 0);

  for (const debt of data as DebtTermRow[]) {
    const metadata = metadataRecord(debt.metadata);
    const status = String(debt.status ?? metadata.status ?? "").toLowerCase();
    if (status === "archived") continue;
    const isManualTerms = hasManualCreditCardTerms(metadata);
    const shouldWriteDueDate = status !== "paid" && billingTermsChanged;

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
        ...(shouldWriteDueDate && (!isManualTerms || nextPaymentDate) ? { next_payment_date: nextPaymentDate } : {}),
      },
      ...(shouldWriteDueDate && (!isManualTerms || nextPaymentDate) ? { next_payment_date: nextPaymentDate } : {}),
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
  const category = await validateAccountCategory(supabase, user.id, input.categoryId);
  if (category.error) return { error: category.error };

  const { error } = await supabase.from("accounts").insert({ ...accountPayload({ ...input, category: category.name }), user_id: user.id });
  if (error) return { error: error.message };

  revalidateAccountPaths();
  return {};
}

export async function updateAccount(accountId: string, input: AccountFormData): Promise<ActionResult> {
  const { supabase, user } = await authenticatedClient();
  if (!user) return { error: "You must be signed in." };
  const validationError = validateAccountInput(input);
  if (validationError) return { error: validationError };
  const category = await validateAccountCategory(supabase, user.id, input.categoryId, input.status === "Archived");
  if (category.error) return { error: category.error };
  const validatedInput = { ...input, category: category.name };

  const { data: existingAccount, error: existingError } = await supabase
    .from("accounts")
    .select("id,is_active,metadata,type")
    .eq("id", accountId)
    .eq("user_id", user.id)
    .is("deleted_at", null)
    .maybeSingle();
  if (existingError) return { error: existingError.message };
  if (!existingAccount) return { error: "Account not found." };

  if (validatedInput.status === "Archived" && existingAccount.is_active !== false) {
    let account;
    try {
      account = (await getAccounts(supabase, user.id)).find((item) => item.id === accountId);
    } catch (error) {
      return { error: error instanceof Error ? error.message : "Unable to reconcile the account before archiving it." };
    }
    if (!account) return { error: "Account not found." };
    const dependents = await activeAccountDependents(supabase, user.id, accountId);
    if (dependents.error) return { error: dependents.error };
    const archiveError = accountArchivalIntegrityError(account, dependents.dependencies);
    if (archiveError) return { error: archiveError };
  }

  if (accountTypeChangesLedgerMeaning(existingAccount.type, databaseTypes[validatedInput.type])) {
    const usage = await getAccountUsage(supabase, user.id, accountId);
    if (usage.error) return { error: usage.error };
    if (usage.isUsed) {
      return {
        error: "This account has financial history or linked records, so it cannot change between a credit card and a cash account. Create a new account with the correct type and archive this one instead.",
      };
    }
  }

  const existingMetadata = metadataRecord(existingAccount.metadata);
  const amountTypeMigrations = amountTypeMigrationTargets(existingMetadata, validatedInput.amountTypes);
  const { data, error } = await supabase
    .from("accounts")
    .update(accountPayload(validatedInput, { existingMetadata, includeInitialBalance: false }))
    .eq("id", accountId)
    .eq("user_id", user.id)
    .select("id")
    .maybeSingle();
  if (error) return { error: error.message };
  if (!data) return { error: "Account not found." };
  const migrationError = await migrateRemovedAmountTypeTransactions(supabase, user.id, accountId, amountTypeMigrations);
  if (migrationError) return { error: migrationError };
  const syncError = await syncCreditCardDebtTerms(supabase, user.id, accountId, validatedInput, existingMetadata);
  if (syncError) return { error: syncError };

  revalidateAccountPaths([`/accounts/${accountId}/edit`]);
  return {};
}

export async function deleteAccount(accountId: string): Promise<ActionResult> {
  const { supabase, user } = await authenticatedClient();
  if (!user) return { error: "You must be signed in." };

  const usage = await getAccountUsage(supabase, user.id, accountId);
  if (usage.error) return { error: usage.error };
  if (usage.isUsed) {
    return { error: "This account has financial history or linked records and cannot be deleted. Change its status to Archived instead." };
  }

  const { data, error } = await supabase
    .from("accounts")
    .update({ deleted_at: new Date().toISOString(), is_active: false })
    .eq("id", accountId)
    .eq("user_id", user.id)
    .select("id")
    .maybeSingle();
  if (error) {
    return {
      error: error.code === "23503"
        ? "This account has financial history or linked records and cannot be deleted. Change its status to Archived instead."
        : error.message,
    };
  }
  if (!data) return { error: "Account not found." };

  revalidateAccountPaths();
  return {};
}
