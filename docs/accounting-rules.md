# Accounting rules and summary-card audit

## Compatibility and terminology

The database keeps the historical transaction values `income`, `expense`, and
`transfer`. Application and export surfaces map those values to **Credit**,
**Debit**, and **Transfer**. Reads accept either vocabulary; writes normalize
back to the historical database values so existing records and integrations do
not require a destructive migration.

## Money and status policy

- All domain calculations round to two decimal places after every aggregation
  boundary using sign-symmetric rounding.
- Amount inputs must be finite and greater than zero. Direction is represented
  by the accounting classification, never by accepting a negative input.
- `cleared` (including legacy posted/complete aliases) is finalized activity.
- `pending` reserves working account and card availability but is not an actual
  Credit, Debit, budget use, linked contribution, or report result.
- `scheduled`, cancelled, void, and failed records do not affect working
  balances or actuals.
- Soft-deleted records do not affect any total. A finalized reversal subtracts
  from its original bucket and both records remain immutable history.

## Savings goals and reusable funds

- A **Target** savings record requires a positive target and target date.
- A **Fund** is open-ended reusable capital and has neither requirement.
- Every goal or fund is assigned to one real account amount type. The savings
  record earmarks money; the account ledger remains the source of cash truth.
- New linked savings activity stores an explicit action. A Credit or inbound
  Transfer is a deposit; a Debit or outbound Transfer is a withdrawal. Only a
  Fund permits withdrawals. A withdrawal cannot exceed its derived available
  amount.
- Historical linked rows without an explicit action retain their former
  Expense-as-contribution behavior. This compatibility rule must not be
  applied to newly created activity.
- Transfer pairs contribute once through their debit half. Reversals invert
  the original deposit or withdrawal, and pending/scheduled rows do not change
  saved progress.

## Category hierarchy and planning rules

- Existing and newly created selectable categories are **Subcategories**.
  They may optionally belong to one same-type **Super category**.
- Super categories are reporting-only groups and carry an optional financial
  purpose such as essential living, debt obligation, emergency reserve,
  savings, or discretionary spending. They are never valid posting targets.
- Super-category activity is the sum of its child activity; changing hierarchy
  never rewrites historical transaction category IDs.
- Future-planning rows are either a fixed amount or a percentage of the same
  month's total fixed planned Credit. Percentage-based Credit rows are not
  allowed, which keeps the calculation base non-circular and explainable.
- A Savings Goal contribution rule is a reusable suggestion in Future
  Planning; applying it writes the normal monthly fixed/percentage control.

## Dashboard health signals

Dashboard indicators intentionally show qualitative states rather than the
underlying ratios. They use finalized activity in the selected period:

- Cash-flow direction compares operating Credits and Debits.
- Essential expense load uses the Essential living super-category purpose and
  the common CFPB needs guideline as a reference, not a personalized mandate.
- Saving momentum uses net explicit savings deposits less withdrawals.
- Emergency readiness compares emergency-purpose fund balances with typical
  monthly essential spending; a six-month cushion is the strongest state.

