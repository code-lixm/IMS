import { describe, expect, test } from "vitest";
import {
  buildInterviewImportOverviewItems,
  interviewImportSourceTypeLabel,
  interviewImportStageLabel,
  interviewImportStatusDescription,
  interviewImportStatusLabel,
  interviewImportWorkflowDescription,
  parseInterviewImportBatchSummary,
  parseInterviewImportTaskSummary,
  resolveInterviewImportBatchSummary,
} from "./interview-import-formatters";

describe("interview import formatters", () => {
  test("maps source type and stage labels", () => {
    expect(interviewImportSourceTypeLabel("interview_data")).toBe("面试数据导入");
    expect(interviewImportSourceTypeLabel("paths")).toBe("简历导入");
    expect(interviewImportStageLabel("extracting_resume")).toBe("提取简历中");
    expect(interviewImportStageLabel("partial_success")).toBe("部分成功");
  });

  test("resolves processing label from current stage", () => {
    expect(interviewImportStatusLabel({
      status: "processing",
      currentStage: "appending_rounds",
    })).toBe("追加轮次中");
  });

  test("parses summary from batch json or task result json", () => {
    const summary = {
      createdCandidate: null,
      candidateId: "candidate_1",
      appendedRounds: 2,
      skippedRounds: 1,
      failedRounds: 0,
      workflowAdvance: null,
      errors: ["warning"],
    };

    expect(parseInterviewImportBatchSummary(JSON.stringify(summary))?.candidateId).toBe("candidate_1");
    expect(parseInterviewImportTaskSummary(JSON.stringify({ summary }))?.appendedRounds).toBe(2);
    expect(resolveInterviewImportBatchSummary({ resultJson: JSON.stringify({ summary }) })?.skippedRounds).toBe(1);
  });

  test("builds overview items with candidate and workflow hints", () => {
    const items = buildInterviewImportOverviewItems({
      createdCandidate: "candidate_2",
      candidateId: "candidate_2",
      appendedRounds: 3,
      skippedRounds: 1,
      failedRounds: 1,
      workflowAdvance: {
        fromStage: "S0",
        toStage: "S2",
        maxAdvancedRound: 2,
        advanced: true,
      },
      errors: [],
    });

    expect(items).toHaveLength(4);
    expect(items[0]).toEqual(expect.objectContaining({ label: "候选人", value: "已创建" }));
    expect(items[1]).toEqual(expect.objectContaining({ label: "总轮次", value: "5" }));
    expect(items[3]).toEqual(expect.objectContaining({ label: "Workflow", value: "S0 → S2" }));
    expect(interviewImportWorkflowDescription({
      fromStage: "S0",
      toStage: "S2",
      maxAdvancedRound: 2,
      advanced: true,
    })).toContain("最高推进到第 2 轮");
  });

  test("builds terminal descriptions for partial and failed batches", () => {
    expect(interviewImportStatusDescription({
      status: "partial_success",
      summary: {
        createdCandidate: null,
        candidateId: "candidate_1",
        appendedRounds: 1,
        skippedRounds: 0,
        failedRounds: 2,
        workflowAdvance: null,
        errors: ["a", "b"],
      },
    })).toContain("2 轮失败");

    expect(interviewImportStatusDescription({
      status: "failed",
      summary: {
        createdCandidate: null,
        candidateId: null,
        appendedRounds: 0,
        skippedRounds: 0,
        failedRounds: 1,
        workflowAdvance: null,
        errors: [],
      },
    })).toContain("1 轮未能写入");
  });
});
