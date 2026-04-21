import { describe, expect, test } from "vitest";
import { renderSafeMarkdown } from "./render-safe-markdown";

describe("renderSafeMarkdown", () => {
  test("renders markdown and strips unsafe html", () => {
    const html = renderSafeMarkdown("# Title\n\n<img src=x onerror=alert(1)><script>alert(1)</script>");

    expect(html).toContain("<h1>Title</h1>");
    expect(html).not.toContain("<script>");
    expect(html).not.toContain("onerror=");
  });
});
