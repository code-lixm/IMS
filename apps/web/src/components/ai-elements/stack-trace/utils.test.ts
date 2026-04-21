import { describe, expect, test } from "vitest";
import { parseStackTrace } from "./utils";

describe("stack trace utils", () => {
  test("parses error header and stack frames with function names", () => {
    const trace = [
      "TypeError: boom",
      "    at renderThing (/workspace/app.ts:12:34)",
      "    at Module.run (node:internal/modules/run_main:1:1)",
    ].join("\n");

    const parsed = parseStackTrace(trace);

    expect(parsed.errorType).toBe("TypeError");
    expect(parsed.errorMessage).toBe("boom");
    expect(parsed.frames[0]).toMatchObject({
      functionName: "renderThing",
      filePath: "/workspace/app.ts",
      lineNumber: 12,
      columnNumber: 34,
      isInternal: false,
    });
    expect(parsed.frames[1]?.isInternal).toBe(true);
  });

  test("handles traces without parseable frames", () => {
    const parsed = parseStackTrace("plain error only");

    expect(parsed.errorType).toBeNull();
    expect(parsed.errorMessage).toBe("plain error only");
    expect(parsed.frames).toEqual([]);
  });
});
