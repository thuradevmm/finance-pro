import assert from "node:assert/strict";
import test from "node:test";

import { accountArchivalIntegrityError } from "../src/lib/accounts/archive-integrity.ts";

test("account archival requires a settled reconciled position", () => {
  assert.match(accountArchivalIntegrityError({ balanceValue: 10, creditBalanceValue: 0, creditUsedValue: 0, type: "Bank Account" }, []), /balance/i);
  assert.match(accountArchivalIntegrityError({ balanceValue: 0, creditBalanceValue: 5, creditUsedValue: 0, type: "Credit Card" }, []), /card credit/i);
  assert.match(accountArchivalIntegrityError({ balanceValue: 0, creditBalanceValue: 0, creditUsedValue: 5, type: "Credit Card" }, []), /card balance/i);
});

test("historical activity alone may remain but active dependents block archival", () => {
  const settled = { balanceValue: 0, creditBalanceValue: 0, creditUsedValue: 0, type: "Bank Account" };
  assert.equal(accountArchivalIntegrityError(settled, []), "");
  assert.match(accountArchivalIntegrityError(settled, ["scheduled transactions", "active subscriptions"]), /scheduled transactions.*active subscriptions/i);
});
