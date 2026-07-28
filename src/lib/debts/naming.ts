function cleanName(value: unknown) {
  return String(value ?? "").trim().replace(/\s+/g, " ");
}

export function creditCardDebtName(accountName: unknown) {
  const name = cleanName(accountName)
    .replace(/(?:\s+credit\s+card)+(?:\s+debt)?$/i, "")
    .replace(/\s+debt$/i, "")
    .trim();
  return `${name || "Credit Card"} Credit Card Debt`;
}

export function normalizeCreditCardDebtDisplayName(value: unknown) {
  const name = cleanName(value);
  if (!/credit\s+card/i.test(name)) return name;
  return name.replace(/(?:\s+credit\s+card){2,}(\s+debt)?$/i, " Credit Card$1");
}
