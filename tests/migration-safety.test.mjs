import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  cpSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";

const projectRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

function sha256(content) {
  return createHash("sha256").update(content).digest("hex");
}

function fixture() {
  const directory = mkdtempSync(join(tmpdir(), "finance-pro-migration-check-"));
  mkdirSync(join(directory, "scripts"), { recursive: true });
  mkdirSync(join(directory, "supabase"), { recursive: true });
  cpSync(join(projectRoot, "supabase", "migrations"), join(directory, "supabase", "migrations"), {
    recursive: true,
  });
  cpSync(
    join(projectRoot, "supabase", "migrations.lock.json"),
    join(directory, "supabase", "migrations.lock.json"),
  );
  cpSync(
    join(projectRoot, "scripts", "check-supabase-migrations.mjs"),
    join(directory, "scripts", "check-supabase-migrations.mjs"),
  );
  return directory;
}

function runCheck(directory) {
  return spawnSync(process.execPath, ["scripts/check-supabase-migrations.mjs"], {
    cwd: directory,
    encoding: "utf8",
  });
}

test("migration guard rejects changes to sealed SQL", () => {
  const directory = fixture();
  try {
    const migration = join(directory, "supabase", "migrations", "202606180001_baseline_schema.sql");
    writeFileSync(migration, `${readFileSync(migration, "utf8")}\n-- accidental edit\n`);

    const result = runCheck(directory);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /Immutable migration changed/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("migration guard rejects deletion of sealed history", () => {
  const directory = fixture();
  try {
    unlinkSync(join(directory, "supabase", "migrations", "202606250001_transaction_metadata.sql"));

    const result = runCheck(directory);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /Sealed migration was removed/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("migration guard rejects multiline hard deletion of transactions", () => {
  const directory = fixture();
  try {
    const file = "20260714000000_accidental_transaction_delete.sql";
    const sql = "delete\nfrom public.transactions\nwhere status = 'void';\n";
    writeFileSync(join(directory, "supabase", "migrations", file), sql);

    const lockPath = join(directory, "supabase", "migrations.lock.json");
    const lock = JSON.parse(readFileSync(lockPath, "utf8"));
    lock.migrations.push({ version: "20260714000000", file, sha256: sha256(sql) });
    lock.sealedThrough = "20260714000000";
    writeFileSync(lockPath, `${JSON.stringify(lock, null, 2)}\n`);

    const result = runCheck(directory);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /multiline hard delete from a financial table/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("migration guard rejects updates that hide existing transactions", () => {
  const directory = fixture();
  try {
    const file = "20260714000000_accidental_transaction_hiding.sql";
    const sql = "update public.transactions\nset deleted_at = now()\nwhere status = 'void';\n";
    writeFileSync(join(directory, "supabase", "migrations", file), sql);

    const lockPath = join(directory, "supabase", "migrations.lock.json");
    const lock = JSON.parse(readFileSync(lockPath, "utf8"));
    lock.migrations.push({ version: "20260714000000", file, sha256: sha256(sql) });
    lock.sealedThrough = "20260714000000";
    writeFileSync(lockPath, `${JSON.stringify(lock, null, 2)}\n`);

    const result = runCheck(directory);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /visibility-changing update to transactions/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
