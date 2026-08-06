"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";

import { getFutureOccurrenceDates, materializeFuturePredictions, type FutureTransactionFormData } from "@/lib/future-planning/records";
import { isCreditCardType } from "@/lib/ledger";
import { transactionTypeLabel } from "@/lib/transactions/terminology";
import { accountStatusContributesToCurrentTotals } from "@/lib/accounts/financial-status";
import { categoryRowSupports } from "@/lib/categories/category-scopes";
import { normalizeDebtNature } from "@/lib/debts/nature";
import { getUserSafely } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/server";

type ActionResult = {
  createdCount?: number;
  error?: string;
};

const recurrenceOptions = new Set(["Monthly", "Once", "Weekly", "Yearly"]);
const statusOptions = new Set(["Active", "Paused"]);
const typeOptions = new Set(["Expense", "Income"]);
const relatedEntityTypes = new Set(["asset", "debt", "none", "savings_goal", "subscription"]);
const maximumPlanAmount = 1_000_000_000_000_000;

type ExistingFutureReferences = {
  accountAmountType: string;
  accountId: string | null;
  categoryId: string | null;
  relatedEntityId: string | null;
  relatedEntityType: string | null;
  transactionType: string;
};

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
    || typeof input.relatedEntityId !== "string"
    || typeof input.relatedEntityLabel !== "string"
    || typeof input.relatedEntityType !== "string"
    || typeof input.startDate !== "string"
    || typeof input.endDate !== "string"
    || typeof input.note !== "string") return "Enter valid planned transaction details.";
  if (!typeOptions.has(input.type)) return "Future plans support Credit and Debit transactions only.";
  if (!recurrenceOptions.has(input.recurrence)) return "Choose a valid repeat schedule.";
  if (!statusOptions.has(input.status)) return "Choose a valid plan status.";
  if (!relatedEntityTypes.has(input.relatedEntityType)) return "Choose a valid linked record.";
  if (input.relatedEntityType === "none" && input.relatedEntityId.trim()) return "Choose a valid linked record.";
  if (input.relatedEntityType !== "none" && !input.relatedEntityId.trim()) return "Choose a valid linked record.";
  if (input.relatedEntityLabel.length > 160) return "Keep the linked record label under 160 characters.";
  if (!input.title?.trim() || input.title.trim().length > 120) return "Enter a title up to 120 characters.";
  if (!Number.isFinite(input.amount) || input.amount <= 0 || input.amount > maximumPlanAmount) return "Enter a valid amount greater than zero.";
  if (!input.accountId?.trim()) return "Choose an account for this plan.";
  if (!input.categoryId?.trim()) return "Choose a category for this plan.";
  if (!input.accountAmountType.trim() || input.accountAmountType.trim().length > 80) return "Choose a valid account amount type.";
  if (!validDate(input.startDate)) return "Choose a valid planned date.";
  if (input.note?.length > 2_000) return "Keep the note under 2,000 characters.";
  if (input.recurrence !== "Once" && !validDate(input.endDate)) return "Choose an end date for the repeating plan.";
  if (input.recurrence !== "Once" && input.endDate < input.startDate) return "The repeat end date must be on or after the first planned date.";
  if (input.relatedEntityAmountSnapshot !== undefined
    && input.relatedEntityAmountSnapshot !== null
    && (!Number.isFinite(input.relatedEntityAmountSnapshot)
      || input.relatedEntityAmountSnapshot < 0
      || input.relatedEntityAmountSnapshot > maximumPlanAmount)) return "The linked amount suggestion is invalid.";
  if (input.relatedEntityType === "none" && input.relatedEntityAmountSnapshot != null) return "Choose a valid linked record.";
  if (input.predictions !== undefined && !Array.isArray(input.predictions)) return "Enter valid predicted amounts.";
  for (const prediction of input.predictions ?? []) {
    if (!prediction || typeof prediction !== "object" || !validDate(prediction.date)
      || !Number.isFinite(prediction.amount) || prediction.amount <= 0 || prediction.amount > maximumPlanAmount) {
      return "Enter a valid predicted amount greater than zero for every planned date.";
    }
  }
  return "";
}

