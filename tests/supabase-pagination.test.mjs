import assert from "node:assert/strict";
import test from "node:test";

import { fetchSupabaseRows } from "../src/lib/supabase/pagination.ts";

test("financial readers continue beyond the default PostgREST page", async () => {
  const source = Array.from({ length: 2_250 }, (_, index) => index);
  const ranges = [];
  const rows = await fetchSupabaseRows((from, to) => {
    ranges.push([from, to]);
    return Promise.resolve({ data: source.slice(from, to + 1), error: null });
  });

  assert.equal(rows.length, 2_250);
  assert.deepEqual(ranges, [[0, 999], [1_000, 1_999], [2_000, 2_999]]);
});

test("explicit limits remain exact and database failures are not hidden", async () => {
  const source = Array.from({ length: 2_250 }, (_, index) => index);
  const rows = await fetchSupabaseRows(
    (from, to) => Promise.resolve({ data: source.slice(from, to + 1), error: null }),
    { limit: 1_250 },
  );
  assert.equal(rows.length, 1_250);

  await assert.rejects(
    fetchSupabaseRows(() => Promise.resolve({ data: null, error: { message: "ledger unavailable" } })),
    /ledger unavailable/,
  );
});
