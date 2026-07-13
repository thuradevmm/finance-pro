#!/usr/bin/env node

import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { basename, join, relative } from "node:path";
import process from "node:process";

const migrationsDir = join(process.cwd(), "supabase", "migrations");
const lockFile = join(process.cwd(), "supabase", "migrations.lock.json");
const allowMarker = "@allow-destructive-migration";
const allowFinancialDataLossMarker = "@allow-financial-data-loss";
const migrationNamePattern = /^(\d{12}|\d{14})_[a-z0-9]+(?:_[a-z0-9]+)*\.sql$/;

const riskyPatterns = [
  { label: "drop table", pattern: /\bdrop\s+table\b/i },
  { label: "drop schema", pattern: /\bdrop\s+schema\b/i },
  { label: "truncate", pattern: /\btruncate(?:\s+table)?\b/i },
  { label: "delete from", pattern: /\bdelete\s+from\b/i },
  { label: "drop column", pattern: /\bdrop\s+column\b/i },
  { label: "drop constraint", pattern: /\bdrop\s+constraint\b/i },
  { label: "alter table drop", pattern: /\balter\s+table\b.*\bdrop\b/i },
  { label: "cascade", pattern: /\bcascade\b/i },
];

const protectedFinancialTables = [
  "accounts",
  "assets",
  "budget_items",
  "budget_plans",
  "categories",
  "debt_payments",
  "debts",
  "person_payment_records",
  "people",
  "savings_goal_entries",
  "savings_goals",
  "subscription_payments",
  "subscriptions",
  "transactions",
  "uploaded_files",
];

const protectedTablePattern = protectedFinancialTables.join("|");
const financialDataLossPatterns = [
  {
    label: "hard delete from a financial table",
    pattern: new RegExp(`\\bdelete\\s+from\\s+(?:public\\.)?(?:${protectedTablePattern})\\b`, "i"),
  },
  {
    label: "truncate a financial table",
    pattern: new RegExp(`\\btruncate(?:\\s+table)?\\s+(?:public\\.)?(?:${protectedTablePattern})\\b`, "i"),
  },
  {
    label: "drop a financial table",
    pattern: new RegExp(`\\bdrop\\s+table(?:\\s+if\\s+exists)?\\s+(?:public\\.)?(?:${protectedTablePattern})\\b`, "i"),
  },
  {
    label: "visibility-changing update to transactions",
    pattern: /\bupdate\s+(?:public\.)?transactions(?:\s+(?:as\s+)?[a-z_][a-z0-9_]*)?\s+set\b[^;]*\b(?:deleted_at|status|user_id)\s*=/i,
  },
];

function sqlFiles(dir) {
  return readdirSync(dir, { withFileTypes: true })
    .flatMap((entry) => {
      const entryPath = join(dir, entry.name);
      if (entry.isDirectory()) return sqlFiles(entryPath);
      return entry.isFile() && entry.name.endsWith(".sql") ? [entryPath] : [];
    })
    .sort();
}

function stripInlineComment(line) {
  const commentIndex = line.indexOf("--");
  return commentIndex === -1 ? line : line.slice(0, commentIndex);
}

function hasNearbyMarker(lines, index, marker) {
  const start = Math.max(0, index - 3);
  for (let current = index; current >= start; current -= 1) {
    if (lines[current]?.includes(marker)) return true;
  }
  return false;
}

function sha256(content) {
  return createHash("sha256").update(content).digest("hex");
}

function fail(message) {
  console.error(message);
  process.exitCode = 1;
}

