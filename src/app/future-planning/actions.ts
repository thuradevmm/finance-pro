"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";

import { getFutureOccurrenceDates, type FutureTransactionFormData } from "@/lib/future-planning/records";
import { isCreditCardType } from "@/lib/ledger";
import { accountStatusContributesToCurrentTotals } from "@/lib/accounts/financial-status";
import { getUserSafely } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/server";

type ActionResult = {
  createdCount?: number;
  error?: string;
};

const recurrenceOptions = new Set(["Monthly", "Once", "Weekly", "Yearly"]);
const statusOptions = new Set(["Active", "Paused"]);
const typeOptions = new Set(["Expense", "Income"]);

function metadataRecord(metadata: unknown) {
  return metadata && typeof metadata === "object" && !Array.isArray(metadata)
    ? metadata as Record<string, unknown>
    : {};
}

function validDate(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return date.getFullYear() === Number(match[1]) && date.getMonth() === Number(match[2]) - 1 && date.getDate() === Number(match[3]);
}

function validateInput(input: FutureTransactionFormData) {
  if (!input || typeof input !== "object") return "Enter the planned transaction details.";
  if (typeof input.type !== "string"
    || typeof input.recurrence !== "string"
    || typeof input.status !== "string"
    || typeof input.title !== "string"
    || typeof input.accountId !== "string"
    || typeof input.accountAmountType !== "string"
    || typeof input.categoryId !== "string"
    || typeof input.startDate !== "string"
    || typeof input.endDate !== "string"
    || typeof input.note !== "string") return "Enter valid planned transaction details.";
  if (!typeOptions.has(input.type)) return "Future plans support income and expense transactions only.";
  if (!recurrenceOptions.has(input.recurrence)) return "Choose a valid repeat schedule.";
  if (!statusOptions.has(input.status)) return "Choose a valid plan status.";
  if (!input.title?.trim() || input.title.trim().length > 120) return "Enter a title up to 120 characters.";
  if (!Number.isFinite(input.amount) || input.amount <= 0 || input.amount > 1_000_000_000_000_000) return "Enter a valid amount greater than zero.";
  if (!input.accountId?.trim()) return "Choose an account for this plan.";
  if (!input.categoryId?.trim()) return "Choose a category for this plan.";
  if (!input.accountAmountType.trim() || input.accountAmountType.trim().length > 80) return "Choose a valid account amount type.";
  if (!validDate(input.startDate)) return "Choose a valid planned date.";
  if (input.note?.length > 2_000) return "Keep the note under 2,000 characters.";
  if (input.recurrence !== "Once" && !validDate(input.endDate)) return "Choose an end date for the repeating plan.";
  if (input.recurrence !== "Once" && input.endDate < input.startDate) return "The repeat end date must be on or after the first planned date.";
  return "";
}

function normalizedAccountType(value: unknown) {
  return String(value ?? "").trim().toLowerCase().replace(/[\s-]+/g, "_");
}

function accountAmountTypes(account: { metadata: unknown; type: string | null }) {
  if (normalizedAccountType(account.type) === "credit_card") return ["Credit Card"];
  const metadata = metadataRecord(account.metadata);
  const configured = Array.isArray(metadata.amount_types)
    ? metadata.amount_types.flatMap((item) => {
      const itemMetadata = metadataRecord(item);
      return typeof itemMetadata.type === "string" && itemMetadata.type.trim()
        ? [itemMetadata.type.trim()]
        : [];
    })
    : [];
  if (configured.length > 0) return configured;

  const legacy = [
    metadata.operation_amount == null ? "" : "Operation",
    metadata.saving_amount == null ? "" : "Saving",
  ].filter(Boolean);
  return legacy.length > 0 ? legacy : ["General"];
}

function revalidatePlanningPaths() {
  for (const path of ["/future-planning", "/transactions", "/dashboard", "/reports", "/scenario-budgeting"]) {
    revalidatePath(path);
  }
}

async function authenticatedClient() {
  const supabase = await createClient();
  const { user, error } = await getUserSafely(supabase);
  return { authError: error, supabase, user };
}

async function validateOwnedReferences(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  input: Pick<FutureTransactionFormData, "accountAmountType" | "accountId" | "categoryId" | "type">,
) {
  const [accountResult, categoryResult] = await Promise.all([
    supabase.from("accounts").select("id,is_active,type,metadata").eq("id", input.accountId).eq("user_id", userId).is("deleted_at", null).maybeSingle(),
    supabase.from("categories").select("id,is_active,type,metadata").eq("id", input.categoryId).eq("user_id", userId).is("deleted_at", null).maybeSingle(),
  ]);
  const error = accountResult.error ?? categoryResult.error;
  if (error) return error.message;
  if (!accountResult.data) return "The selected account is no longer available.";
  const accountMetadata = metadataRecord(accountResult.data.metadata);
  const accountStatus = accountResult.data.is_active === false
    ? "Archived"
    : accountMetadata.status === "Needs Review" ? "Needs Review" : "Active";
  if (!accountStatusContributesToCurrentTotals(accountStatus)) return "Choose an available account for this plan.";
  if (isCreditCardType(accountResult.data.type) && input.type !== "Expense") return "Credit cards can only be used for planned purchases, not planned cash income.";
  if (!accountAmountTypes(accountResult.data).includes(input.accountAmountType.trim())) return "Choose a valid amount type for the selected account.";
  if (!categoryResult.data) return "The selected category is no longer available.";
  if (categoryResult.data.is_active === false) return "Choose an active category for this plan.";
  const categoryMetadata = metadataRecord(categoryResult.data.metadata);
  const categoryType = String(categoryMetadata.category_type ?? categoryResult.data.type).trim().toLowerCase();
  if (categoryType !== input.type.toLowerCase()) return `Choose an ${input.type.toLowerCase()} category for this plan.`;
  return "";
}

