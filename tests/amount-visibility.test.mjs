import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const globalsPath = new URL("../src/app/globals.css", import.meta.url);
const responsiveAmountPath = new URL("../src/components/ui/responsive-amount.tsx", import.meta.url);
const summaryCardsPath = new URL("../src/components/app/summary-cards.tsx", import.meta.url);
const transactionContentPath = new URL("../src/features/transactions/transactions-page-content.tsx", import.meta.url);
const transactionFiltersPath = new URL("../src/features/transactions/transactions-filters.tsx", import.meta.url);

test("shared amount values wrap without hiding or abbreviating digits", async () => {
  const css = await readFile(globalsPath, "utf8");
  const amountRule = css.match(/\.amount-value\s*\{(?<body>[^}]*)\}/)?.groups?.body ?? "";

  assert.match(amountRule, /overflow:\s*visible/);
  assert.match(amountRule, /overflow-wrap:\s*anywhere/);
  assert.match(amountRule, /text-overflow:\s*clip/);
  assert.match(amountRule, /white-space:\s*normal/);
  assert.match(amountRule, /font-size:\s*1rem/);
  assert.match(amountRule, /font-variant-numeric:\s*tabular-nums/);
  assert.doesNotMatch(amountRule, /text-overflow:\s*ellipsis/);
  assert.doesNotMatch(amountRule, /white-space:\s*nowrap/);
});

test("global finance typography uses self-hosted Plex fonts and tabular numerals", async () => {
  const css = await readFile(globalsPath, "utf8");
  const bodyRule = css.match(/body\s*\{(?<body>[^}]*)\}/)?.groups?.body ?? "";

  assert.match(css, /@fontsource-variable\/ibm-plex-sans\/wght\.css/);
  assert.match(css, /@fontsource\/ibm-plex-mono\/latin-600\.css/);
  assert.match(css, /--font-sans:\s*var\(--font-finance-sans\)/);
  assert.match(css, /--font-mono:\s*var\(--font-finance-mono\)/);
  assert.match(bodyRule, /font-family:\s*var\(--font-finance-sans\)/);
  assert.match(bodyRule, /font-variant-numeric:\s*tabular-nums/);
  assert.doesNotMatch(css, /--font-geist/);
});

test("responsive amount primitive does not opt back into clipped overflow", async () => {
  const source = await readFile(responsiveAmountPath, "utf8");

  assert.match(source, /className=\{`amount-value block max-w-full \$\{className\}`\}/);
  assert.match(source, /fontSize: `clamp\(/);
  assert.match(source, /Math\.max\(1, minSizeRem\)/);
  assert.doesNotMatch(source, /compactLength/);
  assert.doesNotMatch(source, /overflow-hidden/);
  assert.doesNotMatch(source, /truncate/);
});

test("shared summary cards use compact spacing and a consistent prominent amount scale", async () => {
  const source = await readFile(summaryCardsPath, "utf8");

  assert.match(source, /grid-cols-1 gap-3/);
  assert.match(source, /bg-white px-4 py-3/);
  assert.match(source, /<ResponsiveAmount[^>]*maxSizeRem=\{1\.375\}[^>]*minSizeRem=\{1\.25\}/);
  assert.doesNotMatch(source, /amount-value[^\n]*(?:overflow-hidden|truncate|whitespace-nowrap)/);
});

test("transaction page omits summary cards and the amount filter", async () => {
  const [transactionContent, transactionFilters] = await Promise.all([
    readFile(transactionContentPath, "utf8"),
    readFile(transactionFiltersPath, "utf8"),
  ]);

  assert.doesNotMatch(transactionContent, /SummaryCards|filteredSummaries|getTransactionSummaries/);
  assert.doesNotMatch(transactionFilters, /Amount filter|name="amount"|filters\.amount/);
});

test("button press feedback changes color without moving or resizing controls", async () => {
  const css = await readFile(globalsPath, "utf8");
  const activeRule = css.match(/:where\(button:not\(:disabled\), a\[href\]\.inline-flex, a\[href\]\.grid, a\[href\]\.flex\):active\s*\{(?<body>[^}]*)\}/)?.groups?.body ?? "";

  assert.match(activeRule, /filter:\s*brightness/);
  assert.doesNotMatch(activeRule, /transform|scale|translate/);
});