If the required income, activity, or category purpose is absent, the indicator
must show **Setup needed** instead of guessing. Reference guidance:
[CFPB spending rule](https://files.consumerfinance.gov/f/201603_cfpb_rules-to-live-by_my-spending-rule-to-live-by.pdf),
[Federal Reserve liquid-savings research](https://www.federalreserve.gov/econres/notes/feds-notes/assessing-families-liquid-savings-using-the-survey-of-consumer-finances-20181119.html),
and [FDIC emergency-saving guidance](https://www.fdic.gov/consumer-resource-center/2025-01/saving-unexpected-and-your-future).

## Authoritative formulas

The functions in `src/lib/ledger.ts`, `src/lib/reconciliation.ts`, and
`src/lib/accounts/card-display.ts` are the authoritative application
implementations.

- Operating Credits = sum of finalized operating Credit deltas.
- Operating Debits = sum of finalized operating Debit deltas, including the
  interest portion of a debt repayment but excluding principal.
- Net activity = Operating Credits − Operating Debits.
- Cash balance = opening amount-type values reconciled with balance-affecting
  Credit, Debit, and Transfer deltas.
- Card outstanding = `max(signed card ledger, 0)`.
- Card credit = `max(-signed card ledger, 0)`.
- Available credit = `min(max(limit − outstanding, 0), limit)`. An overpayment
  is an asset but never increases the configured limit.
- Card Total Credited = finalized borrowing Credit journal rows − their
  reversals. Repayments and refunds are separate buckets.
- Card Total Debited / Spent = finalized purchase Debit journal rows and
  compatible legacy card charges − their reversals. Fees and interest are
  separate buckets when their event classification is available.
- Total assets = cash and card-credit assets + lending receivables.
- Total liabilities = card outstanding + other borrowing outstanding.
- Closing net worth = total assets − total liabilities.
- Expected closing net worth = opening net worth immediately before the
  selected period + period net activity.
- Reconciliation difference = actual closing net worth − expected closing net
  worth.

## Dashboard row order

The combined dashboard table intentionally presents:

1. Period activity: Money credited, Money debited/spent, Net activity.
2. Current assets: Cash and card credits, Money owed to you, Total assets.
3. Current liabilities: Credit-card balances owed, Other debt owed, Total
   liabilities.
4. Closing net worth.
5. Reconciliation bridge: Opening net worth, Plus net activity, Expected close,
   Actual close.

Period activity and point-in-time position have separate group labels and are
not presented as though their individual rows directly reconcile.

## Credit-card journals

A newly posted card charge creates a linked journal group:

1. A **Credit** (`liability_credit`) records borrowing supplied by the card and
   increases the card liability.
2. A **Debit** (`purchase_debit`) records how the borrowing was used and affects
   operating Debit totals.

Only the liability Credit changes the card balance; only the purchase Debit
changes economic performance. A repayment is a financing payment that reduces
the card liability and source cash without creating new borrowing. Deletion,
edit replacement, and reversal operate on the complete group. A partial unique
index prevents duplicate active roles in one journal group.

Historical one-row card charges remain supported. Legacy/imported account type
aliases including `AYA Visa` normalize to `credit_card`; the data migration
persists the canonical account type while retaining the former value in
metadata.

## Summary-card sources

| Module | Card / total | Authoritative source and formula |
| --- | --- | --- |
| Dashboard | Assets, liabilities, net worth | `summarizeNetWorth`; active/needs-review accounts and non-archived debts as of the selected end date |
| Dashboard | Reconciliation | Independent opening snapshot + finalized period activity compared with the ending snapshot |
| Accounts | Amount-type totals | `buildAccountLedgerActivities` grouped by active amount type |
| Accounts | Card limit/outstanding/available | `calculateCreditCardPosition` per card, then `summarizeCreditCardLookup` |
| Accounts | Credited, debited, repayments, pending, fees, interest | `LedgerAccountActivity`; finalized activity separated from pending reservations |
| Transactions | Operating and financing totals | `summarizeTransactionCards`; finalized rows only, with reversals signed to the original class |
| Categories | Monthly average and count | Canonical economic deltas across the inclusive activity range; zero-activity months remain in the divisor |
| Budgets | Actual and usage | Linked finalized Debit activity for the effective budget period |
| Savings | Saved and remaining | Linked finalized contributions, de-duplicated transfer pairs, capped by target |
| Debts | Charged, repaid, remaining | `debtTransactionLedgerFor`; reversal-aware and transfer-pair de-duplicated |
| Subscriptions | Paid/current cycle | Linked finalized Debit evidence and configured billing anchors |
| Assets | Purchase/current value | Explicit stored values with linked Debit fallback only for legacy rows |

All readers exclude soft-deleted rows at the query boundary. Server actions
revalidate every dependent route after create, update, clear, delete, and
reverse operations so a navigation or refresh receives the updated values.

## Import, currency, cash advances, and exports

- CSV import and `POST /api/transactions/sync` require a stable
  `(external_source, external_id)` pair. The identity is claimed before the
  transaction is written, unchanged payloads are skipped, changed payloads
  update the complete linked journal, and an identity is retained across
  transaction deletion to prevent accidental re-import.
- Every account retains its native currency. Account totals, dashboard
  reconciliation, reports, and exports convert into the configured base
  currency with the latest effective rate on or before the reporting date.
  Values without an applicable rate are never silently treated as base
  currency: they are excluded from aggregates and shown as needing a rate.
- A cross-currency Transfer stores the source and destination amounts
  separately. Both rates must be available. A credit-card-to-cash/account
  Transfer is classified as a cash advance: it increases card liability,
  credits the destination, and remains financing rather than operating Debit.
- Creating a lending record requires an explicit funding account and creates
  one linked, finalized Debit on the lending date. The Debit reduces cash while
  the lending receivable increases assets by the same principal, so net worth
  remains reconciled. It is classified as a financing payment, not operating
  spending. Editing the lending record updates the same managed transaction.
- Reports group finalized, non-reversed Credits and Debits by month, category,
  or account. The exact report data can be downloaded as CSV, XLSX, or PDF;
  transaction-level CSV export includes native and base-currency columns.
- Scheduled recurring card purchases become a two-row journal when the
  occurrence is completed through the transaction edit flow. Forecast-only
  records remain outside actuals.

Modules whose records do not have their own currency column (for example
budgets, savings targets, and standard debts) are denominated in the selected
base currency. Change the base only before adding dated rates so those stored
amounts cannot be reinterpreted silently.