export async function createFutureTransactions(input: FutureTransactionFormData): Promise<ActionResult> {
  const validationError = validateInput(input);
  if (validationError) return { error: validationError };
  const today = new Date().toISOString().slice(0, 10);
  if (input.startDate < today) return { error: "The first planned date cannot be in the past." };

  const { authError, supabase, user } = await authenticatedClient();
  if (authError || !user) return { error: authError ?? "You must be signed in." };

  const referenceError = await validateOwnedReferences(supabase, user.id, input);
  if (referenceError) return { error: referenceError };

  const occurrenceDates = getFutureOccurrenceDates(input, 241);
  if (occurrenceDates.length === 0) return { error: "The plan does not contain a valid occurrence." };
  if (occurrenceDates.length > 240) return { error: "Repeating plans are limited to 240 occurrences. Shorten the date range." };

  const seriesId = randomUUID();
  const title = input.title.trim();
  const note = input.note.trim() || null;
  const { error } = await supabase.from("transactions").insert(occurrenceDates.map((occurrenceDate, index) => ({
    account_id: input.accountId,
    amount: input.amount,
    category_id: input.categoryId,
    description: note,
    metadata: {
      account_amount_type: input.accountAmountType?.trim() || "General",
      future_materialized: true,
      future_occurrence_index: index,
      future_plan: true,
      future_recurrence: "once",
      future_series_end_date: input.recurrence === "Once" ? null : input.endDate,
      future_series_id: seriesId,
      future_series_recurrence: input.recurrence.toLowerCase(),
      future_status: input.status.toLowerCase(),
      transfer_account_amount_type: null,
    },
    note,
    payment_method: null,
    related_entity_id: null,
    related_entity_type: null,
    status: "scheduled",
    title,
    transaction_date: occurrenceDate,
    transfer_account_id: null,
    type: input.type.toLowerCase(),
    user_id: user.id,
  })));

  if (error) return { error: error.message };
  revalidatePlanningPaths();
  return { createdCount: occurrenceDates.length };
}

export async function updateFutureTransaction(transactionId: string, input: FutureTransactionFormData): Promise<ActionResult> {
  const validationError = validateInput({ ...input, endDate: "", recurrence: "Once" });
  if (validationError) return { error: validationError };

  const { authError, supabase, user } = await authenticatedClient();
  if (authError || !user) return { error: authError ?? "You must be signed in." };

  const referenceError = await validateOwnedReferences(supabase, user.id, input);
  if (referenceError) return { error: referenceError };

  const { data: existing, error: findError } = await supabase
    .from("transactions")
    .select("id,status,type,metadata")
    .eq("id", transactionId)
    .eq("user_id", user.id)
    .is("deleted_at", null)
    .maybeSingle();
  if (findError) return { error: findError.message };
  if (!existing || String(existing.status).toLowerCase() !== "scheduled" || !["expense", "income"].includes(String(existing.type).toLowerCase())) {
    return { error: "Scheduled transaction not found." };
  }

  const metadata = metadataRecord(existing.metadata);
  const { data: updated, error } = await supabase
    .from("transactions")
    .update({
      account_id: input.accountId,
      amount: input.amount,
      category_id: input.categoryId,
      description: input.note.trim() || null,
      metadata: {
        ...metadata,
        account_amount_type: input.accountAmountType?.trim() || "General",
        future_end_date: null,
        future_plan: true,
        future_recurrence: "once",
        future_status: input.status.toLowerCase(),
      },
      note: input.note.trim() || null,
      title: input.title.trim(),
      transaction_date: input.startDate,
      type: input.type.toLowerCase(),
    })
    .eq("id", transactionId)
    .eq("user_id", user.id)
    .select("id")
    .maybeSingle();

  if (error) return { error: error.message };
  if (!updated) return { error: "Scheduled transaction not found." };
  revalidatePlanningPaths();
  revalidatePath(`/future-planning/${transactionId}/edit`);
  return {};
}

export async function deleteFutureTransaction(transactionId: string): Promise<ActionResult> {
  const { authError, supabase, user } = await authenticatedClient();
  if (authError || !user) return { error: authError ?? "You must be signed in." };

  const { data: deleted, error } = await supabase
    .from("transactions")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", transactionId)
    .eq("user_id", user.id)
    .eq("status", "scheduled")
    .in("type", ["income", "expense"])
    .is("deleted_at", null)
    .select("id")
    .maybeSingle();

  if (error) return { error: error.message };
  if (!deleted) return { error: "Scheduled transaction not found." };
  revalidatePlanningPaths();
  return {};
}
