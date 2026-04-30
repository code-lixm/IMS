#!/usr/bin/env node
/**
 * generate-whats-new.mjs
 *
 * Reads CHANGELOG.md, extracts the section for the current version
 * (from root package.json), and outputs whats-new.json for bundling
 * into the Web frontend.
 *
 * Usage:
 *   node scripts/generate-whats-new.mjs
 *
 * Output:
 *   apps/web/src/assets/whats-new.json — static JSON matching WhatsNewEntry type
 */

import fs from "node:fs";
import path from "node:path";

const cwd = process.cwd();

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function readText(relPath) {
  return fs.readFileSync(path.join(cwd, relPath), "utf8");
}

function readJson(relPath) {
  return JSON.parse(readText(relPath));
}

function writeJson(relPath, data) {
  const absPath = path.join(cwd, relPath);
  const dir = path.dirname(absPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(absPath, JSON.stringify(data, null, 2), "utf8");
}

// ---------------------------------------------------------------------------
// Core
// ---------------------------------------------------------------------------

/**
 * Parse a CHANGELOG.md section into a WhatsNewEntry.
 *
 * Format:
 *   ## [VERSION] - YYYY-MM-DD
 *   (blank line)
 *   ### 分类名
 *   (blank)
 *   - item 1
 *   - item 2
 *   ...
 *
 * Stops at the next "## [" heading or EOF.
 */
export function parseChangelogEntry(content, version) {
  const lines = content.split("\n");

  // Find the version heading: ## [VERSION]
  const escapedVersion = version.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const entryStartRegex = new RegExp(`^## \\[${escapedVersion}\\] - (\\d{4}-\\d{2}-\\d{2})$`);

  let entryStart = -1;
  let date = "";

  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(entryStartRegex);
    if (m) {
      entryStart = i;
      date = m[1];
      break;
    }
  }

  if (entryStart === -1) {
    return null;
  }

  // Find the end of this entry: next "## [" heading or EOF
  let entryEnd = lines.length;
  for (let i = entryStart + 1; i < lines.length; i++) {
    if (/^## \[/.test(lines[i])) {
      entryEnd = i;
      break;
    }
  }

  // Parse categories and items
  /** @type {{ title: string; items: string[] }[]} */
  const sections = [];
  let currentSection = null;

  for (let i = entryStart + 1; i < entryEnd; i++) {
    const line = lines[i];

    // Category heading: ### 中文名
    const headingMatch = line.match(/^### (.+)$/);
    if (headingMatch) {
      currentSection = { title: headingMatch[1].trim(), items: [] };
      sections.push(currentSection);
      continue;
    }

    // Bullet item: - text (may contain **bold** or [links](url))
    const bulletMatch = line.match(/^- (.+)$/);
    if (bulletMatch && currentSection) {
      currentSection.items.push(bulletMatch[1].trim());
      continue;
    }
  }

  return { version, date, sections };
}

/**
 * Parse all version entries from a CHANGELOG.md content.
 *
 * Returns entries in the order they appear in the file (newest first).
 * Skips the Unreleased section.
 */
export function parseAllChangelogEntries(content) {
  const lines = content.split("\n");
  const entries = [];

  // Regex to match any ## [VERSION] - YYYY-MM-DD heading (with date capture)
  const headingRegex = /^## \[([^\]]+)\] - (\d{4}-\d{2}-\d{2})$/;

  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(headingRegex);
    if (!m) continue;

    const version = m[1];
    // Skip Unreleased
    if (version === "Unreleased") continue;

    const date = m[2];
    // Find end of this entry: next "## [" heading or EOF
    let entryEnd = lines.length;
    for (let j = i + 1; j < lines.length; j++) {
      if (/^## \[/.test(lines[j])) {
        entryEnd = j;
        break;
      }
    }

    // Parse categories and items (same logic as parseChangelogEntry)
    /** @type {{ title: string; items: string[] }[]} */
    const sections = [];
    let currentSection = null;

    for (let k = i + 1; k < entryEnd; k++) {
      const line = lines[k];
      const headingMatch = line.match(/^### (.+)$/);
      if (headingMatch) {
        currentSection = { title: headingMatch[1].trim(), items: [] };
        sections.push(currentSection);
        continue;
      }
      const bulletMatch = line.match(/^- (.+)$/);
      if (bulletMatch && currentSection) {
        currentSection.items.push(bulletMatch[1].trim());
        continue;
      }
    }

    entries.push({ version, date, sections });
  }

  return entries;
}

function main() {
  const rootPkg = readJson("package.json");
  const version = rootPkg.version;

  let changelogContent;
  try {
    changelogContent = readText("CHANGELOG.md");
  } catch {
    // No CHANGELOG.md: output fallback
    console.log("[whats-new] CHANGELOG.md not found — generating empty entry");
    writeJson("apps/web/src/assets/whats-new.json", {
      version,
      date: "",
      sections: [],
      versions: [],
    });
    return;
  }

  // Parse all entries first
  const allEntries = parseAllChangelogEntries(changelogContent);

  // Find the current version entry
  const entry = parseChangelogEntry(changelogContent, version);

  if (!entry) {
    console.log(`[whats-new] No entry for v${version} in CHANGELOG.md — generating empty entry`);
    writeJson("apps/web/src/assets/whats-new.json", {
      version,
      date: "",
      sections: [],
      versions: allEntries,
    });
    return;
  }

  // Build output: top-level fields for current version + all versions array
  const output = {
    version: entry.version,
    date: entry.date,
    sections: entry.sections,
    versions: allEntries,
  };

  writeJson("apps/web/src/assets/whats-new.json", output);
  console.log(`[whats-new] Generated whats-new.json for v${entry.version} (${entry.date}) with ${allEntries.length} version(s)`);
  if (entry.sections.length > 0) {
    const sections = entry.sections.map((s) => `${s.title}(${s.items.length})`).join(", ");
    console.log(`[whats-new]   Sections: ${sections}`);
  }
}

main();
