import { beforeEach, describe, expect, test, vi } from "vitest";
import type { InterviewImportWorkflowAdvanceServiceResult } from "./workflow-advance";

const mocks = vi.hoisted(() => ({
  taskRow: {
    id: "task_1",
    batchId: "batch_1",
    status: "queued",
    stage: null,
    payloadJson: JSON.stringify({
      mode: "create_candidate",
      name: "张三",
      position: "前端工程师",
      email: "zhangsan@example.com",
      rounds: [
        { roundNumber: 2, evaluationText: "一面通过", resultLabel: "通过" },
        { evaluationText: "二面待定", resultLabel: "待定" },
      ],
    }),
  } as { id: string; batchId: string; status: string; stage: string | null; payloadJson: string },
  batchRow: {
    id: "batch_1",
    status: "queued",
    sourceType: "interview_data",
  } as { id: string; status: string; sourceType: string | null },
  joinedStatusRow: {
    taskStatus: "queued",
    batchStatus: "processing",
  },
  existingInterviews: [] as Array<{ id: string; round: number }>,
  allTasks: [] as Array<{ id: string; status: string; stage: string | null; resultJson: string | null }>,
  updateTaskCalls: [] as Array<Record<string, unknown>>,
  updateBatchCalls: [] as Array<Record<string, unknown>>,
  transactionInterviewValues: [] as Array<Record<string, unknown>[]>,
  transactionAssessmentValues: [] as Array<Record<string, unknown>[]>,
  transactionShouldFail: false,
  workflowAdvanceResult: {
    fromStage: "S0",
    toStage: "S1",
    targetStage: "S1",
    maxAdvancedRound: 2,
    advanced: true,
    reasonSummary: "本次导入新增面试轮次，workflow 从 S0 推进到 S1。",
    evidenceFields: ["appendedRounds:1"],
  } as InterviewImportWorkflowAdvanceServiceResult,
  resolveCandidateResult: {
    mode: "create_candidate" as const,
    candidateId: "cand_1",
    createdCandidate: true,
    resumeError: {
      code: "RESUME_IMPORT_FAILED" as const,
      message: "pdf parse failed",
    },
  } as {
    mode: "create_candidate" | "bind_existing_candidate" | "candidate_detail_append";
    candidateId: string;
    createdCandidate: boolean;
    resumeId?: string;
    resumeError?: { code: "RESUME_IMPORT_FAILED"; message: string };
  },
  roundPersistenceResult: {
    startFrom: 2,
    normalizedRounds: [
      {
        inputIndex: 0,
        roundNumber: 2,
        roundName: null,
        interviewDate: null,
        scheduledAt: null,
        interviewerNames: [],
        interviewerIdentity: "system",
        interviewType: null,
        interviewTypeCode: null,
        evaluationText: "一面通过",
        resultLabel: "通过",
        recommendation: "pass" as const,
        interviewResult: 1,
      },
      {
        inputIndex: 1,
        roundNumber: 3,
        roundName: null,
        interviewDate: null,
        scheduledAt: null,
        interviewerNames: [],
        interviewerIdentity: "system",
        interviewType: null,
        interviewTypeCode: null,
        evaluationText: "二面待定",
        resultLabel: "待定",
        recommendation: "hold" as const,
        interviewResult: null,
      },
    ],
    interviewCreates: [{ id: "intv_2", candidateId: "cand_1", round: 2 }],
    assessmentCreates: [{ id: "assessment_2", candidateId: "cand_1", interviewId: "intv_2" }],
    summary: {
      appendedRounds: [
        {
          status: "appended" as const,
          code: "appended_round" as const,
          inputIndex: 0,
          roundNumber: 2,
          roundName: null,
          interviewId: "intv_2",
          assessmentId: "assessment_2",
        },
      ],
      skippedRounds: [
        {
          status: "skipped" as const,
          code: "skipped_duplicate_round" as const,
          inputIndex: 1,
          roundNumber: 3,
          roundName: null,
          existingInterviewId: "intv_existing_3",
        },
      ],
      failedRounds: [],
    },
  },
}));

