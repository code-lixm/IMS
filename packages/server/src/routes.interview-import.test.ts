import { beforeEach, describe, expect, test, vi } from "vitest";

const state = vi.hoisted(() => ({
  batches: [] as Array<Record<string, unknown>>,
  tasks: [] as Array<Record<string, unknown>>,
  processInterviewImportTaskMock: vi.fn(),
  refreshInterviewImportBatchProgressMock: vi.fn(),
  cancelImportBatchMock: vi.fn(),
}));

const schema = vi.hoisted(() => ({
  importBatches: {
    id: "id",
    displayName: "displayName",
    status: "status",
    sourceType: "sourceType",
    summaryJson: "summaryJson",
    currentStage: "currentStage",
    totalFiles: "totalFiles",
    processedFiles: "processedFiles",
    successFiles: "successFiles",
    failedFiles: "failedFiles",
    autoScreen: "autoScreen",
    groupId: "groupId",
    templateId: "templateId",
    passThreshold: "passThreshold",
    reviewThreshold: "reviewThreshold",
    learningEnabled: "learningEnabled",
    createdAt: "createdAt",
    startedAt: "startedAt",
    completedAt: "completedAt",
  },
  importFileTasks: {
    id: "id",
    batchId: "batchId",
    originalPath: "originalPath",
    normalizedPath: "normalizedPath",
    fileType: "fileType",
    status: "status",
    stage: "stage",
    errorCode: "errorCode",
    errorMessage: "errorMessage",
    candidateId: "candidateId",
    matchedTemplateId: "matchedTemplateId",
    payloadJson: "payloadJson",
    resultJson: "resultJson",
    retryCount: "retryCount",
    fileHash: "fileHash",
    createdAt: "createdAt",
    updatedAt: "updatedAt",
  },
}));

vi.mock("drizzle-orm", () => ({
  desc: (column: string) => ({ kind: "desc", column }),
  eq: (column: string, value: unknown) => ({ kind: "eq", column, value }),
}));

vi.mock("./schema", () => ({
  importBatches: schema.importBatches,
  importFileTasks: schema.importFileTasks,
}));

vi.mock("./db", () => ({
  db: {
    select: vi.fn(() => createSelectBuilder()),
    insert: vi.fn((table: unknown) => ({
      values: async (values: Record<string, unknown>) => {
        if (table === schema.importBatches) {
          state.batches.push({ ...values });
        }
        if (table === schema.importFileTasks) {
          state.tasks.push({ ...values });
        }
      },
    })),
  },
}));

vi.mock("./services/interview-import/pipeline", () => ({
  cancelImportBatch: state.cancelImportBatchMock,
  processInterviewImportTask: state.processInterviewImportTaskMock,
  refreshInterviewImportBatchProgress: state.refreshInterviewImportBatchProgressMock,
}));

vi.mock("./services/import/pipeline", () => ({
  cancelImportBatch: state.cancelImportBatchMock,
}));

function createSelectBuilder() {
  let table: unknown = null;
  let condition: { kind: string; column: string; value: unknown } | null = null;
  let order: { kind: string; column: string } | null = null;
  let limitCount: number | null = null;

  const builder = {
    from(nextTable: unknown) {
      table = nextTable;
      return builder;
    },
    where(nextCondition: { kind: string; column: string; value: unknown }) {
      condition = nextCondition;
      return builder;
    },
    orderBy(nextOrder: { kind: string; column: string }) {
      order = nextOrder;
      return builder;
    },
    limit(nextLimit: number) {
      limitCount = nextLimit;
      return execute();
    },
    then(resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) {
      return execute().then(resolve, reject);
    },
  };

  async function execute() {
    let rows = table === schema.importBatches ? state.batches.slice() : table === schema.importFileTasks ? state.tasks.slice() : [];

    if (condition?.kind === "eq") {
      rows = rows.filter((row) => row[condition!.column] === condition!.value);
    }

    if (order?.kind === "desc") {
      rows.sort((left, right) => {
        const a = Number(left[order!.column] ?? 0);
        const b = Number(right[order!.column] ?? 0);
        return b - a;
      });
    }

    if (limitCount !== null) {
      rows = rows.slice(0, limitCount);
    }

    return rows;
  }

  return builder;
}

import { route } from "./routes";

beforeEach(() => {
  state.batches.splice(0, state.batches.length);
  state.tasks.splice(0, state.tasks.length);
  state.processInterviewImportTaskMock.mockReset();
  state.refreshInterviewImportBatchProgressMock.mockReset();
  state.cancelImportBatchMock.mockReset();
  state.processInterviewImportTaskMock.mockResolvedValue({});
  state.refreshInterviewImportBatchProgressMock.mockResolvedValue(undefined);
  state.cancelImportBatchMock.mockImplementation(async (batchId: string) => {
    const batch = state.batches.find((item) => item.id === batchId);
    if (batch) {
      batch.status = "cancelled";
    }
  });
});

