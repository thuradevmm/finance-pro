import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const toastProviderPath = new URL("../src/components/ui/toast-provider.tsx", import.meta.url);

test("toast controls stay centered while message text aligns left", async () => {
  const source = await readFile(toastProviderPath, "utf8");

  assert.match(source, /grid-cols-\[2\.75rem_minmax\(0,1fr\)_2\.75rem\]/);
  assert.match(source, /items-center/);
  assert.match(source, /<p className="[^"]*text-left[^"]*"/);
  assert.match(source, /justify-self-center/);
});
