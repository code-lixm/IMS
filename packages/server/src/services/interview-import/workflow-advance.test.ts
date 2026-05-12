import { beforeEach, describe, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  conversationRows: [] as Array<{ id: string }>,
  insertedConversations: [] as Array<Record<string, unknown>>,
  workflowState: {
    id: "wf_1",
    candidateId: "cand_1",
    conversationId: "conv_existing",
    currentStage: "S0",
    stageData: {},
    documents: {},
    status: "active",
    createdAt: new Date("2026-05-08T00:00:00.000Z"),
    updatedAt: new Date("2026-05-08T00:00:00.000Z"),
  },
  advanceStage: vi.fn(async (_workflowId: string, targetStage?: string) => targetStage ?? "S1"),
  updateWorkflow: vi.fn(async () => undefined),
  getOrCreateWorkflow: vi.fn(async () => mocks.workflowState),
}));

vi.mock("../../db", () => ({
  db: {
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: vi.fn(async () => mocks.conversationRows),
        })),
      })),
    })),
    insert: vi.fn(() => ({
      values: vi.fn(async (value: Record<string, unknown>) => {
        mocks.insertedConversations.push(value);
      }),
    })),
  },
}));

vi.mock("../../schema", () => ({
  conversations: {
    id: "conversations.id",
    candidateId: "conversations.candidate_id",
    title: "conversations.title",
  },
}));

vi.mock("../lui-workflow", () => ({
  getOrCreateWorkflow: mocks.getOrCreateWorkflow,
  advanceStage: mocks.advanceStage,
  updateWorkflow: mocks.updateWorkflow,
}));

import { advanceInterviewImportWorkflow, ensureInterviewImportConversation } from "./workflow-advance";

describe("ensureInterviewImportConversation", () => {
  beforeEach(() => {
    mocks.conversationRows = [];
    mocks.insertedConversations = [];
  });

  test("creates dedicated import conversation when none exists", async () => {
    const conversationId = await ensureInterviewImportConversation("cand_1");

    expect(conversationId).toMatch(/^conv_/);
    expect(mocks.insertedConversations).toHaveLength(1);
    expect(mocks.insertedConversations[0]).toMatchObject({
      id: conversationId,
      title: "历史面试导入",
      candidateId: "cand_1",
    });
  });

  test("reuses existing dedicated import conversation", async () => {
    mocks.conversationRows = [{ id: "conv_existing" }];

    const conversationId = await ensureInterviewImportConversation("cand_1");

    expect(conversationId).toBe("conv_existing");
    expect(mocks.insertedConversations).toHaveLength(0);
  });
});

describe("advanceInterviewImportWorkflow", () => {
  beforeEach(() => {
    mocks.conversationRows = [{ id: "conv_existing" }];
    mocks.insertedConversations = [];
    mocks.workflowState = {
      id: "wf_1",
      candidateId: "cand_1",
      conversationId: "conv_existing",
      currentStage: "S0",
      stageData: {},
      documents: {},
      status: "active",
      createdAt: new Date("2026-05-08T00:00:00.000Z"),
      updatedAt: new Date("2026-05-08T00:00:00.000Z"),
    };
    mocks.advanceStage.mockClear();
    mocks.updateWorkflow.mockClear();
    mocks.getOrCreateWorkflow.mockClear();
  });

  test("advances from S0 to S2 when imported rounds indicate strong history", async () => {
    const result = await advanceInterviewImportWorkflow({
      batchId: "batch_1",
      importSource: "interview_data",
      candidateId: "cand_1",
      roundPersistence: {
        startFrom: 1,
        normalizedRounds: [
          {
            inputIndex: 0,
            roundNumber: 1,
            roundName: null,
            interviewDate: null,
            scheduledAt: null,
            interviewerNames: [],
            interviewerIdentity: "system",
            interviewType: null,
            interviewTypeCode: null,
            evaluationText: "一面表现稳定，技术回答完整，建议继续推进",
            resultLabel: "通过",
            recommendation: "pass",
            interviewResult: 1,
          },
          {
            inputIndex: 1,
            roundNumber: 2,
            roundName: null,
            interviewDate: null,
            scheduledAt: null,
            interviewerNames: [],
            interviewerIdentity: "system",
            interviewType: null,
            interviewTypeCode: null,
            evaluationText: "二面继续通过",
            resultLabel: "通过",
            recommendation: "pass",
            interviewResult: 1,
          },
        ],
        interviewCreates: [],
        assessmentCreates: [],
        summary: {
          appendedRounds: [
            {
              status: "appended",
              code: "appended_round",
              inputIndex: 0,
              roundNumber: 1,
              roundName: null,
              interviewId: "intv_1",
              assessmentId: "assessment_1",
            },
            {
              status: "appended",
              code: "appended_round",
              inputIndex: 1,
              roundNumber: 2,
              roundName: null,
              interviewId: "intv_2",
              assessmentId: "assessment_2",
            },
          ],
          skippedRounds: [],
          failedRounds: [],
        },
      },
    });

    expect(result.fromStage).toBe("S0");
    expect(result.targetStage).toBe("S2");
    expect(result.toStage).toBe("S2");
    expect(result.advanced).toBe(true);
    expect(mocks.advanceStage).toHaveBeenNthCalledWith(1, "wf_1", "S1");
    expect(mocks.advanceStage).toHaveBeenNthCalledWith(2, "wf_1", "S2");
    expect(mocks.updateWorkflow).toHaveBeenCalledWith(
      "wf_1",
      expect.objectContaining({
        conversationId: "conv_existing",
        stageData: expect.objectContaining({
          interviewImportAudit: expect.objectContaining({
            batchId: "batch_1",
            importSource: "interview_data",
          }),
        }),
      }),
    );
  });

  test("keeps S2 unchanged and returns advanced false", async () => {
    mocks.workflowState = {
      ...mocks.workflowState,
      currentStage: "S2",
    };

    const result = await advanceInterviewImportWorkflow({
      batchId: "batch_2",
      importSource: "interview_data",
      candidateId: "cand_1",
      roundPersistence: {
        startFrom: 3,
        normalizedRounds: [],
        interviewCreates: [],
        assessmentCreates: [],
        summary: {
          appendedRounds: [
            {
              status: "appended",
              code: "appended_round",
              inputIndex: 0,
              roundNumber: 3,
              roundName: null,
              interviewId: "intv_3",
              assessmentId: "assessment_3",
            },
          ],
          skippedRounds: [],
          failedRounds: [],
        },
      },
    });

    expect(result.fromStage).toBe("S2");
    expect(result.targetStage).toBe("S2");
    expect(result.toStage).toBe("S2");
    expect(result.advanced).toBe(false);
    expect(mocks.advanceStage).not.toHaveBeenCalled();
  });
});
