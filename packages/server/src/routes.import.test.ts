import { beforeEach, describe, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  prepareImportTasksMock: vi.fn(),
  selectQueue: [] as unknown[][],
  insertValues: [] as unknown[],
  ensureUsableGroupMock: vi.fn(),
}));

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

vi.mock("./services/sync-manager", () => ({
  syncManager: { status: vi.fn(), start: vi.fn(), stop: vi.fn(), runOnce: vi.fn() },
}));

vi.mock("./services/sync-reset", () => ({
  resetCandidateRecords: vi.fn(),
}));

vi.mock("./services/import/pipeline", () => ({
  cancelImportBatch: vi.fn(),
  clearImportBatchScreeningFeedbacks: vi.fn(),
  clearImportTaskScreeningScoreFeedback: vi.fn(),
  prepareImportTasks: mocks.prepareImportTasksMock,
  processFile: vi.fn(),
  refreshBatchProgress: vi.fn(),
  rerunImportBatchScreening: vi.fn(),
  rerunFileScreening: vi.fn(),
  retryFileUniversityVerification: vi.fn(),
  exportScreeningResults: vi.fn(),
  ImportScreeningExportError: class ImportScreeningExportError extends Error {
    code: string;
    status: number;
    constructor(code: string, message: string, status: number) {
      super(message);
      this.code = code;
      this.status = status;
    }
  },
  ImportValidationError: class ImportValidationError extends Error {},
  startRerunImportBatchScreening: vi.fn(),
  updateImportBatchScreeningConfig: vi.fn(),
  updateImportTaskScreeningScore: vi.fn(),
}));

vi.mock("./services/imr/exporter", () => ({ exportCandidate: vi.fn() }));
vi.mock("./services/imr/importer", () => ({ importIpmr: vi.fn() }));
vi.mock("./services/share/discovery", () => ({ getDiscovery: vi.fn() }));
vi.mock("./services/share/transfer", () => ({ sendToDevice: vi.fn() }));
vi.mock("./services/baobao-client", () => ({
  BaobaoClient: class BaobaoClient {},
  setBaobaoClient: vi.fn(),
  getBaobaoClient: vi.fn(),
}));
vi.mock("./services/baobao-login", () => ({
  clearBaobaoLoginSession: vi.fn(),
  fetchBaobaoLoginQrCode: vi.fn(),
  getBaobaoLoginSessionStatus: vi.fn(),
}));
vi.mock("./config", () => ({
  config: { dataDir: "/tmp", filesDir: "/tmp", runtimeDir: "/tmp", dbPath: ":memory:" },
}));
vi.mock("./db", () => ({
  closeDatabase: vi.fn(),
  rawDb: {},
  db: {
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: vi.fn(async () => (mocks.selectQueue.shift() ?? []) as unknown[]),
        })),
      })),
    })),
    insert: vi.fn(() => ({
      values: vi.fn(async (value: unknown) => {
        mocks.insertValues.push(value);
      }),
    })),
  },
}));
vi.mock("./services/screening-templates", () => ({
  screeningTemplatesService: {
    ensureUsableGroup: mocks.ensureUsableGroupMock,
  },
}));
vi.mock("./utils/http", () => ({
  corsHeaders: () => ({}),
  ok: (data: unknown, init?: { status?: number }) => jsonResponse({ success: true, data, error: null, meta: { requestId: "req-test", timestamp: new Date().toISOString() } }, init?.status ?? 200),
  fail: (code: string, message: string, status = 400) => jsonResponse({ success: false, data: null, error: { code, message }, meta: { requestId: "req-test", timestamp: new Date().toISOString() } }, status),
}));
vi.mock("./utils/logger", () => ({
  logError: vi.fn(),
  logInfo: vi.fn(),
  logWarn: vi.fn(),
  resolveRequestId: vi.fn(() => "req-test"),
}));
vi.mock("./services/lui-context", () => ({
  buildCandidateContext: vi.fn(),
  formatCandidateContextForPrompt: vi.fn(),
}));
vi.mock("./services/lui-workflow", () => ({
  getOrCreateWorkflow: vi.fn(),
  getWorkflow: vi.fn(),
  getWorkflowByCandidate: vi.fn(),
  getAvailableNextStages: vi.fn(),
  updateWorkflow: vi.fn(),
  advanceStage: vi.fn(),
  resetWorkflow: vi.fn(),
  pauseWorkflow: vi.fn(),
  resumeWorkflow: vi.fn(),
  completeWorkflow: vi.fn(),
  confirmWorkflowRound: vi.fn(),
  listCandidateWorkflows: vi.fn(),
  executeAgent: vi.fn(),
  executeWorkflowAgent: vi.fn(),
  toWorkflowView: vi.fn(),
  WorkflowStage: {},
}));
vi.mock("./services/deepagents-runtime", () => ({ executeDeepAgent: vi.fn() }));
vi.mock("./services/lui-agents", () => ({
  DEFAULT_INTERVIEW_AGENT_ID: "agent-default",
  deleteAgentWithFallback: vi.fn(),
  ensureManagedAgents: vi.fn(),
  getResolvedAgent: vi.fn(),
  getResolvedAgentExecutionConfig: vi.fn(),
  isProtectedAgent: vi.fn(),
  listResolvedAgents: vi.fn(),
  resolveConversationAgentResolution: vi.fn(),
  serializeAgent: vi.fn(),
  setDefaultAgent: vi.fn(),
}));
vi.mock("./services/lui-agent-contract", () => ({
  buildAgentContractPromptSegment: vi.fn(),
  guardAgentUserMessage: vi.fn(),
  resolveAgentContract: vi.fn(),
}));
vi.mock("./services/lui-tools", () => ({
  getWorkflowTools: vi.fn(() => []),
  TOOL_NAMES: [],
}));
vi.mock("./services/baobao-resume", () => ({
  ensureCandidateResumeAvailable: vi.fn(),
  syncCandidateResumesToConversation: vi.fn(),
}));
vi.mock("./services/message", () => ({
  messageService: { createMessage: vi.fn(), completeMessage: vi.fn() },
  serializeMessageData: vi.fn(),
}));
vi.mock("./data/models-dev-local-data", () => ({
  MODELS_DEV_LOCAL_DATA_BACKUP: [],
  MODELS_DEV_LOCAL_DATA_PRIMARY: [],
}));
vi.mock("./routes/messages", () => ({ messagesRoute: vi.fn(async () => null) }));
vi.mock("./routes/memory", () => ({ memoryRoute: vi.fn(async () => null) }));
vi.mock("./routes/session-memory", () => ({ sessionMemoryRoute: vi.fn(async () => null) }));
vi.mock("./routes/file-resources", () => ({ fileResourcesRoute: vi.fn(async () => null) }));
vi.mock("./routes/email", () => ({ emailRoute: vi.fn(async () => null) }));
vi.mock("./routes/interview-assessment", () => ({ interviewAssessmentRoute: vi.fn(async () => null) }));
vi.mock("./routes/screening-templates", () => ({ screeningTemplatesRoute: vi.fn(async () => null) }));
vi.mock("./schema", () => ({
  users: {},
  candidates: {},
  resumes: {},
  interviews: {},
  artifacts: {},
  artifactVersions: {},
  candidateWorkspaces: {},
  importBatches: { id: "import_batches.id" },
  importFileTasks: {},
  shareRecords: {},
  notifications: {},
  remoteUsers: {},
  conversations: {},
  messages: {},
  fileResources: {},
  agents: {},
  providerCredentials: {},
  screeningScoreFeedbacks: {},
  luiWorkflows: {},
  screeningTemplateGroups: { id: "screening_template_groups.id" },
  screeningTemplateGroupTemplates: {
    id: "screening_template_group_templates.id",
    groupId: "screening_template_group_templates.group_id",
    templateId: "screening_template_group_templates.template_id",
  },
}));

