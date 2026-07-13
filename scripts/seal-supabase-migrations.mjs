#!/usr/bin/env node

import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import process from "node:process";

const migrationsDir = join(process.cwd(), "supabase", "migrations");
const lockPath = join(process.cwd(), "supabase", "migrations.lock.json");

function sha256(content) {
  return createHash("sha256").update(content).digest("hex");
}

if (!existsSync(lockPath)) {
  console.error("Missing supabase/migrations.lock.json. Initial lock creation must be reviewed manually.");
  process.exit(1);
}

const lock = JSON.parse(readFileSync(lockPath, "utf8"));
const files = readdirSync(migrationsDir)
  .filter((name) => name.endsWith(".sql"))
  .sort();
const currentFiles = new Set(files);
const lockedFiles = new Set(lock.migrations.map((entry) => entry.file));

for (const entry of lock.migrations) {
  const path = join(migrationsDir, entry.file);
  if (!currentFiles.has(entry.file)) {
    console.error(`Cannot seal: historical migration was removed: ${entry.file}`);
    process.exit(1);
  }
  if (sha256(readFileSync(path)) !== entry.sha256) {
    console.error(`Cannot seal: historical migration was edited: ${entry.file}`);
    console.error("Restore it and create a new migration for the correction.");
    process.exit(1);
  }
}

const additions = files.filter((file) => !lockedFiles.has(file));
for (const file of additions) {
  const version = basename(file).split("_", 1)[0];
  if (version <= lock.sealedThrough) {
    console.error(`Cannot seal out-of-order migration ${file}; its version is not newer than ${lock.sealedThrough}.`);
    process.exit(1);
  }
  lock.migrations.push({
    version,
    file,
    sha256: sha256(readFileSync(join(migrationsDir, file))),
  });
}

lock.migrations.sort((left, right) => left.version.localeCompare(right.version));
lock.sealedThrough = lock.migrations.at(-1)?.version ?? null;
writeFileSync(lockPath, `${JSON.stringify(lock, null, 2)}\n`);

if (additions.length === 0) {
  console.log("Migration history is already sealed and unchanged.");
} else {
  console.log(`Sealed ${additions.length} new migration(s): ${additions.join(", ")}`);
}
