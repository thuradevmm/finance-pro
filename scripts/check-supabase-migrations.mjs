#!/usr/bin/env node

import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import process from "node:process";

const migrationsDir = join(process.cwd(), "supabase", "migrations");
const allowMarker = "@allow-destructive-migration";

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

function hasNearbyAllowMarker(lines, index) {
  const start = Math.max(0, index - 3);
  for (let current = index; current >= start; current -= 1) {
    if (lines[current]?.includes(allowMarker)) return true;
  }
  return false;
}

let unapprovedCount = 0;
let approvedCount = 0;

for (const file of sqlFiles(migrationsDir)) {
  const relativeFile = relative(process.cwd(), file).replaceAll("\\", "/");
  const lines = readFileSync(file, "utf8").split(/\r?\n/);

  lines.forEach((line, index) => {
    const sql = stripInlineComment(line);
    for (const risk of riskyPatterns) {
      if (!risk.pattern.test(sql)) continue;

      const lineNumber = index + 1;
      const message = `${relativeFile}:${lineNumber} ${risk.label}: ${line.trim()}`;
      if (hasNearbyAllowMarker(lines, index)) {
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
  process.exit(1);
}

console.log("Supabase migration safety check passed.");
