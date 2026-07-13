#!/usr/bin/env node

import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { createInterface } from "node:readline/promises";
import process from "node:process";

function capture(command, args) {
  return execFileSync(command, args, { cwd: process.cwd(), encoding: "utf8" }).trim();
}

function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: process.cwd(),
    stdio: "inherit",
    shell: process.platform === "win32",
  });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

const branch = capture("git", ["branch", "--show-current"]);
const allowedBranches = (process.env.SUPABASE_DEPLOY_BRANCHES || "main")
  .split(",")
  .map((value) => value.trim())
  .filter(Boolean);

if (!allowedBranches.includes(branch)) {
  console.error(`Database deployment is blocked from branch ${branch || "(detached HEAD)"}.`);
  console.error(`Allowed deployment branches: ${allowedBranches.join(", ")}`);
  process.exit(1);
}

const migrationChanges = capture("git", [
  "status",
  "--porcelain",
  "--",
  "supabase/migrations",
  "supabase/migrations.lock.json",
]);
if (migrationChanges) {
  console.error("Database deployment is blocked because migration history has uncommitted changes:");
  console.error(migrationChanges);
  process.exit(1);
}

let upstream;
try {
  upstream = capture("git", ["rev-parse", "@{upstream}"]);
} catch {
  console.error("Database deployment is blocked because this branch has no Git upstream.");
  process.exit(1);
}

const head = capture("git", ["rev-parse", "HEAD"]);
if (head !== upstream) {
  console.error("Database deployment is blocked because local HEAD does not match its pushed upstream commit.");
  console.error("Merge and push migrations through Git review before deploying them.");
  process.exit(1);
}

run("npm", ["run", "db:migration:check"]);
run("npm", ["run", "db:remote:check"]);
run("npx", ["supabase", "db", "push", "--dry-run"]);

const projectRefPath = join(process.cwd(), "supabase", ".temp", "project-ref");
const projectRef = existsSync(projectRefPath) ? readFileSync(projectRefPath, "utf8").trim() : "linked-project";
const confirmation = `DEPLOY ${projectRef}`;
const rl = createInterface({ input: process.stdin, output: process.stdout });
console.warn("This applies canonical migrations to the linked database without resetting it.");
console.warn("Confirm that a current backup exists before continuing.");
const answer = await rl.question(`Type "${confirmation}" to deploy: `);
rl.close();

if (answer !== confirmation) {
  console.error("Database deployment cancelled.");
  process.exit(1);
}

run("npx", ["supabase", "db", "push"]);
run("npm", ["run", "db:remote:verify"]);
