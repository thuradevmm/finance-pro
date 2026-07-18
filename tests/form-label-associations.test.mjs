import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const files = {
  account: new URL("../src/features/accounts/add-account-form.tsx", import.meta.url),
  dateInput: new URL("../src/components/ui/date-input.tsx", import.meta.url),
  debt: new URL("../src/features/debts/add-debt-form.tsx", import.meta.url),
  shared: new URL("../src/components/ui/form-controls.tsx", import.meta.url),
  transaction: new URL("../src/features/transactions/add-transaction-form.tsx", import.meta.url),
};

function assertFieldLabelsTargetControls(source, name) {
  const targetNames = [...source.matchAll(/<FieldLabel\s+htmlFor=\{(?<target>[A-Za-z0-9]+)\}/g)]
    .map((match) => match.groups?.target)
    .filter(Boolean);

  assert.ok(targetNames.length > 0, `${name} should contain associated field labels`);
  assert.doesNotMatch(source, /<FieldLabel(?![^>]*htmlFor=)/, `${name} should not contain a bare FieldLabel`);

  for (const targetName of new Set(targetNames)) {
    assert.match(source, new RegExp(`id=\\{${targetName}\\}`), `${name} should render the ${targetName} target id`);
  }
}

test("shared form controls generate an id and associate every visible label", async () => {
  const source = await readFile(files.shared, "utf8");

  assert.match(source, /useId/);
  assert.match(source, /htmlFor: string/);
  assert.equal((source.match(/<FieldLabel htmlFor=\{inputId\}>/g) ?? []).length, 3);
  assertFieldLabelsTargetControls(source, "shared form controls");
});

test("date inputs expose their generated or supplied id on the native control", async () => {
  const source = await readFile(files.dateInput, "utf8");

  assert.match(source, /id\?: string/);
  assert.match(source, /const generatedId = useId\(\)/);
  assert.match(source, /const inputId = id \?\? generatedId/);
  assert.match(source, /<input[\s\S]*?id=\{inputId\}/);
});

test("account, transaction, and debt custom field labels target native controls", async () => {
  const sources = await Promise.all([
    readFile(files.account, "utf8"),
    readFile(files.transaction, "utf8"),
    readFile(files.debt, "utf8"),
  ]);

  assertFieldLabelsTargetControls(sources[0], "account form");
  assertFieldLabelsTargetControls(sources[1], "transaction form");
  assertFieldLabelsTargetControls(sources[2], "debt form");

  assert.doesNotMatch(sources[0], /<FieldLabel>\{isCreditCard \? "Available Credit" : "Total Amount"\}<\/FieldLabel>/);
  assert.doesNotMatch(sources[1], /<FieldLabel>Payment Exchange Rate<\/FieldLabel>/);
});
