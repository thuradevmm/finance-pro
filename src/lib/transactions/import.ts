import { transactionTypeFromLabel } from "./terminology.ts";
import type { TransactionFormData } from "./supabase.ts";

export const transactionImportColumns = [
  "external_source",
  "external_id",
  "date",
  "type",
  "amount",
  "account_id",
  "account_amount_type",
  "transfer_account_id",
  "transfer_account_amount_type",
  "transfer_amount",
  "category_id",
  "status",
  "title",
  "note",
] as const;

export type TransactionImportRow = TransactionFormData & {
  externalReference: {
    externalId: string;
    source: string;
  };
};

function parseCsvLine(line: string) {
  const values: string[] = [];
  let value = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    if (character === "\"") {
      if (quoted && line[index + 1] === "\"") {
        value += "\"";
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (character === "," && !quoted) {
      values.push(value.trim());
      value = "";
    } else {
      value += character;
    }
  }
  values.push(value.trim());
  return values;
}

export function parseTransactionImportCsv(source: string) {
  const lines = source.replace(/^\uFEFF/, "").split(/\r?\n/).filter((line) => line.trim());
  if (lines.length < 2) return { errors: ["The CSV must contain a header and at least one transaction."], rows: [] };
  const headers = parseCsvLine(lines[0]).map((header) => header.toLowerCase());
  const missingColumns = ["external_source", "external_id", "date", "type", "amount", "account_id"]
    .filter((column) => !headers.includes(column));
  if (missingColumns.length > 0) {
    return { errors: [`Missing required columns: ${missingColumns.join(", ")}.`], rows: [] };
  }

  const errors: string[] = [];
  const rows: TransactionImportRow[] = [];
  for (const [offset, line] of lines.slice(1).entries()) {
    const lineNumber = offset + 2;
    const values = parseCsvLine(line);
    const record = Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ""]));
    const type = transactionTypeFromLabel(record.type);
    const amount = Number(record.amount.replace(/,/g, ""));
    if (!record.external_source || !record.external_id || !record.account_id) {
      errors.push(`Line ${lineNumber}: source, external ID, and account ID are required.`);
      continue;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(record.date)) {
      errors.push(`Line ${lineNumber}: date must use YYYY-MM-DD.`);
      continue;
    }
    if (!type || !Number.isFinite(amount) || amount <= 0) {
      errors.push(`Line ${lineNumber}: type or amount is invalid.`);
      continue;
    }
    if (type === "Transfer" && !record.transfer_account_id) {
      errors.push(`Line ${lineNumber}: transfers require transfer_account_id.`);
      continue;
    }
    const transferAmount = record.transfer_amount ? Number(record.transfer_amount.replace(/,/g, "")) : undefined;
    if (transferAmount != null && (!Number.isFinite(transferAmount) || transferAmount <= 0)) {
      errors.push(`Line ${lineNumber}: transfer_amount must be greater than zero when provided.`);
      continue;
    }
    rows.push({
      accountId: record.account_id,
      accountAmountType: record.account_amount_type || "General",
      amount,
      categoryId: record.category_id || "",
      date: record.date,
      externalReference: {
        externalId: record.external_id,
        source: record.external_source,
      },
      futurePlanningAmountId: "",
      note: record.note || "",
      relatedEntityId: "",
      relatedEntityType: "none",
      status: record.status || "Cleared",
      title: record.title || "",
      transferAccountId: record.transfer_account_id || "",
      transferAccountAmountType: record.transfer_account_amount_type || "General",
      transferAmount,
      type,
    });
  }
  return { errors, rows };
}

export function transactionImportTemplate() {
  return [
    transactionImportColumns.join(","),
    "bank-feed,unique-001,2026-07-29,Debit,12500,ACCOUNT_UUID,General,,,,CATEGORY_UUID,Cleared,Groceries,Weekly shop",
  ].join("\n");
}
