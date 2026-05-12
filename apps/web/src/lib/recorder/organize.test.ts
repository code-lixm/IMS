import { describe, expect, it } from "vitest";
import { organizeRecorderText } from "./organize";

describe("organizeRecorderText", () => {
  it("merges repeated whitespace and normalizes punctuation spacing", () => {
    expect(organizeRecorderText({
      finalTranscriptText: "Hello   world ,this   is a test !",
    })).toBe("Hello world, this is a test!");
  });

  it("inserts paragraph breaks when segment pauses exceed the threshold", () => {
    expect(organizeRecorderText({
      segments: [
        { id: "seg-1", sequence: 0, startMs: 0, endMs: 800, text: "Hello   world ,", isFinal: true },
        { id: "seg-2", sequence: 1, startMs: 950, endMs: 1600, text: "this is  recorder.", isFinal: true },
        { id: "seg-3", sequence: 2, startMs: 2900, endMs: 3600, text: "Second   paragraph  starts here.", isFinal: true },
      ],
    })).toBe("Hello world, this is recorder.\n\nSecond paragraph starts here.");
  });

  it("normalizes Chinese punctuation without adding extra spaces", () => {
    expect(organizeRecorderText({
      finalTranscriptText: "你好 ， 世界 ！  今天   辛苦了 。",
    })).toBe("你好，世界！今天辛苦了。");
  });
});
