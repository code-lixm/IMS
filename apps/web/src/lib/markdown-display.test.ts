import { describe, expect, test } from "vitest";
import { stripDisplayOnlyFrontmatter } from "./markdown-display";

describe("markdown-display", () => {
  test("removes display-only interview frontmatter", () => {
    const markdown = [
      "---",
      "type: interview-stage-document",
      "generated_by: orchestrator",
      "generated_at: 2026-04-20T00:00:00.000Z",
      "schema_version: 1.1.0",
      "candidate_name: \"胡少松\"",
      "source_inputs:",
      "  - ./resume.pdf",
      "---",
      "# 正文标题",
    ].join("\n");

    expect(stripDisplayOnlyFrontmatter(markdown)).toBe("# 正文标题");
  });

  test("keeps unrelated frontmatter unchanged", () => {
    const markdown = [
      "---",
      "title: hello",
      "---",
      "正文",
    ].join("\n");

    expect(stripDisplayOnlyFrontmatter(markdown)).toBe(markdown);
  });
});
