import assert from "node:assert/strict";
import test from "node:test";

import { stageSubmittedQueryDraft, syncSubmittedQueryDraft } from "../src/lib/filters/submitted-query.ts";

test("submitted query draft stays optimistic, commits, and follows browser Back", () => {
  let state = stageSubmittedQueryDraft("", "");
  state = stageSubmittedQueryDraft("", "foo");
  assert.equal(syncSubmittedQueryDraft(state, "").draftValue, "foo");

  state = syncSubmittedQueryDraft(state, "foo");
  assert.deepEqual(state, { appliedValue: "foo", draftValue: "foo" });

  state = syncSubmittedQueryDraft(state, "");
  assert.deepEqual(state, { appliedValue: "", draftValue: "" });
});
