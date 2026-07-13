#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { readdirSync } from "node:fs";
import { join } from "node:path";
import process from "node:process";

const requireSynced = process.argv.includes("--require-synced");
const localVersions = readdirSync(join(process.cwd(), "supabase", "migrations"))
  .filter((name) => name.endsWith(".sql"))
  .map((name) => name.split("_", 1)[0])
  .sort();

const result = spawnSync("npx", ["supabase", "migration", "list", "--linked"], {
  cwd: process.cwd(),
  encoding: "utf8",
  stdio: ["ignore", "pipe", "pipe"],
  shell: process.platform === "win32",
});

if (result.status !== 0) {
  process.stderr.write(result.stderr || result.stdout);
  process.exit(result.status ?? 1);
}

const remoteVersions = [];
for (const line of result.stdout.split(/\r?\n/)) {
  const match = line.match(/^\s*(\d*)\s*\|\s*(\d*)\s*\|/);
  if (match?.[2]) remoteVersions.push(match[2]);
}

const remoteOnly = remoteVersions.filter((version) => !localVersions.includes(version));
if (remoteOnly.length > 0) {
  console.error(`Remote migration history contains versions missing from Git: ${remoteOnly.join(", ")}`);
  console.error("Stop. Reconcile history deliberately; do not use db push --include-all or reset the linked project.");
  process.exit(1);
}

const expectedRemotePrefix = localVersions.slice(0, remoteVersions.length);
if (remoteVersions.join("\n") !== expectedRemotePrefix.join("\n")) {
  console.error("Remote migration history is not an ordered prefix of the canonical Git history.");
  console.error("Stop and inspect `supabase migration list --linked` before deploying.");
  process.exit(1);
}

const pending = localVersions.slice(remoteVersions.length);
if (pending.length > 0 && requireSynced) {
  console.error(`Linked project is missing ${pending.length} migration(s): ${pending.join(", ")}`);
  process.exit(1);
}

if (pending.length > 0) {
  console.log(`Linked history is consistent. Pending migrations: ${pending.join(", ")}`);
} else {
  console.log(`Linked history matches all ${localVersions.length} canonical migrations.`);
}
