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

function accountPayload(input: AccountFormData) {
  const creditLimit = input.type === "Credit Card" ? creditLimitValue(input) : null;
  const monthlyBudgetLimit = input.type === "Credit Card" ? creditLimit : input.monthlyBudgetLimit;

  return {
    currency_code: input.currency,
    description: input.notes.trim() || null,
    initial_balance: 0,
    is_active: input.status !== "Archived",
    metadata: {
      account_number: input.accountNumber.trim(),
      amount_types: input.amountTypes.map((item) => ({ type: item.type.trim() })),
      available_balance: 0,
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
      operation_amount: null,
      phone_number: input.phoneNumber.trim(),
      saving_amount: null,
      status: input.status,
    },
    name: input.name.trim(),
    type: databaseTypes[input.type],
  };
}

function validateAccountInput(input: AccountFormData) {
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
        monthly_payment: minimumPayment,
        payment_account_id: accountId,
        ...(nextPaymentDate ? { next_payment_date: nextPaymentDate } : {}),
      },
      monthly_payment: minimumPayment,
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

  const { data, error } = await supabase
    .from("accounts")
    .update(accountPayload(input))
    .eq("id", accountId)
    .eq("user_id", user.id)
    .select("id")
    .maybeSingle();
  if (error) return { error: error.message };
  if (!data) return { error: "Account not found." };
  const syncError = await syncCreditCardDebtTerms(supabase, user.id, accountId, input);
  if (syncError) return { error: syncError };

  revalidatePath("/accounts");
  revalidatePath("/debts");
  revalidatePath("/dashboard");
  revalidatePath("/reports");
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