vi.mock("../../db", () => ({
  db: {
    select: vi.fn((shape?: Record<string, unknown>) => {
      if (shape?.payloadJson) {
        return {
          from: vi.fn(() => ({
            where: vi.fn(() => ({
              limit: vi.fn(async () => [mocks.taskRow]),
            })),
          })),
        };
      }

      if (shape?.sourceType) {
        return {
          from: vi.fn(() => ({
            where: vi.fn(() => ({
              limit: vi.fn(async () => [mocks.batchRow]),
            })),
          })),
        };
      }

      if (shape?.taskStatus) {
        return {
          from: vi.fn(() => ({
            innerJoin: vi.fn(() => ({
              where: vi.fn(() => ({
                limit: vi.fn(async () => [mocks.joinedStatusRow]),
              })),
            })),
          })),
        };
      }

      if (shape?.round) {
        return {
          from: vi.fn(() => ({
            where: vi.fn(async () => mocks.existingInterviews),
          })),
        };
      }

      if (shape?.resultJson) {
        return {
          from: vi.fn(() => ({
            where: vi.fn(async () => mocks.allTasks),
          })),
        };
      }

      return {
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            limit: vi.fn(async () => []),
          })),
        })),
      };
    }),
    update: vi.fn((table: { resultJson?: unknown; summaryJson?: unknown }) => ({
      set: vi.fn((value: Record<string, unknown>) => ({
        where: vi.fn(async () => {
          if ("resultJson" in table) {
            mocks.updateTaskCalls.push(value);
            if (typeof value.resultJson === "string") {
              mocks.allTasks = [{
                id: mocks.taskRow.id,
                status: typeof value.status === "string" ? value.status : mocks.taskRow.status,
                stage: typeof value.stage === "string" || value.stage === null ? value.stage : null,
                resultJson: value.resultJson,
              }];
            }
            if (typeof value.status === "string") {
              mocks.taskRow.status = value.status;
            }
            if (typeof value.stage === "string" || value.stage === null) {
              mocks.taskRow.stage = value.stage;
            }
            return;
          }

          mocks.updateBatchCalls.push(value);
          if (typeof value.status === "string") {
            mocks.batchRow.status = value.status;
          }
        }),
      })),
    })),
    transaction: vi.fn(async (callback: (tx: {
      insert: (table: { interviewerId?: unknown }) => { values: (value: Record<string, unknown>[]) => Promise<void> };
    }) => Promise<void>) => {
      const tx = {
        insert: (table: { interviewerId?: unknown }) => ({
          values: async (value: Record<string, unknown>[]) => {
            if (table.interviewerId) {
              mocks.transactionAssessmentValues.push(value);
            } else {
              mocks.transactionInterviewValues.push(value);
            }
            if (mocks.transactionShouldFail) {
              throw new Error("write failed");
            }
          },
        }),
      };
      await callback(tx);
    }),
  },
}));

vi.mock("../../schema", () => ({
  importFileTasks: {
    id: "import_file_tasks.id",
    batchId: "import_file_tasks.batch_id",
    status: "import_file_tasks.status",
    stage: "import_file_tasks.stage",
    payloadJson: "import_file_tasks.payload_json",
    resultJson: "import_file_tasks.result_json",
  },
  importBatches: {
    id: "import_batches.id",
    status: "import_batches.status",
    sourceType: "import_batches.source_type",
    summaryJson: "import_batches.summary_json",
  },
  interviews: {
    id: "interviews.id",
    candidateId: "interviews.candidate_id",
    round: "interviews.round",
  },
  interviewAssessments: {
    interviewerId: "interview_assessments.interviewer_id",
  },
}));

vi.mock("../../utils/logger", () => ({
  logInfo: vi.fn(),
  logWarn: vi.fn(),
  logError: vi.fn(),
}));

vi.mock("./candidate-resolution", () => ({
  resolveInterviewImportCandidate: vi.fn(async () => mocks.resolveCandidateResult),
}));

vi.mock("./round-persistence", () => ({
  prepareInterviewRoundPersistence: vi.fn(() => mocks.roundPersistenceResult),
}));

vi.mock("./workflow-advance", () => ({
  advanceInterviewImportWorkflow: vi.fn(async () => mocks.workflowAdvanceResult),
}));

import { processInterviewImportTask } from "./pipeline";

