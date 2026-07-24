import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const sourcePath = new URL("../src/features/future-planning/future-planning-page-content.tsx", import.meta.url);

test("future planning sticky columns use matched widths and offsets", async () => {
  const source = await readFile(sourcePath, "utf8");

  assert.match(source, /const stickyYearColumnWidth = 84;/);
  assert.match(source, /const stickyMonthColumnWidth = 144;/);
  assert.match(source, /border-separate border-spacing-0/);
  assert.match(source, /left: `\$\{stickyYearColumnWidth\}px`/);
  assert.match(source, /setIsScrolledHorizontally\(event\.currentTarget\.scrollLeft > 1\)/);
  assert.match(source, /const stickyColumnShadowClass = isScrolledHorizontally \? "shadow-\[8px_0_12px_-12px_rgba\(11,28,48,0\.45\)\]" : "";/);
  assert.doesNotMatch(source, /left-\[76px\]/);
  assert.doesNotMatch(source, /border-collapse/);
});
