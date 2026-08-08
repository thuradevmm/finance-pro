import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("the root layout owns one persistent workspace shell", () => {
  const layout = read("src/app/layout.tsx");
  const workspaceShell = read("src/components/app/workspace-shell.tsx");
  const legacyPageShell = read("src/components/app/app-shell.tsx");

  assert.match(layout, /<WorkspaceShell>\{children\}<\/WorkspaceShell>/);
  assert.match(workspaceShell, /usePathname\(\)/);
  assert.match(workspaceShell, /<AppSidebar /);
  assert.doesNotMatch(legacyPageShell, /"use client"/);
  assert.doesNotMatch(legacyPageShell, /<AppSidebar /);
});

test("route loading renders content without duplicating workspace chrome", () => {
  const fallback = read("src/components/app/route-loading-fallback.tsx");
  const loadingState = read("src/components/ui/loading-state.tsx");

  assert.match(fallback, /contentOnly=/);
  assert.match(loadingState, /if \(contentOnly\)/);
  assert.match(loadingState, /aria-label="Loading page content"/);
});
