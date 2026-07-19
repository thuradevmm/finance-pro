import { metadataRecord, normalizeAmountType, numericValue, roundCurrencyValue } from "../ledger.ts";

export type AccountAmountTypeValue = {
  amountValue: number;
  type: string;
};

function optionalNumericValue(value: unknown) {
  if (value == null || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
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
  const values = new Map<string, AccountAmountTypeValue>();
  const operationAmount = optionalNumericValue(metadata.operation_amount);
  const savingAmount = optionalNumericValue(metadata.saving_amount);

  if (operationAmount != null) values.set(amountTypeKey("Operation"), { amountValue: operationAmount, type: "Operation" });
  if (savingAmount != null) values.set(amountTypeKey("Saving"), { amountValue: savingAmount, type: "Saving" });

  return values;
}

export function accountAmountTypeValues(metadataValue: unknown): AccountAmountTypeValue[] {
  const metadata = metadataRecord(metadataValue);
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

  return [{ amountValue: 0, type: "Operation" }];
}

export function reconcileAccountAmountTypeDeltas(
  amountTypeValues: Array<Pick<AccountAmountTypeValue, "type">>,
  deltas: Map<string, number>,
) {
  const balances = new Map(amountTypeValues.map((item) => [item.type, 0]));
  const fallbackAmountType = amountTypeValues[0]?.type ?? "General";
  const activeAmountTypeByKey = new Map(amountTypeValues.map((item) => [amountTypeKey(item.type), item.type]));

  for (const [amountType, delta] of deltas) {
    const displayAmountType = activeAmountTypeByKey.get(amountTypeKey(amountType)) ?? fallbackAmountType;
    balances.set(displayAmountType, roundCurrencyValue((balances.get(displayAmountType) ?? 0) + numericValue(delta)));
  }

  return balances;
}

export function accountAvailableAmountForType(metadata: unknown, deltas: Map<string, number>, requestedAmountType: string) {
  const amountTypes = accountAmountTypeValues(metadata);
  const activeAmountType = amountTypes.find((item) => amountTypeKey(item.type) === amountTypeKey(requestedAmountType))?.type
    ?? amountTypes[0]?.type
    ?? "General";
  return reconcileAccountAmountTypeDeltas(amountTypes, deltas).get(activeAmountType) ?? 0;
}
