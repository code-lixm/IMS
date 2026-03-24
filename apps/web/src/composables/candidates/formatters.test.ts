import { describe, expect, test } from "bun:test";
import {
  formatCandidateActivityTime,
  interviewStateLabel,
  interviewStateVariant,
  pipelineStageLabel,
  pipelineStageVariant,
  resumeStatusLabel,
  resumeStatusVariant,
} from "./formatters";

describe("candidate formatters", () => {
  test("maps resume status to stable labels and badge variants", () => {
    expect(resumeStatusLabel("missing")).toBe("未上传简历");
    expect(resumeStatusVariant("missing")).toBe("outline");
    expect(resumeStatusLabel("parsed")).toBe("已解析");
    expect(resumeStatusVariant("parsed")).toBe("default");
    expect(resumeStatusLabel("failed")).toBe("解析失败");
    expect(resumeStatusVariant("failed")).toBe("destructive");
  });

  test("maps pipeline and interview states consistently", () => {
    expect(pipelineStageLabel("screening")).toBe("筛选中");
    expect(pipelineStageVariant("screening")).toBe("secondary");
    expect(interviewStateLabel("completed")).toBe("已完成");
    expect(interviewStateVariant("completed")).toBe("default");
    expect(interviewStateLabel("cancelled")).toBe("已取消");
    expect(interviewStateVariant("cancelled")).toBe("destructive");
  });

  test("formats activity time and handles empty values", () => {
    expect(formatCandidateActivityTime(null)).toBe("暂无活动");
    expect(formatCandidateActivityTime(1774342927771)).toContain("/");
  });
});
