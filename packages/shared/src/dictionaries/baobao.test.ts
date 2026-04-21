import { describe, expect, test } from "vitest";
import {
  APPLICATION_STATUS_LABELS,
  applicationStatusClasses,
  interviewRoundClasses,
  lookupLabel,
  lookupLabelOrDefault,
  resolveApplicationStatusCode,
} from "./baobao";

describe("shared/dictionaries/baobao", () => {
  test("resolves application status codes from numbers and labels", () => {
    expect(resolveApplicationStatusCode(-1)).toBe(-1);
    expect(resolveApplicationStatusCode(" 3 ")).toBe(3);
    expect(resolveApplicationStatusCode("已录用")).toBe(6);
    expect(resolveApplicationStatusCode("已取消")).toBe(-5);
    expect(resolveApplicationStatusCode("未知状态")).toBeNull();
  });

  test("returns semantic classes with gray fallback", () => {
    expect(applicationStatusClasses(6)).toEqual(["bg-green-100", "text-green-800"]);
    expect(applicationStatusClasses(999)).toEqual(["bg-gray-100", "text-gray-700"]);
    expect(interviewRoundClasses(3)).toEqual(["bg-blue-200", "text-blue-900"]);
  });

  test("supports lookup helpers with explicit fallback text", () => {
    expect(lookupLabel(APPLICATION_STATUS_LABELS, -10)).toBe("待HR初筛");
    expect(lookupLabel(APPLICATION_STATUS_LABELS, 999)).toBeUndefined();
    expect(lookupLabelOrDefault(APPLICATION_STATUS_LABELS, 999)).toBe("未知(999)");
  });
});
