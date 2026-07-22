import assert from "node:assert/strict";
import test from "node:test";

import { safeLocalRedirectPath } from "../src/lib/auth/redirect-path.ts";

test("auth redirects keep valid application paths and their query or hash", () => {
  assert.equal(safeLocalRedirectPath("/"), "/");
  assert.equal(safeLocalRedirectPath("/transactions?q=salary#recent"), "/transactions?q=salary#recent");
});

test("auth redirects reject absolute, protocol-relative, and backslash URLs", () => {
  const decodedBackslashPath = new URL("https://finance-pro.local/login?next=/%5c%5cevil.example").searchParams.get("next");

  for (const value of [
    null,
    "https://evil.example",
    "//evil.example/path",
    "/\\evil.example/path",
    decodedBackslashPath,
  ]) {
    assert.equal(safeLocalRedirectPath(value), "/");
  }
});
