import { EditFormSection } from "@/components/ui/edit-record-page";
import { SelectInput, TextAreaInput, TextInput } from "@/components/ui/form-controls";
import { formatSignedAmount, getAmountInputValue } from "@/features/transactions/transaction-amount";
import {
  getImpactTarget,
  getImpactValue,
  transactionImpactOptions,
  transactionImpactTargets,
  type TransactionImpactTarget,
} from "@/lib/transactions/impact-options";
import type { Transaction, TransactionCategoryName, TransactionFilterOptions, TransactionType } from "@/types/finance";

type TransactionEditFormProps = {
  draft: Transaction;
  filterOptions: TransactionFilterOptions;
  onChange: <Key extends keyof Transaction>(key: Key, value: Transaction[Key]) => void;
};

const attachmentOptions = ["None", "Receipt", "Document"];

function getTransactionDateValue(date: string) {
  const parsedDate = new Date(date);

  if (Number.isNaN(parsedDate.getTime())) {
    return "";
  }

  return parsedDate.toISOString().slice(0, 10);
}

function formatTransactionDate(value: string) {
  if (!value) {
    return "";
  }

  return new Intl.DateTimeFormat("en-US", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(`${value}T00:00:00`));
}

function getAttachmentOption(attachment: Transaction["attachment"]) {
  if (attachment === "receipt") {
    return "Receipt";
  }

  if (attachment === "document") {
    return "Document";
  }

  return "None";
}

function getAttachmentValue(value: string): Transaction["attachment"] {
  if (value === "Receipt") {
    return "receipt";
  }

  if (value === "Document") {
    return "document";
  }

  return undefined;
}

export function TransactionEditForm({ draft, filterOptions, onChange }: TransactionEditFormProps) {
  const categoryOptions = filterOptions.category.filter((option) => option !== "Category") as TransactionCategoryName[];
  const accountOptions = filterOptions.account.filter((option) => option !== "Account");
  const typeOptions = filterOptions.type.filter((option) => option !== "Type") as TransactionType[];
  const impactTarget = getImpactTarget(draft);
  const impactOptions = transactionImpactOptions[impactTarget];
  const impactValue = getImpactValue(draft, impactTarget);
  const selectedImpactOption = impactOptions.find((option) => option.value === impactValue) ?? impactOptions[0];

  function handleTypeChange(value: string) {
    const nextType = value as TransactionType;
    const currentAmount = getAmountInputValue(draft.amount);

    onChange("type", nextType);
    onChange("amount", currentAmount ? formatSignedAmount(currentAmount, nextType) : "");
  }

  function clearImpactLinks() {
    onChange("linkedAssetId", undefined);
    onChange("linkedBudgetId", undefined);
    onChange("linkedDebtId", undefined);
    onChange("linkedSavingsGoalId", undefined);
    onChange("linkedSubscriptionId", undefined);
  }

  function applyImpactLink(target: TransactionImpactTarget, value: string) {
    clearImpactLinks();

    if (target === "Budget") {
      onChange("linkedBudgetId", value);
    }

    if (target === "Savings Goal") {
      onChange("linkedSavingsGoalId", value);
    }

    if (target === "Debt") {
      onChange("linkedDebtId", value);
    }

    if (target === "Subscription") {
      onChange("linkedSubscriptionId", value);
    }

    if (target === "Asset") {
      onChange("linkedAssetId", value);
    }
  }

  function handleImpactTargetChange(value: string) {
    const nextTarget = value as TransactionImpactTarget;
    const nextOption = transactionImpactOptions[nextTarget][0];

    if (nextTarget === "None") {
      clearImpactLinks();
      return;
    }

    if (nextOption) {
      applyImpactLink(nextTarget, nextOption.value);
    }
  }

  function handleImpactRecordChange(value: string) {
    const selectedOption = impactOptions.find((option) => option.label === value);

    if (selectedOption) {
      applyImpactLink(impactTarget, selectedOption.value);
    }
  }

  return (
    <div className="space-y-6">
      <EditFormSection title="Core details">
        <TextInput
          label="Date"
          onChange={(value) => onChange("date", formatTransactionDate(value))}
          placeholder="Select date"
          type="date"
          value={getTransactionDateValue(draft.date)}
        />
        <TextInput
          label="Amount"
          onChange={(value) => onChange("amount", value.trim() ? formatSignedAmount(value, draft.type) : "")}
          placeholder="Enter amount"
          type="number"
          value={getAmountInputValue(draft.amount)}
        />
        <SelectInput label="Type" onChange={handleTypeChange} options={typeOptions} value={draft.type} />
        <SelectInput
          label="Category"
          onChange={(value) => onChange("category", value as TransactionCategoryName)}
          options={categoryOptions}
          value={draft.category}
        />
      </EditFormSection>
      <EditFormSection title="Payment details">
        <SelectInput label="Account" onChange={(value) => onChange("account", value)} options={accountOptions} value={draft.account} />
        <TextInput
          label="Payment Method"
          onChange={(value) => onChange("paymentMethod", value)}
          placeholder="Enter payment method"
          value={draft.paymentMethod}
        />
        <SelectInput
          label="Attachment"
          onChange={(value) => onChange("attachment", getAttachmentValue(value))}
          options={attachmentOptions}
          value={getAttachmentOption(draft.attachment)}
        />
      </EditFormSection>
      <EditFormSection title="Transaction impact">
        <SelectInput label="Reflect To Page" onChange={handleImpactTargetChange} options={transactionImpactTargets} value={impactTarget} />
        <SelectInput
          label="Related Record"
          onChange={handleImpactRecordChange}
          options={impactOptions.length > 0 ? impactOptions.map((option) => option.label) : ["No record needed"]}
          value={selectedImpactOption?.label ?? "No record needed"}
        />
      </EditFormSection>
      <EditFormSection columns={1} title="Note">
        <TextAreaInput label="Note" onChange={(value) => onChange("note", value)} placeholder="Add transaction note" value={draft.note} />
      </EditFormSection>
    </div>
  );
}
