/** Financial totals keep reviewable accounts visible; only archived accounts are excluded. */
export function accountStatusContributesToCurrentTotals(status: unknown) {
  return String(status ?? "").trim().toLowerCase() !== "archived";
}
