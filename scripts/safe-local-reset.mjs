#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { createInterface } from "node:readline/promises";
import process from "node:process";

const confirmation = "RESET LOCAL SUPABASE";

console.warn("This command runs `supabase db reset` against the local Supabase stack only.");
console.warn("It deletes unseeded rows in your local database and rebuilds from migrations/seed.");
console.warn("Do not use this for a linked remote project. This script never passes --linked.");
console.warn("Export local data first if you need to keep it.");

const rl = createInterface({ input: process.stdin, output: process.stdout });
const answer = await rl.question(`Type "${confirmation}" to continue: `);
rl.close();

if (answer !== confirmation) {
  console.error("Local reset cancelled.");
  process.exit(1);
}

const result = spawnSync("npx", ["supabase", "db", "reset", "--local", "--no-seed"], {
  shell: process.platform === "win32",
  stdio: "inherit",
});

process.exit(result.status ?? 1);
