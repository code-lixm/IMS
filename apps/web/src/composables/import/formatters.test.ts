import { describe, expect, test } from "vitest";
import {
  formatImportBatchDisplayName,
  formatImportTimestamp,
  importStageLabel,
  parseImportTaskResult,
  screeningScoreClass,
  screeningSourceLabel,
  statusLabel,
  statusVariant,
} from "./formatters";

describe("import formatters", () => {
  test("maps task statuses to stable labels and variants", () => {
    expect(statusVariant("completed")).toBe("default");
    expect(statusVariant("failed")).toBe("destructive");
    expect(statusVariant("unknown")).toBe("outline");
    expect(statusLabel("partial_success")).toBe("部分成功");
    expect(statusLabel("unknown")).toBe("unknown");
  });

  test("parses import task payloads and rejects malformed json", () => {
    expect(parseImportTaskResult(null)).toBeNull();
    expect(parseImportTaskResult("{oops}")).toBeNull();
    const parsed = parseImportTaskResult(JSON.stringify({
      parsedResume: { rawText: "resume" },
      extractionConfidence: 88,
      screeningStatus: "completed",
      screeningConclusion: {
        wechatCopyText: "推荐复试",
      },
    }));
    expect(parsed?.screeningStatus).toBe("completed");
    expect(parsed?.extractionConfidence).toBe(88);
    expect(parsed?.screeningConclusion?.wechatCopyText).toBe("推荐复试");
  });

  test("colors screening score by threshold boundaries", () => {
    expect(screeningScoreClass(undefined)).toContain("bg-muted");
    expect(screeningScoreClass(59)).toContain("bg-red-100");
    expect(screeningScoreClass(60)).toContain("bg-orange-100");
    expect(screeningScoreClass(70)).toContain("bg-blue-100");
    expect(screeningScoreClass(85)).toContain("bg-green-100");
  });

  test("formats source labels and timestamps for zh-CN display", () => {
    expect(screeningSourceLabel("ai")).toBe("AI Agent");
    expect(screeningSourceLabel("heuristic")).toBe("规则回退");
    expect(screeningSourceLabel("failed")).toBe("AI 初筛失败");
    expect(screeningSourceLabel(null)).toBe("");
    expect(formatImportTimestamp(new Date(2026, 3, 20, 1, 5).getTime())).toMatch(/04\/20.*01:05|4\/20.*01:05/);
  });

  test("formats import stages with stable chinese labels", () => {
    expect(importStageLabel("processing")).toBe("处理中");
    expect(importStageLabel("partial_success")).toBe("部分成功");
    expect(importStageLabel("failed")).toBe("失败");
    expect(importStageLabel("unknown")).toBe("unknown");
  });

  test("formats batch display name with custom name when provided", () => {
    const batch = {
      id: "batch_abc12345",
      displayName: "技术终面批次",
      createdAt: Date.now(),
      totalFiles: 10,
    };
    expect(formatImportBatchDisplayName(batch)).toBe("技术终面批次");
  });

  test("generates batch display name from time label when displayName is empty", () => {
    const now = Date.now();
    const batch = {
      id: "batch_abc12345",
      displayName: "",
      createdAt: now,
      totalFiles: 5,
    };
    const result = formatImportBatchDisplayName(batch);
    expect(result).toContain("个");
    expect(result).toContain("批次");
    expect(result).toContain(batch.id.slice(-8));
  });
});
