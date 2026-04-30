/**
 * Changelog display types for the "What's New" feature.
 *
 * These types describe the shape of changelog data displayed
 * in the application UI. The data is generated at build time
 * from CHANGELOG.md by a build script.
 *
 * @see CHANGELOG.md (project root) — single source of truth
 */

// ---------------------------------------------------------------------------
// Changelog types
// ---------------------------------------------------------------------------

/** A single changelog entry for one version. */
export interface WhatsNewEntry {
  version: string;
  date: string;
  sections: WhatsNewSection[];
}

/** A category section within a changelog entry (e.g. 新增 / 修复 / 优化). */
export interface WhatsNewSection {
  title: string;
  items: string[];
}

/**
 * The full changelog data shape bundled into the Web frontend.
 *
 * Maintains backward compatibility: top-level version/date/sections reflect
 * the current (latest) version entry.  The versions array contains all
 * parsed entries in changelog order (newest first).
 */
export interface WhatsNewData {
  version: string;
  date: string;
  sections: WhatsNewSection[];
  versions: WhatsNewEntry[];
}