function git(...args) {
  return execFileSync("git", args, {
    cwd: process.cwd(),
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

function gitContent(...args) {
  return execFileSync("git", args, {
    cwd: process.cwd(),
    stdio: ["ignore", "pipe", "pipe"],
  });
}

function validateMigrationHistory(files) {
  if (!existsSync(lockFile)) {
    fail("Missing supabase/migrations.lock.json. Seal the canonical history before sharing migrations.");
    return;
  }

  const lock = JSON.parse(readFileSync(lockFile, "utf8"));
  if (lock.formatVersion !== 1 || !Array.isArray(lock.migrations)) {
    fail("supabase/migrations.lock.json has an unsupported format.");
    return;
  }

  const lockedByFile = new Map(lock.migrations.map((entry) => [entry.file, entry]));
  const currentNames = new Set(files.map((file) => basename(file)));

  if (lockedByFile.size !== lock.migrations.length) {
    fail("Duplicate migration filenames exist in supabase/migrations.lock.json.");
  }

  for (const file of files) {
    const name = basename(file);
    const entry = lockedByFile.get(name);
    if (!entry) {
      fail(`Unsealed migration: supabase/migrations/${name}. Run npm run db:migration:seal after review.`);
      continue;
    }

    const actualHash = sha256(readFileSync(file));
    if (entry.sha256 !== actualHash) {
      fail(`Immutable migration changed: supabase/migrations/${name}. Create a new migration instead of editing history.`);
    }
    if (entry.version !== name.split("_", 1)[0]) {
      fail(`Locked migration version does not match its filename: ${name}`);
    }
  }

  for (const entry of lock.migrations) {
    if (!currentNames.has(entry.file)) {
      fail(`Sealed migration was removed: supabase/migrations/${entry.file}. Restore it from Git.`);
    }
  }

  const versions = lock.migrations.map((entry) => entry.version);
  if (new Set(versions).size !== versions.length) {
    fail("Duplicate migration versions exist in supabase/migrations.lock.json.");
  }

  const sortedVersions = [...versions].sort();
  if (versions.join("\n") !== sortedVersions.join("\n")) {
    fail("Migration lock entries are not ordered by version.");
  }

  if (lock.sealedThrough !== sortedVersions.at(-1)) {
    fail("migrations.lock.json sealedThrough must equal the latest sealed version.");
  }

  validateImmutableGitDiff(lock.historyRepairs ?? []);
}

function validateImmutableGitDiff(historyRepairs) {
  const baseRef = process.env.MIGRATION_BASE_REF || "origin/main";

  try {
    git("rev-parse", "--verify", `${baseRef}^{commit}`);
  } catch {
    console.warn(`Migration history comparison skipped because Git ref ${baseRef} is unavailable.`);
    return;
  }

  let changes;
  try {
    changes = git("diff", "--name-status", baseRef, "--", "supabase/migrations");
  } catch (error) {
    fail(`Unable to compare migration history with ${baseRef}: ${error.message}`);
    return;
  }

  for (const line of changes.split(/\r?\n/).filter(Boolean)) {
    const [status, path] = line.split(/\s+/, 2);
    if (!path?.endsWith(".sql") || status === "A") continue;

    if (status === "D") {
      fail(`Committed migration deleted relative to ${baseRef}: ${path}`);
      continue;
    }

    if (status !== "M") {
      fail(`Unsupported historical migration change (${status}) relative to ${baseRef}: ${path}`);
      continue;
    }

    let previousHash;
    try {
      previousHash = sha256(gitContent("show", `${baseRef}:${path}`));
    } catch {
      fail(`Unable to read historical migration ${path} from ${baseRef}.`);
      continue;
    }

    const canonicalHash = sha256(readFileSync(join(process.cwd(), path)));
    const approvedRepair = historyRepairs.some(
      (repair) =>
        repair.file === basename(path) &&
        repair.previousSha256 === previousHash &&
        repair.canonicalSha256 === canonicalHash &&
        typeof repair.reason === "string" &&
        repair.reason.trim().length >= 20,
    );

    if (!approvedRepair) {
      fail(`Committed migration modified relative to ${baseRef}: ${path}. Add a new migration instead.`);
    } else {
      console.warn(`APPROVED HISTORY REPAIR: ${path}`);
    }
  }
}

let unapprovedCount = 0;
let approvedCount = 0;
let financialDataLossCount = 0;

if (!existsSync(migrationsDir)) {
  console.error("Missing supabase/migrations directory.");
  process.exit(1);
}

const migrationFiles = sqlFiles(migrationsDir);
const seenVersions = new Set();

for (const file of migrationFiles) {
  const name = basename(file);
  if (join(migrationsDir, name) !== file) {
    fail(`Nested migration files are not supported: ${relative(process.cwd(), file)}`);
  }
  if (!migrationNamePattern.test(name)) {
    fail(`Invalid migration filename: ${relative(process.cwd(), file)}. Use a timestamp and snake_case name.`);
    continue;
  }

  const version = name.split("_", 1)[0];
  if (seenVersions.has(version)) fail(`Duplicate migration version: ${version}`);
  seenVersions.add(version);

  if (statSync(file).size === 0) fail(`Empty migration file: ${relative(process.cwd(), file)}`);
}

validateMigrationHistory(migrationFiles);

for (const file of migrationFiles) {
  const relativeFile = relative(process.cwd(), file).replaceAll("\\", "/");
  const lines = readFileSync(file, "utf8").split(/\r?\n/);
  const normalizedSql = lines
    .map(stripInlineComment)
    .join("\n")
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/\s+/g, " ");
  const hasBothFinancialDataLossMarkers =
    lines.some((line) => line.includes(allowMarker)) &&
    lines.some((line) => line.includes(allowFinancialDataLossMarker));

  for (const risk of financialDataLossPatterns) {
    if (risk.pattern.test(normalizedSql) && !hasBothFinancialDataLossMarkers) {
      const alreadyDetectedOnOneLine = lines.some((line) => risk.pattern.test(stripInlineComment(line)));
      if (!alreadyDetectedOnOneLine) {
        financialDataLossCount += 1;
        console.error(`FORBIDDEN FINANCIAL DATA LOSS: ${relativeFile} contains multiline ${risk.label}.`);
      }
    }
  }

  lines.forEach((line, index) => {
    const sql = stripInlineComment(line);

    for (const risk of financialDataLossPatterns) {
      if (!risk.pattern.test(sql)) continue;
      const lineNumber = index + 1;
      const message = `${relativeFile}:${lineNumber} ${risk.label}: ${line.trim()}`;
      if (
        hasNearbyMarker(lines, index, allowMarker) &&
        hasNearbyMarker(lines, index, allowFinancialDataLossMarker)
      ) {
        console.warn(`ALLOWED FINANCIAL DATA LOSS: ${message}`);
      } else {
        financialDataLossCount += 1;
        console.error(`FORBIDDEN FINANCIAL DATA LOSS: ${message}`);
      }
    }

    for (const risk of riskyPatterns) {
      if (!risk.pattern.test(sql)) continue;

      const lineNumber = index + 1;
      const message = `${relativeFile}:${lineNumber} ${risk.label}: ${line.trim()}`;
      if (hasNearbyMarker(lines, index, allowMarker)) {
        approvedCount += 1;
        console.warn(`ALLOWED DESTRUCTIVE MIGRATION WARNING: ${message}`);
      } else {
        unapprovedCount += 1;
        console.error(`UNAPPROVED DESTRUCTIVE MIGRATION: ${message}`);
      }
    }
  });
}

if (approvedCount > 0) {
  console.warn(`Reviewed destructive migration exceptions: ${approvedCount}`);
}

if (unapprovedCount > 0) {
  console.error(`Found ${unapprovedCount} unapproved destructive migration warning(s).`);
  console.error(`Add a nearby -- ${allowMarker}: reason comment only after manual review.`);
  process.exitCode = 1;
}

if (financialDataLossCount > 0) {
  console.error(`Found ${financialDataLossCount} unapproved financial data-loss statement(s).`);
  console.error(`Normal migrations must preserve financial rows. Emergency deletion requires both review markers.`);
  process.exitCode = 1;
}

if (process.exitCode) process.exit(process.exitCode);

console.log("Supabase migration safety check passed.");
