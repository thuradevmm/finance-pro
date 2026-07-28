import assert from "node:assert/strict";
import test from "node:test";

import { readSubmittedQuery, stageSubmittedQueryDraft, syncSubmittedQueryDraft } from "../src/lib/filters/submitted-query.ts";

test("submitted query draft stays optimistic, commits, and follows browser Back", () => {
  let state = stageSubmittedQueryDraft("", "");
  state = stageSubmittedQueryDraft("", "foo");
  assert.equal(syncSubmittedQueryDraft(state, "").draftValue, "foo");

  state = syncSubmittedQueryDraft(state, "foo");
  assert.deepEqual(state, { appliedValue: "foo", draftValue: "foo" });

  state = syncSubmittedQueryDraft(state, "");
  assert.deepEqual(state, { appliedValue: "", draftValue: "" });
});

test("submitted searches use the native form value instead of a stale draft", () => {
  assert.equal(readSubmittedQuery({ get: () => "current visible value" }, "stale draft"), "current visible value");
  assert.equal(readSubmittedQuery({ get: () => null }, "fallback draft"), "fallback draft");
});
