import { beforeAll, describe, expect, test, vi } from "vitest";

vi.mock("../db", () => ({ db: {} }));

let buildWorkflowMetaPayload: typeof import("./workflow-meta").buildWorkflowMetaPayload;

beforeAll(async () => {
  ({ buildWorkflowMetaPayload } = await import("./workflow-meta"));
});

describe("workflow-meta", () => {
  test("builds S1 round metadata and feedback loop payload", () => {
    const payload = buildWorkflowMetaPayload({
      candidateName: "胡少松",
      position: "前端开发工程师",
      workflow: {
        id: "wf_1",
        candidateId: "cand_1",
        conversationId: "conv_1",
        currentStage: "S2",
        stageData: {
          interviewer_feedback_status: "received",
          s2_feedback_loop: {
            state: "finalize",
            interviewer_feedback_status: "received",
            last_feedback_at: "2026-04-11T00:00:00.000Z",
          },
        },
        documents: {
          S0: { filePath: "/tmp/00_筛选报告.md" },
          S1: {
            latestRound: 2,
            latestFile: "/tmp/01_面试题_第2轮.md",
            roundFiles: {
              1: "/tmp/01_面试题_第1轮.md",
              2: "/tmp/01_面试题_第2轮.md",
            },
          },
          S2: { filePath: "/tmp/02_面试评分报告.md" },
        },
        status: "active",
        updatedAt: new Date("2026-04-11T00:00:00.000Z"),
      },
    });

    expect(payload.documents.S1).toEqual({
      latest_round: 2,
      latest_file: "01_面试题_第2轮.md",
      round_files: {
        1: "01_面试题_第1轮.md",
        2: "01_面试题_第2轮.md",
      },
    });
    expect(payload.s2_feedback_loop).not.toBeNull();
  });
});