function validatePredictionDates(input: FutureTransactionFormData, occurrenceDates: string[]) {
  const allowedDates = new Set(occurrenceDates);
  const seenDates = new Set<string>();
  for (const prediction of input.predictions ?? []) {
    if (!allowedDates.has(prediction.date)) return "A predicted amount does not match this plan's dates.";
    if (seenDates.has(prediction.date)) return "Each planned date can have only one predicted amount.";
    seenDates.add(prediction.date);
  }
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
  for (const path of ["/future-planning", "/transactions", "/dashboard", "/notifications"]) {
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
  input: Pick<FutureTransactionFormData, "accountAmountType" | "accountId" | "categoryId" | "relatedEntityId" | "relatedEntityType" | "type">,
  existing?: ExistingFutureReferences,
) {
  const [accountResult, categoryResult] = await Promise.all([
    supabase.from("accounts").select("id,is_active,type,metadata").eq("id", input.accountId).eq("user_id", userId).is("deleted_at", null).maybeSingle(),
    supabase.from("categories").select("id,is_active,type,category_type,category_level,metadata").eq("id", input.categoryId).eq("user_id", userId).is("deleted_at", null).maybeSingle(),
  ]);
  const error = accountResult.error ?? categoryResult.error;
  if (error) return error.message;
  const preservesAccount = input.accountId === existing?.accountId;
  if (!accountResult.data && !preservesAccount) return "The selected account is no longer available.";
  if (accountResult.data) {
    const accountMetadata = metadataRecord(accountResult.data.metadata);
    const accountStatus = accountResult.data.is_active === false
      ? "Archived"
      : accountMetadata.status === "Needs Review" ? "Needs Review" : "Active";
    if (!accountStatusContributesToCurrentTotals(accountStatus) && !preservesAccount) return "Choose an available account for this plan.";
    if (isCreditCardType(accountResult.data.type) && input.type !== "Expense") return "Credit cards can only be used for planned purchases, not planned cash Credits.";
    const preservesAmountType = preservesAccount && input.accountAmountType.trim() === existing?.accountAmountType;
    if (!accountAmountTypes(accountResult.data).includes(input.accountAmountType.trim()) && !preservesAmountType) return "Choose a valid amount type for the selected account.";
  }

  const preservesCategory = input.categoryId === existing?.categoryId && input.type.toLowerCase() === existing?.transactionType.toLowerCase();
  if (!categoryResult.data && !preservesCategory) return "The selected category is no longer available.";
  if (categoryResult.data) {
    if (categoryResult.data.is_active === false && !preservesCategory) return "Choose an active category for this plan.";
    if (!categoryRowSupports(categoryResult.data, "Transactions", input.type)) {
      return `Choose a selectable ${transactionTypeLabel(input.type).toLowerCase()} subcategory for this plan.`;
    }
  }

  if (input.relatedEntityType !== "none") {
    const preservesLinkedRecord = input.relatedEntityId === existing?.relatedEntityId
      && input.relatedEntityType === existing?.relatedEntityType;
    let linkedResult: { data: Record<string, unknown> | null; error: { message: string } | null };
    if (input.relatedEntityType === "asset") {
      linkedResult = await supabase.from("assets").select("id,status,metadata").eq("id", input.relatedEntityId).eq("user_id", userId).is("deleted_at", null).maybeSingle();
    } else if (input.relatedEntityType === "debt") {
      linkedResult = await supabase.from("debts").select("id,name,status,type,payment_account_id,metadata").eq("id", input.relatedEntityId).eq("user_id", userId).is("deleted_at", null).maybeSingle();
    } else if (input.relatedEntityType === "savings_goal") {
      linkedResult = await supabase.from("savings_goals").select("id,status,account_id,account_amount_type,metadata").eq("id", input.relatedEntityId).eq("user_id", userId).is("deleted_at", null).maybeSingle();
    } else {
      linkedResult = await supabase.from("subscriptions").select("id,status,metadata").eq("id", input.relatedEntityId).eq("user_id", userId).is("deleted_at", null).maybeSingle();
    }
    if (linkedResult.error) return linkedResult.error.message;
    if (!linkedResult.data && !preservesLinkedRecord) return "The linked record is no longer available.";
    if (!linkedResult.data) return "The linked record is no longer available.";

    const linkedMetadata = metadataRecord(linkedResult.data.metadata);
    const linkedStatus = String(linkedResult.data.status ?? linkedMetadata.status ?? "active").trim().toLowerCase();
    if (input.relatedEntityType === "asset") {
      if (!preservesLinkedRecord && linkedStatus !== "active") return "Only active assets can receive a new planned purchase.";
      if (input.type !== "Expense") return "Asset purchases must be planned as Debits.";
    } else if (input.relatedEntityType === "subscription") {
      if (!preservesLinkedRecord && !["active", "expiring"].includes(linkedStatus)) return "Only active subscriptions can receive a new planned payment.";
      if (input.type !== "Expense") return "Subscription payments must be planned as Debits.";
    } else if (input.relatedEntityType === "debt") {
      if (!preservesLinkedRecord && ["archived", "cancelled", "canceled", "completed", "paid"].includes(linkedStatus)) {
        return "Completed or archived borrowing / lending records cannot receive a new plan.";
      }
      const nature = normalizeDebtNature(linkedMetadata.debt_nature, String(linkedResult.data.name ?? ""));
      const requiredType = nature === "Lending" ? "Income" : "Expense";
      if (input.type !== requiredType) return nature === "Lending"
        ? "Returned lending money must be planned as a Credit."
        : "Borrowing repayments must be planned as Debits.";
    } else if (input.relatedEntityType === "savings_goal") {
      if (!preservesLinkedRecord && ["archived", "completed"].includes(linkedStatus)) return "Completed or archived savings goals cannot receive a new contribution plan.";
      if (input.type !== "Income") return "Savings contributions must be planned as Credits.";
      const goalAccountId = String(linkedResult.data.account_id ?? linkedMetadata.account_id ?? "");
      const goalAmountType = String(linkedResult.data.account_amount_type ?? linkedMetadata.account_amount_type ?? "General");
      if (input.accountId !== goalAccountId || input.accountAmountType.trim().toLowerCase() !== goalAmountType.trim().toLowerCase()) {
        return "A savings contribution plan must use the account amount type assigned to the goal or fund.";
      }
    }
  }
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
  const predictionError = validatePredictionDates(input, occurrenceDates);
  if (predictionError) return { error: predictionError };
  const predictions = materializeFuturePredictions(occurrenceDates, input.amount, input.predictions);

  const seriesId = randomUUID();
  const title = input.title.trim();
  const note = input.note.trim() || null;
  const { error } = await supabase.from("transactions").insert(predictions.map((prediction, index) => ({
    account_id: input.accountId,
    amount: prediction.amount,
    category_id: input.categoryId,
    description: note,
    metadata: {
      account_amount_type: input.accountAmountType?.trim() || "General",
      future_materialized: true,
      future_materialization_mode: "individual_occurrences",
      future_occurrence_index: index,
      future_plan: true,
      future_link_label: input.relatedEntityType === "none" ? null : input.relatedEntityLabel.trim(),
      future_link_amount_snapshot: input.relatedEntityType === "none" ? null : input.relatedEntityAmountSnapshot ?? null,
      future_predicted_amount: prediction.amount,
      future_prediction_mode: "explicit",
      future_recurrence: "once",
      future_series_end_date: input.recurrence === "Once" ? null : input.endDate,
      future_series_id: seriesId,
      future_series_occurrence_count: occurrenceDates.length,
      future_series_recurrence: input.recurrence.toLowerCase(),
      future_status: input.status.toLowerCase(),
      transfer_account_amount_type: null,
    },
    note,
    payment_method: null,
    related_entity_id: input.relatedEntityType === "none" ? null : input.relatedEntityId,
    related_entity_type: input.relatedEntityType === "none" ? null : input.relatedEntityType,
    status: "scheduled",
    title,
    transaction_date: prediction.date,
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
  const predictionError = validatePredictionDates(input, [input.startDate]);
  if (predictionError) return { error: predictionError };

  const { authError, supabase, user } = await authenticatedClient();
  if (authError || !user) return { error: authError ?? "You must be signed in." };

  const { data: existing, error: findError } = await supabase
    .from("transactions")
    .select("id,status,type,metadata,account_id,category_id,related_entity_id,related_entity_type")
    .eq("id", transactionId)
    .eq("user_id", user.id)
    .is("deleted_at", null)
    .maybeSingle();
  if (findError) return { error: findError.message };
  if (!existing || String(existing.status).toLowerCase() !== "scheduled" || !["expense", "income"].includes(String(existing.type).toLowerCase())) {
    return { error: "Scheduled transaction not found." };
  }

  const metadata = metadataRecord(existing.metadata);
  const referenceError = await validateOwnedReferences(supabase, user.id, input, {
    accountAmountType: typeof metadata.account_amount_type === "string" ? metadata.account_amount_type : "General",
    accountId: existing.account_id,
    categoryId: existing.category_id,
    relatedEntityId: existing.related_entity_id,
    relatedEntityType: existing.related_entity_type,
    transactionType: String(existing.type),
  });
  if (referenceError) return { error: referenceError };

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
        future_link_label: input.relatedEntityType === "none" ? null : input.relatedEntityLabel.trim(),
        future_link_amount_snapshot: input.relatedEntityType === "none" ? null : input.relatedEntityAmountSnapshot ?? null,
        future_plan: true,
        future_predicted_amount: input.amount,
        future_prediction_mode: "explicit",
        future_recurrence: "once",
        future_status: input.status.toLowerCase(),
      },
      note: input.note.trim() || null,
      related_entity_id: input.relatedEntityType === "none" ? null : input.relatedEntityId,
      related_entity_type: input.relatedEntityType === "none" ? null : input.relatedEntityType,
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
