import { describe, expect, test } from "bun:test";
import { ApiError } from "@/api/client";
import { isUnauthorizedError, normalizeAppError } from "./normalize";

describe("normalizeAppError", () => {
  test("preserves ApiError details", () => {
    const error = new ApiError("BAD", "boom", 400);
    const normalized = normalizeAppError(error, { title: "失败" });

    expect(normalized).toMatchObject({
      title: "失败",
      message: "boom",
      code: "BAD",
      status: 400,
    });
  });

  test("falls back for unknown values", () => {
    const normalized = normalizeAppError(null, { fallbackMessage: "稍后再试" });
    expect(normalized.message).toBe("稍后再试");
  });

  test("detects unauthorized api errors", () => {
    expect(isUnauthorizedError(new ApiError("AUTH", "denied", 401))).toBe(true);
    expect(isUnauthorizedError(new ApiError("BAD", "boom", 500))).toBe(false);
  });
});
