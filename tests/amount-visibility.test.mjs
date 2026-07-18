import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const globalsPath = new URL("../src/app/globals.css", import.meta.url);
const responsiveAmountPath = new URL("../src/components/ui/responsive-amount.tsx", import.meta.url);
const summaryCardsPath = new URL("../src/components/app/summary-cards.tsx", import.meta.url);

test("shared amount values wrap without hiding or abbreviating digits", async () => {
  const css = await readFile(globalsPath, "utf8");
  const amountRule = css.match(/\.amount-value\s*\{(?<body>[^}]*)\}/)?.groups?.body ?? "";

  assert.match(amountRule, /overflow:\s*visible/);
  assert.match(amountRule, /overflow-wrap:\s*anywhere/);
  assert.match(amountRule, /text-overflow:\s*clip/);
  assert.match(amountRule, /white-space:\s*normal/);
  assert.doesNotMatch(amountRule, /text-overflow:\s*ellipsis/);
  assert.doesNotMatch(amountRule, /white-space:\s*nowrap/);
});

test("responsive amount primitive does not opt back into clipped overflow", async () => {
  const source = await readFile(responsiveAmountPath, "utf8");

  assert.match(source, /className=\{`amount-value block max-w-full \$\{className\}`\}/);
  assert.doesNotMatch(source, /overflow-hidden/);
  assert.doesNotMatch(source, /truncate/);
});

test("shared summary cards scale large totals before allowing a safe wrap", async () => {
  const source = await readFile(summaryCardsPath, "utf8");

  assert.match(source, /<ResponsiveAmount[^>]*maxSizeRem=\{1\.5\}[^>]*minSizeRem=\{1\}/);
  assert.doesNotMatch(source, /amount-value[^\n]*(?:overflow-hidden|truncate|whitespace-nowrap)/);
});