describe("processInterviewImportTask", () => {
  beforeEach(() => {
    mocks.taskRow = {
      id: "task_1",
      batchId: "batch_1",
      status: "queued",
      stage: null,
      payloadJson: JSON.stringify({
        mode: "create_candidate",
        name: "张三",
        position: "前端工程师",
        email: "zhangsan@example.com",
        rounds: [
          { roundNumber: 2, evaluationText: "一面通过", resultLabel: "通过" },
          { evaluationText: "二面待定", resultLabel: "待定" },
        ],
      }),
    };
    mocks.batchRow = { id: "batch_1", status: "queued", sourceType: "interview_data" };
    mocks.joinedStatusRow = { taskStatus: "queued", batchStatus: "processing" };
    mocks.existingInterviews = [];
    mocks.allTasks = [];
    mocks.updateTaskCalls = [];
    mocks.updateBatchCalls = [];
    mocks.transactionInterviewValues = [];
    mocks.transactionAssessmentValues = [];
    mocks.transactionShouldFail = false;
    mocks.workflowAdvanceResult = {
      fromStage: "S0",
      toStage: "S1",
      targetStage: "S1",
      maxAdvancedRound: 2,
      advanced: true,
      reasonSummary: "本次导入新增面试轮次，workflow 从 S0 推进到 S1。",
      evidenceFields: ["appendedRounds:1"],
    };
    mocks.resolveCandidateResult = {
      mode: "create_candidate",
      candidateId: "cand_1",
      createdCandidate: true,
      resumeError: { code: "RESUME_IMPORT_FAILED", message: "pdf parse failed" },
    };
  });

  test("returns partial_success and keeps per-round summary when resume import degrades", async () => {
    const result = await processInterviewImportTask("task_1");

    expect(result.summary.candidateId).toBe("cand_1");
    expect(result.summary.createdCandidate).toBe(true);
    expect(result.summary.appendedRounds).toHaveLength(1);
    expect(result.summary.skippedRounds).toHaveLength(1);
    expect(result.summary.failedRounds).toHaveLength(0);
    expect(result.summary.workflowAdvance).toMatchObject({
      fromStage: "S0",
      toStage: "S1",
      targetStage: "S1",
      advanced: true,
    });
    expect(result.summary.errors).toContain("简历导入失败：pdf parse failed");
    expect(result.summary.warnings[0]).toContain("混用");
    expect(mocks.updateTaskCalls.at(-1)).toMatchObject({
      status: "partial_success",
      stage: "partial_success",
      candidateId: "cand_1",
    });
    expect(mocks.updateBatchCalls.at(-1)).toMatchObject({
      status: "partial_success",
      successFiles: 1,
      failedFiles: 0,
    });
    expect(mocks.transactionInterviewValues).toHaveLength(1);
    expect(mocks.transactionAssessmentValues).toHaveLength(1);
  });

  test("converts planned appended rounds into failed rounds when db persistence fails", async () => {
    mocks.transactionShouldFail = true;
    mocks.resolveCandidateResult = {
      mode: "bind_existing_candidate",
      candidateId: "cand_2",
      createdCandidate: false,
    };
    mocks.roundPersistenceResult = {
      ...mocks.roundPersistenceResult,
      summary: {
        appendedRounds: [
          {
            status: "appended",
            code: "appended_round",
            inputIndex: 0,
            roundNumber: 2,
            roundName: null,
            interviewId: "intv_2",
            assessmentId: "assessment_2",
          },
        ],
        skippedRounds: [],
        failedRounds: [],
      },
    };

    const result = await processInterviewImportTask("task_1");

    expect(result.summary.appendedRounds).toHaveLength(0);
    expect(result.summary.failedRounds).toHaveLength(2);
    expect(result.summary.errors.some((message) => message.includes("面试轮次写入失败"))).toBe(true);
    expect(mocks.updateTaskCalls.at(-1)).toMatchObject({
      status: "failed",
      stage: "failed",
      candidateId: "cand_2",
    });
  });

  test("keeps import result as partial_success when workflow advance fails after rounds were persisted", async () => {
    mocks.resolveCandidateResult = {
      mode: "bind_existing_candidate",
      candidateId: "cand_3",
      createdCandidate: false,
    };
    mocks.taskRow.payloadJson = JSON.stringify({
      mode: "bind_existing_candidate",
      candidateId: "cand_3",
      rounds: [{ roundNumber: 2, evaluationText: "一面通过", resultLabel: "通过" }],
    });
    mocks.workflowAdvanceResult = {
      fromStage: "unknown",
      toStage: "unknown",
      targetStage: "S0",
      maxAdvancedRound: null,
      advanced: false,
      reasonSummary: "面试导入工作流推进失败，已保留已导入的面试数据。",
      evidenceFields: [],
      errorMessage: "advance failed",
    };

    const result = await processInterviewImportTask("task_1");

    expect(result.summary.appendedRounds).toHaveLength(1);
    expect(result.summary.workflowAdvance).toMatchObject({
      errorMessage: "advance failed",
      advanced: false,
    });
    expect(result.summary.errors).toContain("工作流推进失败：advance failed");
    expect(mocks.updateTaskCalls.at(-1)).toMatchObject({
      status: "partial_success",
      stage: "partial_success",
      candidateId: "cand_3",
    });
    expect(mocks.transactionInterviewValues).toHaveLength(1);
    expect(mocks.transactionAssessmentValues).toHaveLength(1);
  });
});
