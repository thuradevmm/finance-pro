import type { TransactionType } from "@/types/finance";

export const creditCardJournalRoles = [
  "liability_credit",
  "purchase_debit",
  "liability_credit_reversal",
  "purchase_debit_reversal",
] as const;

export type CreditCardJournalRole = (typeof creditCardJournalRoles)[number];

type CreditCardJournalInput = {
  accountId: string;
  amount: number;
  categoryId: string;
  date: string;
  debtId: string;
  groupId: string;
  note: string;
  relatedEntityId?: string;
  relatedEntityType?: string;
  status: string;
  title: string;
  userId: string;
};

type CreditCardJournalReversalInput = CreditCardJournalInput & {
  liabilitySourceId: string;
  purchaseSourceId: string;
};

export function creditCardJournalRole(metadata: unknown): CreditCardJournalRole | "" {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return "";
  const value = String((metadata as Record<string, unknown>).credit_card_journal_role ?? "");
  return creditCardJournalRoles.includes(value as CreditCardJournalRole)
    ? value as CreditCardJournalRole
    : "";
}

export function creditCardJournalGroupId(metadata: unknown) {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return "";
  const value = (metadata as Record<string, unknown>).credit_card_journal_group_id;
  return typeof value === "string" ? value : "";
}

export function creditCardJournalRoleIsLiability(role: CreditCardJournalRole | "") {
  return role === "liability_credit" || role === "liability_credit_reversal";
}

export function creditCardJournalRoleIsPurchase(role: CreditCardJournalRole | "") {
  return role === "purchase_debit" || role === "purchase_debit_reversal";
}

/**
 * A card purchase is a linked two-record journal:
 *   1. Credit: borrowing made available by the card (liability increases).
 *   2. Debit: the purchase/use of that credit (operating activity).
 * Only the liability entry changes the card balance; only the purchase entry
 * changes period Debit totals. Both remain visible and share a stable group.
 */
export function buildCreditCardChargeJournal(
  input: CreditCardJournalInput,
  sharedMetadata: Record<string, unknown>,
) {
  const base = {
    account_id: input.accountId,
    amount: input.amount,
    description: input.note || null,
    note: input.note || null,
    payment_method: null,
    status: input.status.toLowerCase(),
    transaction_date: input.date,
    transfer_account_id: null,
    user_id: input.userId,
  };
  const sharedJournalMetadata = {
    ...sharedMetadata,
    credit_card_account_id: input.accountId,
    credit_card_debt_id: input.debtId,
    credit_card_journal_group_id: input.groupId,
    credit_card_payment: false,
  };

  return [
    {
      ...base,
      category_id: null,
      related_entity_id: input.debtId,
      related_entity_type: "debt",
      metadata: {
        ...sharedJournalMetadata,
        accounting_class: "financing_receipt",
        credit_card_debt_impact: "charge",
        credit_card_journal_role: "liability_credit",
        financial_event: "credit_card_borrowing_credit",
      },
      title: `${input.title || "Credit card charge"} · Credit`,
      type: "income",
    },
    {
      ...base,
      category_id: input.categoryId || null,
      related_entity_id: input.relatedEntityType && input.relatedEntityType !== "none"
        ? input.relatedEntityId || null
        : null,
      related_entity_type: input.relatedEntityType && input.relatedEntityType !== "none"
        ? input.relatedEntityType
        : null,
      metadata: {
        ...sharedJournalMetadata,
        accounting_class: "operating_expense",
        credit_card_debt_impact: null,
        credit_card_journal_role: "purchase_debit",
        financial_event: "credit_card_purchase_debit",
      },
      title: input.title || "Credit card purchase",
      type: "expense",
    },
  ];
}

export function buildCreditCardChargeJournalReversal(
  input: CreditCardJournalReversalInput,
  sharedMetadata: Record<string, unknown>,
) {
  const rows = buildCreditCardChargeJournal(input, sharedMetadata);
  const [liabilityRow, purchaseRow] = rows;
  return [
    {
      ...liabilityRow,
      metadata: {
        ...liabilityRow.metadata,
        credit_card_debt_impact: "repayment",
        credit_card_journal_role: "liability_credit_reversal",
        financial_event: "credit_card_borrowing_credit_reversal",
        reversed_transaction_id: input.liabilitySourceId,
        reversed_transaction_type: "income",
      },
      title: `${input.title} · Liability Debit`,
      type: "expense",
    },
    {
      ...purchaseRow,
      metadata: {
        ...purchaseRow.metadata,
        credit_card_journal_role: "purchase_debit_reversal",
        financial_event: "credit_card_purchase_debit_reversal",
        reversed_transaction_id: input.purchaseSourceId,
        reversed_transaction_type: "expense",
      },
      title: `${input.title} · Purchase Credit`,
      type: "income",
    },
  ];
}

export function isCreditCardChargeJournalCandidate(input: {
  accountId: string;
  debtId: string;
  impact: unknown;
  type: TransactionType | string;
}) {
  return Boolean(input.accountId)
    && Boolean(input.debtId)
    && input.impact === "charge"
    && String(input.type).toLowerCase() === "expense";
}