import { route } from "./routes";

describe("import batch creation validation", () => {
  beforeEach(() => {
    mocks.selectQueue.splice(0, mocks.selectQueue.length);
    mocks.prepareImportTasksMock.mockReset();
    mocks.insertValues.splice(0, mocks.insertValues.length);
    mocks.ensureUsableGroupMock.mockReset();
  });

  test("rejects templateId that does not belong to the selected group on new batch creation", async () => {
    mocks.selectQueue.push([{ id: "group-tech", passThreshold: 80, reviewThreshold: 70, learningEnabled: false }]);
    mocks.selectQueue.push([]);

    const response = await route(new Request("http://localhost/api/import/batches", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        paths: ["/tmp/resume.pdf"],
        autoScreen: true,
        groupId: "group-tech",
        templateId: "template-outside",
      }),
    }));

    expect(response.status).toBe(422);
    await expect(response.json()).resolves.toMatchObject({
      success: false,
      error: {
        code: "VALIDATION_ERROR",
        message: "templateId does not belong to the selected group",
      },
    });
    expect(mocks.prepareImportTasksMock).not.toHaveBeenCalled();
  });

  test("creates first import batch with auto-bootstrapped default group when request omits groupId", async () => {
    mocks.ensureUsableGroupMock.mockResolvedValue({
      group: { id: "builtin-group" },
    });
    mocks.selectQueue.push([{ id: "builtin-group", passThreshold: 80, reviewThreshold: 70, learningEnabled: false }]);
    mocks.prepareImportTasksMock.mockResolvedValue([]);

    const response = await route(new Request("http://localhost/api/import/batches", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        paths: ["/tmp/resume.pdf"],
        autoScreen: true,
      }),
    }));

    expect(response.status).toBe(201);
    expect(mocks.ensureUsableGroupMock).toHaveBeenCalledTimes(1);
    await expect(response.json()).resolves.toMatchObject({
      success: true,
      data: {
        status: "processing",
        totalFiles: 0,
        autoScreen: true,
      },
    });
    expect(mocks.prepareImportTasksMock).toHaveBeenCalledWith(expect.any(String), ["/tmp/resume.pdf"]);
  });
});