async function readJson(response: Response) {
  return response.json() as Promise<{ success: boolean; data: any; error: any }>;
}

describe("interview import routes", () => {
  test("creates a batch from JSON body", async () => {
    const response = await route(new Request("http://localhost/api/interview-import/batches", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        mode: "candidate_detail_append",
        candidateId: "cand_1",
        rounds: [{ evaluationText: "ok" }],
      }),
    }));

    expect(response.status).toBe(201);
    const body = await readJson(response);
    expect(body.success).toBe(true);
    expect(body.data.batch.sourceType).toBe("interview_data");
    expect(body.data.task.payloadJson).toContain("candidate_detail_append");
    expect(state.processInterviewImportTaskMock).toHaveBeenCalledTimes(1);
  });

  test("creates a batch from multipart form data with resumePdf", async () => {
    const formData = new FormData();
    formData.append("payload", JSON.stringify({
      mode: "create_candidate",
      name: "张三",
      position: "前端",
      phone: "13800000000",
      rounds: [{ evaluationText: "good" }],
    }));
    formData.append("resumePdf", new File(["pdf"], "resume.pdf", { type: "application/pdf" }));

    const response = await route(new Request("http://localhost/api/interview-import/batches", {
      method: "POST",
      body: formData,
    }));

    expect(response.status).toBe(201);
    const body = await readJson(response);
    expect(body.data.batch.sourceType).toBe("interview_data");
    expect(body.data.task.originalPath).toBe("resume.pdf");
    expect(state.processInterviewImportTaskMock).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ resumePdf: expect.any(File) }));
  });

  test("returns batch detail and files list", async () => {
    state.batches.push({
      id: "batch_1",
      displayName: "面试数据导入-张三",
      status: "processing",
      sourceType: "interview_data",
      summaryJson: JSON.stringify({
        createdCandidate: "cand_1",
        candidateId: "cand_1",
        appendedRounds: 1,
        skippedRounds: 0,
        failedRounds: 0,
        workflowAdvance: null,
        errors: [],
      }),
      currentStage: "processing",
      totalFiles: 1,
      processedFiles: 0,
      successFiles: 0,
      failedFiles: 0,
      autoScreen: false,
      groupId: null,
      templateId: null,
      passThreshold: null,
      reviewThreshold: null,
      learningEnabled: null,
      createdAt: 1,
      startedAt: 1,
      completedAt: null,
    });
    state.tasks.push({
      id: "task_1",
      batchId: "batch_1",
      originalPath: "resume.pdf",
      normalizedPath: null,
      fileType: "application/pdf",
      status: "queued",
      stage: null,
      errorCode: null,
      errorMessage: null,
      candidateId: null,
      matchedTemplateId: null,
      payloadJson: JSON.stringify({ mode: "candidate_detail_append", candidateId: "cand_1", rounds: [{ evaluationText: "ok" }] }),
      resultJson: null,
      retryCount: 0,
      fileHash: null,
      createdAt: 1,
      updatedAt: 1,
    });

    const detailResponse = await route(new Request("http://localhost/api/interview-import/batches/batch_1", { method: "GET" }));
    const detailBody = await readJson(detailResponse);
    expect(detailBody.data.batch.sourceType).toBe("interview_data");
    expect(detailBody.data.items).toHaveLength(1);

    const filesResponse = await route(new Request("http://localhost/api/interview-import/batches/batch_1/files", { method: "GET" }));
    const filesBody = await readJson(filesResponse);
    expect(filesBody.data.items).toHaveLength(1);
    expect(filesBody.data.items[0].batchId).toBe("batch_1");
  });

  test("cancels an interview import batch", async () => {
    state.batches.push({
      id: "batch_1",
      displayName: "面试数据导入-张三",
      status: "processing",
      sourceType: "interview_data",
      summaryJson: null,
      currentStage: "processing",
      totalFiles: 1,
      processedFiles: 0,
      successFiles: 0,
      failedFiles: 0,
      autoScreen: false,
      groupId: null,
      templateId: null,
      passThreshold: null,
      reviewThreshold: null,
      learningEnabled: null,
      createdAt: 1,
      startedAt: 1,
      completedAt: null,
    });

    const response = await route(new Request("http://localhost/api/interview-import/batches/batch_1/cancel", { method: "POST" }));
    const body = await readJson(response);

    expect(response.status).toBe(200);
    expect(body.data.status).toBe("cancelled");
    expect(state.batches[0].status).toBe("cancelled");
  });
});
