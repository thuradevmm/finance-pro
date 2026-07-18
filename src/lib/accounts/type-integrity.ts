export function canonicalAccountType(value: unknown) {
  const compactType = String(value ?? "").trim().toLowerCase().replace(/[\s_-]+/g, "");

  if (compactType === "bank" || compactType === "bankaccount") return "bank_account";
  if (compactType === "cash" || compactType === "cashwallet") return "cash";
  if (compactType === "creditcard") return "credit_card";
  if (compactType === "digitalwallet") return "digital_wallet";
  if (compactType === "saving" || compactType === "savings") return "savings";
  return compactType;
}

export function accountTypeChangesLedgerMeaning(existingType: unknown, nextType: unknown) {
  return (canonicalAccountType(existingType) === "credit_card")
    !== (canonicalAccountType(nextType) === "credit_card");
}
