/**
 * generate-whats-new.test.ts — Bun test for parseChangelogEntry & main script.
 *
 * Uses Bun test runner (import from "bun:test").
 * Test file lives under scripts/__tests__/ which is outside Vitest workspace.
 */

import { afterEach, describe, expect, test, mock } from "bun:test";
import { parseChangelogEntry, parseAllChangelogEntries } from "../generate-whats-new.mjs";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a standard Keep a Changelog snippet with one or more version entries. */
function buildChangelog(entries: string[]): string {
  const header = "# Changelog\n\nAll notable changes to this project will be documented in this file.\n\n";
  return header + entries.join("\n\n");
}

/** A well-formed single version entry. */
function wellFormedEntry(version: string, date: string): string {
  return [
    `## [${version}] - ${date}`,
    "",
    "### 新增",
    "",
    "- Feature A",
    "- Feature B",
    "",
    "### 修复",
    "",
    "- Bug fix 1",
  ].join("\n");
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("parseChangelogEntry", () => {
  // 1. 正常解析：标准 Keep a Changelog 格式 → 正确 WhatsNewEntry
  test("normal parsing: standard Keep a Changelog format", () => {
    const changelog = buildChangelog([
      wellFormedEntry("2.0.0", "2025-01-01"),
      wellFormedEntry("1.5.0", "2024-12-01"),
    ]);

    const entry = parseChangelogEntry(changelog, "1.5.0");

    expect(entry).not.toBeNull();
    expect(entry!.version).toBe("1.5.0");
    expect(entry!.date).toBe("2024-12-01");
    expect(entry!.sections).toHaveLength(2);
    expect(entry!.sections[0]).toEqual({
      title: "新增",
      items: ["Feature A", "Feature B"],
    });
    expect(entry!.sections[1]).toEqual({
      title: "修复",
      items: ["Bug fix 1"],
    });
  });

  // 2. 无版本条目：CHANGELOG.md 无目标版本 → 输出 null
  test("missing version: returns null when version not found", () => {
    const changelog = buildChangelog([wellFormedEntry("1.0.0", "2024-01-01")]);

    const entry = parseChangelogEntry(changelog, "2.0.0");

    expect(entry).toBeNull();
  });

  // 3. 格式错误：版本标题格式不正确 → 输出 null
  test("malformed heading: returns null for incorrect version heading format", () => {
    const badSection = [
      "## 1.5.0 - This is wrong (no brackets)",
      "",
      "### 新增",
      "",
      "- Item",
    ].join("\n");

    const changelog = buildChangelog([badSection]);

    const entry = parseChangelogEntry(changelog, "1.5.0");

    expect(entry).toBeNull();
  });

  // 4. 空文件：CHANGELOG.md 为空 → 输出 null
  test("empty file: returns null for empty content", () => {
    const entry = parseChangelogEntry("", "1.0.0");

    expect(entry).toBeNull();
  });

  // 5. 多版本条目：只提取目标版本段
  test("multiple versions: only extracts the target version section", () => {
    const v2Section = [
      "## [2.0.0] - 2025-01-15",
      "",
      "### 新增",
      "",
      "- Big feature",
    ].join("\n");

    const v1Section = [
      "## [1.0.0] - 2024-06-01",
      "",
      "### 新增",
      "",
      "- First release",
    ].join("\n");

    const changelog = buildChangelog([v2Section, v1Section]);

    const entry = parseChangelogEntry(changelog, "1.0.0");

    expect(entry).not.toBeNull();
    expect(entry!.version).toBe("1.0.0");
    expect(entry!.sections).toHaveLength(1);
    expect(entry!.sections[0].items).toEqual(["First release"]);
  });

  // 6. 版本间分隔：后面的版本段不影响当前条目提取
  test("section boundary: stops parsing at the next version heading", () => {
    const changelog = buildChangelog([
      wellFormedEntry("2.0.0", "2025-01-01"),
      wellFormedEntry("1.0.0", "2024-01-01"),
    ]);

    const entry = parseChangelogEntry(changelog, "1.0.0");

    expect(entry).not.toBeNull();
    // The entry for 1.0.0 should NOT include content from 2.0.0 section
    expect(entry!.sections).toHaveLength(2);
    expect(entry!.sections[0].items).toEqual(["Feature A", "Feature B"]);
  });

  // 7. 图表内容：无分类标题的条目返回 sections 为空数组
  test("no categories: entry without ### section headers returns empty sections", () => {
    const changelog = buildChangelog([
      [
        "## [1.0.0] - 2024-01-01",
        "",
        "- Lone bullet",
        "- Another bullet",
      ].join("\n"),
    ]);

    const entry = parseChangelogEntry(changelog, "1.0.0");

    expect(entry).not.toBeNull();
    expect(entry!.sections).toEqual([]);
  });

  // 8. 特殊版本字符：正则安全转义版本号中的特殊字符
  test("special version chars: regexp-safe escaping for version with dots", () => {
    const changelog = buildChangelog([
      wellFormedEntry("1.10.30", "2026-04-27"),
    ]);

    const entry = parseChangelogEntry(changelog, "1.10.30");

    expect(entry).not.toBeNull();
    expect(entry!.version).toBe("1.10.30");
    expect(entry!.date).toBe("2026-04-27");
  });

  // 9. 空白行在分类间：blank lines between sections are ignored
  test("blank lines between sections: extra whitespace is handled", () => {
    const content = [
      "# Changelog",
      "",
      "## [1.0.0] - 2024-01-01",
      "",
      "",
      "",
      "### 新增",
      "",
      "",
      "- Item A",
      "",
      "",
      "### 修复",
      "",
      "- Fix 1",
    ].join("\n");

    const entry = parseChangelogEntry(content, "1.0.0");

    expect(entry).not.toBeNull();
    expect(entry!.sections).toHaveLength(2);
    expect(entry!.sections[0].items).toEqual(["Item A"]);
    expect(entry!.sections[1].items).toEqual(["Fix 1"]);
  });

  // 10. Markdown 富文本：bold 和 link 格式保留原样
  test("markdown rich text: bold and links are preserved", () => {
    const content = buildChangelog([
      [
        "## [1.0.0] - 2024-01-01",
        "",
        "### 新增",
        "",
        "- **Bold feature** description",
        "- Feature with [a link](https://example.com)",
        "- Mixed **bold** and [link](https://test.com) inline",
      ].join("\n"),
    ]);

    const entry = parseChangelogEntry(content, "1.0.0");

    expect(entry).not.toBeNull();
    expect(entry!.sections[0].items).toEqual([
      "**Bold feature** description",
      "Feature with [a link](https://example.com)",
      "Mixed **bold** and [link](https://test.com) inline",
    ]);
  });
});

describe("parseAllChangelogEntries", () => {
  // 1. 多版本：返回所有条目，按出现顺序排列（ newest first）
  test("multiple versions: returns all entries in changelog order", () => {
    const changelog = buildChangelog([
      wellFormedEntry("2.0.0", "2025-01-01"),
      wellFormedEntry("1.5.0", "2024-12-01"),
      wellFormedEntry("1.0.0", "2024-01-01"),
    ]);

    const entries = parseAllChangelogEntries(changelog);

    expect(entries).toHaveLength(3);
    expect(entries[0].version).toBe("2.0.0");
    expect(entries[0].date).toBe("2025-01-01");
    expect(entries[1].version).toBe("1.5.0");
    expect(entries[2].version).toBe("1.0.0");
    expect(entries[0].sections).toHaveLength(2);
    expect(entries[0].sections[0].items).toEqual(["Feature A", "Feature B"]);
  });

  // 2. 跳过 Unreleased
  test("skips Unreleased: does not include Unreleased section", () => {
    const changelog = [
      "# Changelog\n",
      "## [Unreleased]",
      "\n### 新增\n\n- Not released yet\n",
      "\n## [1.0.0] - 2024-01-01\n",
      "\n### 新增\n\n- First release\n",
    ].join("\n");

    const entries = parseAllChangelogEntries(changelog);

    expect(entries).toHaveLength(1);
    expect(entries[0].version).toBe("1.0.0");
  });

  // 3. 空内容：返回空数组
  test("empty content: returns empty array", () => {
    const entries = parseAllChangelogEntries("");
    expect(entries).toEqual([]);
  });

  // 4. 仅 Unreleased：返回空数组
  test("only Unreleased: returns empty array when only Unreleased exists", () => {
    const changelog = [
      "# Changelog\n",
      "## [Unreleased]\n",
      "\n### 新增\n\n- WIP\n",
    ].join("\n");

    const entries = parseAllChangelogEntries(changelog);
    expect(entries).toEqual([]);
  });

  // 5. 混合条目：有些条目无 categories
  test("mixed entries: entries without categories have empty sections", () => {
    const v2Section = ["## [2.0.0] - 2025-01-01", "", "- Only bullets no section"].join("\n");
    const v1Section = wellFormedEntry("1.0.0", "2024-01-01");
    const changelog = buildChangelog([v2Section, v1Section]);

    const entries = parseAllChangelogEntries(changelog);

    expect(entries).toHaveLength(2);
    expect(entries[0].sections).toEqual([]);
    expect(entries[1].sections).toHaveLength(2);
  });

  // 6. versions[0] 等于 current version
  test("versions[0] matches current version in standard changelog", () => {
    const changelog = buildChangelog([
      wellFormedEntry("2.0.0", "2025-01-01"),
      wellFormedEntry("1.0.0", "2024-01-01"),
    ]);

    const entries = parseAllChangelogEntries(changelog);
    const latestEntry = parseChangelogEntry(changelog, "2.0.0");

    expect(entries[0].version).toBe(latestEntry!.version);
    expect(entries[0].date).toBe(latestEntry!.date);
    expect(entries[0].sections).toEqual(latestEntry!.sections);
  });
});
