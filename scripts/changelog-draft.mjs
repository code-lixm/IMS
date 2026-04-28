#!/usr/bin/env node

/**
 * changelog-draft.mjs
 *
 * Generates a changelog draft from conventional commits using git-cliff,
 * then inserts it into the [Unreleased] section of CHANGELOG.md.
 *
 * This creates a human-curatable starting point — the output is NOT a
 * final release notes replacement.
 *
 * Usage:
 *   node scripts/changelog-draft.mjs
 *   pnpm changelog:draft
 */

import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

const cwd = process.cwd();
const changelogPath = path.join(cwd, "CHANGELOG.md");
const cliffConfig = path.join(cwd, "cliff.toml");

// ── Step 1: Run git-cliff to generate unreleased changelog ─────────────
let output;
try {
  output = execFileSync(
    "npx",
    ["git-cliff", "--config", cliffConfig, "--unreleased", "--strip", "header"],
    { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
  ).trim();
} catch (err) {
  // stderr might contain warnings; check stdout for actual content
  output = (err.stdout ?? "").trim();
}

if (!output) {
  console.log("No unreleased changes to draft.");
  process.exit(0);
}

// ── Step 2: Read existing CHANGELOG.md ─────────────────────────────────
if (!fs.existsSync(changelogPath)) {
  console.error("CHANGELOG.md not found.");
  process.exit(1);
}

const changelog = fs.readFileSync(changelogPath, "utf8");

// ── Step 3: Insert draft into [Unreleased] section ────────────────────
// Match from "## [Unreleased]" up to (but not including) the next "## " heading.
const unreleasedPattern = /^## \[Unreleased\][\s\S]*?(?=\n## )/m;
const match = changelog.match(unreleasedPattern);

if (!match) {
  console.error(
    'Error: Could not find [Unreleased] section. Make sure CHANGELOG.md has a "## [Unreleased]" heading followed by "## [version]" headings.',
  );
  process.exit(1);
}

const updated = changelog.replace(
  unreleasedPattern,
  `## [Unreleased]\n\n${output.trim()}`,
);

fs.writeFileSync(changelogPath, updated, "utf8");
console.log("✓ Changelog draft inserted into [Unreleased] section.");
console.log("  Review and curate the entries before release.");
