import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const runtimeState = vi.hoisted(() => ({
  dataDir: "",
  filesDir: "",
  rootDir: "",
  tables: {
    artifacts: [] as Array<Record<string, any>>,
    candidateWorkspaces: [] as Array<Record<string, any>>,
    candidates: [] as Array<Record<string, any>>,
    importBatches: [] as Array<Record<string, any>>,
    importFileTasks: [] as Array<Record<string, any>>,
    interviews: [] as Array<Record<string, any>>,
    providerCredentials: [] as Array<Record<string, any>>,
    resumes: [] as Array<Record<string, any>>,
    users: [] as Array<Record<string, any>>,
  },
}));

type MockColumn = { key: string; table: string };
type MockTable = { __table: string; [key: string]: any };

function createTable(name: string, columns: string[]): MockTable {
  const table: MockTable = { __table: name };
  for (const column of columns) {
    table[column] = { key: column, table: name } satisfies MockColumn;
  }
  return table;
}

const schemaMock = vi.hoisted(() => ({
  artifacts: createTable("artifacts", ["candidateId", "id"]),
  candidateWorkspaces: createTable("candidateWorkspaces", ["candidateId", "id"]),
  candidates: createTable("candidates", ["email", "id", "organizationName", "phone", "updatedAt", "yearsOfExperience"]),
  importBatches: createTable("importBatches", ["autoScreen", "batchId", "completedAt", "createdAt", "currentStage", "failedFiles", "id", "processedFiles", "status", "successFiles", "templateId", "totalFiles"]),
  importFileTasks: createTable("importFileTasks", ["batchId", "candidateId", "createdAt", "errorCode", "errorMessage", "fileHash", "id", "normalizedPath", "originalPath", "resultJson", "retryCount", "stage", "status", "updatedAt"]),
  interviews: createTable("interviews", ["candidateId", "id"]),
  providerCredentials: createTable("providerCredentials", ["apiKey", "provider"]),
  resumes: createTable("resumes", ["candidateId", "createdAt", "fileHash", "filePath", "fileSize", "id", "ocrConfidence"]),
  users: createTable("users", ["settingsJson"]),
}));

type MockExpr =
  | { type: "and"; conditions: MockExpr[] }
  | { type: "eq"; column: MockColumn; value: unknown }
  | { type: "inArray"; column: MockColumn; values: unknown[] }
  | { type: "isNotNull"; column: MockColumn }
  | { type: "ne"; column: MockColumn; value: unknown };

type MockOrder = { type: "asc" | "desc"; column: MockColumn };

function eq(column: MockColumn, value: unknown): MockExpr {
  return { type: "eq", column, value };
}

function ne(column: MockColumn, value: unknown): MockExpr {
  return { type: "ne", column, value };
}

function and(...conditions: MockExpr[]): MockExpr {
  return { type: "and", conditions };
}

function inArray(column: MockColumn, values: unknown[]): MockExpr {
  return { type: "inArray", column, values };
}

function isNotNull(column: MockColumn): MockExpr {
  return { type: "isNotNull", column };
}

function desc(column: MockColumn): MockOrder {
  return { type: "desc", column };
}

function getColumnValue(context: Record<string, Record<string, any>>, column: MockColumn) {
  return context[column.table]?.[column.key];
}

function matchesExpr(context: Record<string, Record<string, any>>, expr?: MockExpr | null): boolean {
  if (!expr) return true;

  switch (expr.type) {
    case "and":
      return expr.conditions.every((condition) => matchesExpr(context, condition));
    case "eq": {
      const rightValue = isMockColumn(expr.value) ? getColumnValue(context, expr.value) : expr.value;
      return getColumnValue(context, expr.column) === rightValue;
    }
    case "ne": {
      const rightValue = isMockColumn(expr.value) ? getColumnValue(context, expr.value) : expr.value;
      return getColumnValue(context, expr.column) !== rightValue;
    }
    case "inArray": {
      const values = expr.values as unknown[];
      return values.includes(getColumnValue(context, expr.column));
    }
    case "isNotNull":
      return getColumnValue(context, expr.column) != null;
    default:
      return true;
  }
}

function isMockColumn(value: unknown): value is MockColumn {
  return Boolean(value) && typeof value === "object" && "key" in (value as Record<string, unknown>) && "table" in (value as Record<string, unknown>);
}

function projectRow(
  projection: Record<string, MockColumn> | undefined,
  contexts: Record<string, Record<string, any>>[],
  baseTable: MockTable,
) {
  if (!projection) {
    return contexts.map((context) => ({ ...context[baseTable.__table] }));
  }

  return contexts.map((context) => {
    const projected: Record<string, any> = {};
    for (const [key, column] of Object.entries(projection)) {
      projected[key] = getColumnValue(context, column);
    }
    return projected;
  });
}

function createSelectBuilder(projection?: Record<string, MockColumn>) {
  class SelectBuilder {
    private baseTable?: MockTable;
    private join?: { on: MockExpr; table: MockTable };
    private limitCount?: number;
    private order?: MockOrder;
    private whereExpr?: MockExpr;

    from(table: MockTable) {
      this.baseTable = table;
      return this;
    }

    innerJoin(table: MockTable, on: MockExpr) {
      this.join = { table, on };
      return this;
    }

    limit(count: number) {
      this.limitCount = count;
      return Promise.resolve(this.execute());
    }

    orderBy(order: MockOrder | MockColumn) {
      this.order = "type" in order ? order : { type: "asc", column: order };
      return this.asResult();
    }

    where(expr: MockExpr) {
      this.whereExpr = expr;
      return this.asResult();
    }

    private asResult() {
      const rows = this.execute() as any;
      const self = this;
      rows.limit = (count: number) => {
        self.limitCount = count;
        return Promise.resolve(self.execute());
      };
      rows.orderBy = (order: MockOrder | MockColumn) => {
        self.order = "type" in order ? order : { type: "asc", column: order };
        return self.asResult();
      };
      rows.where = (expr: MockExpr) => {
        self.whereExpr = expr;
        return self.asResult();
      };
      return rows;
    }

    private execute() {
      if (!this.baseTable) {
        return [];
      }

      const baseRows = runtimeState.tables[this.baseTable.__table as keyof typeof runtimeState.tables] ?? [];
      let contexts = baseRows.map((row) => ({ [this.baseTable!.__table]: row }));

      if (this.join) {
        const joinRows = runtimeState.tables[this.join.table.__table as keyof typeof runtimeState.tables] ?? [];
        contexts = contexts.flatMap((context) => joinRows
          .map((joinRow) => ({ ...context, [this.join!.table.__table]: joinRow }))
          .filter((joinedContext) => matchesExpr(joinedContext, this.join!.on)));
      }

      if (this.whereExpr) {
        contexts = contexts.filter((context) => matchesExpr(context, this.whereExpr));
      }

      if (this.order) {
        const direction = this.order.type === "desc" ? -1 : 1;
        contexts.sort((left, right) => {
          const leftValue = getColumnValue(left, this.order!.column);
          const rightValue = getColumnValue(right, this.order!.column);
          if (leftValue === rightValue) return 0;
          return leftValue > rightValue ? direction : -direction;
        });
      }

      const rows = projection
        ? projectRow(projection, contexts, this.baseTable)
        : projectRow(undefined, contexts, this.baseTable);

      return typeof this.limitCount === "number" ? rows.slice(0, this.limitCount) : rows;
    }
  }

  return new SelectBuilder();
}

const dbMock = vi.hoisted(() => ({
  delete(table: MockTable) {
    return {
      where(expr: MockExpr) {
        const rows = runtimeState.tables[table.__table as keyof typeof runtimeState.tables] as Array<Record<string, any>>;
        runtimeState.tables[table.__table as keyof typeof runtimeState.tables] = rows.filter((row) => !matchesExpr({ [table.__table]: row }, expr)) as never;
        return Promise.resolve();
      },
    };
  },
  insert(table: MockTable) {
    return {
      values(values: Record<string, any> | Array<Record<string, any>>) {
        const rows = Array.isArray(values) ? values : [values];
        const target = runtimeState.tables[table.__table as keyof typeof runtimeState.tables] as Array<Record<string, any>>;
        target.push(...rows.map((row) => ({ ...row })));
        return Promise.resolve();
      },
    };
  },
  select(projection?: Record<string, MockColumn>) {
    return createSelectBuilder(projection);
  },
  transaction<T>(callback: (tx: typeof dbMock) => Promise<T>) {
    return callback(dbMock as any);
  },
  update(table: MockTable) {
    return {
      set(values: Record<string, any>) {
        return {
          where(expr: MockExpr) {
            const rows = runtimeState.tables[table.__table as keyof typeof runtimeState.tables] as Array<Record<string, any>>;
            for (const row of rows) {
              if (matchesExpr({ [table.__table]: row }, expr)) {
                Object.assign(row, values);
              }
            }
            return Promise.resolve();
          },
        };
      },
    };
  },
}));

const mocks = vi.hoisted(() => ({
  createOpenAIMock: vi.fn(),
  extractTextMock: vi.fn(),
  generateTextMock: vi.fn(),
  getTemplateMock: vi.fn(),
  logErrorMock: vi.fn(),
  logInfoMock: vi.fn(),
  logWarnMock: vi.fn(),
  parseResumeTextMock: vi.fn(),
  verifyCandidateSchoolsMock: vi.fn(),
}));

vi.mock("drizzle-orm", () => ({ and, desc, eq, inArray, isNotNull, ne }));

vi.mock("../../schema", () => schemaMock);

vi.mock("../../db", () => ({
  db: dbMock,
}));

vi.mock("../../config", () => ({
  config: {
    dataDir: runtimeState.dataDir,
    filesDir: runtimeState.filesDir,
  },
}));

vi.mock("ai", () => ({
  generateText: mocks.generateTextMock,
}));

vi.mock("@ai-sdk/openai", () => ({
  createOpenAI: mocks.createOpenAIMock,
}));

vi.mock("./extractor", () => ({
  extractText: mocks.extractTextMock,
}));

vi.mock("./parser", () => ({
  parseResumeText: mocks.parseResumeTextMock,
}));

vi.mock("../university-verification", () => ({
  verifyCandidateSchools: mocks.verifyCandidateSchoolsMock,
}));

vi.mock("../screening-templates", () => ({
  screeningTemplatesService: {
    getTemplate: mocks.getTemplateMock,
  },
}));

vi.mock("../../utils/logger", () => ({
  logError: mocks.logErrorMock,
  logInfo: mocks.logInfoMock,
  logWarn: mocks.logWarnMock,
}));

function createTemplate(id: string, prompt: string) {
  return {
    id,
    name: id,
    description: null,
    prompt,
    isDefault: false,
    isActive: true,
    version: 1,
    createdAt: 1_734_000_000_000,
    updatedAt: 1_734_000_000_000,
  };
}

function createParsedResume() {
  return {
    name: "张三",
    phone: "13800001111",
    email: "zhangsan@example.com",
    position: "前端工程师",
    yearsOfExperience: 4,
    skills: ["TypeScript", "Vue"],
    education: ["清华大学 计算机科学与技术"],
    workHistory: ["负责 Web 前端开发"],
    rawText: "张三 raw text",
  };
}

function createAiPayload(score: number) {
  return {
    text: JSON.stringify({
      verdict: score >= 80 ? "pass" : "review",
      label: score >= 80 ? "通过" : "待定",
      score,
      candidateName: "张三",
      candidatePosition: "前端工程师",
      candidateYearsOfExperience: 4,
      screeningBaseUrl: "https://ai-gateway.test/v1",
      summary: `评分 ${score}`,
      strengths: ["TypeScript 经验完整"],
      concerns: score >= 80 ? [] : ["需要补充更多项目细节"],
      recommendedAction: score >= 80 ? "建议进入下一轮。" : "建议补充信息后复核。",
      wechatConclusion: score >= 80 ? "通过" : "待定",
      wechatReason: score >= 80 ? "经验匹配" : "信息不足",
      wechatAction: score >= 80 ? "建议安排技术面试" : "建议补充经历信息",
      wechatCopyText: score >= 80 ? "通过\n经验匹配\n建议安排技术面试" : "待定\n信息不足\n建议补充经历信息",
    }),
  };
}

beforeEach(() => {
  runtimeState.tables.artifacts = [];
  runtimeState.tables.candidateWorkspaces = [];
  runtimeState.tables.candidates = [];
  runtimeState.tables.importBatches = [];
  runtimeState.tables.importFileTasks = [];
  runtimeState.tables.interviews = [];
  runtimeState.tables.providerCredentials = [];
  runtimeState.tables.resumes = [];
  runtimeState.tables.users = [];

  mocks.createOpenAIMock.mockReset().mockReturnValue({
    chat: vi.fn(() => "mocked-openai-model"),
  });
  mocks.extractTextMock.mockReset().mockResolvedValue({
    text: "张三\n13800001111\nzhangsan@example.com\n4年前端经验",
    confidence: 92,
  });
  mocks.generateTextMock.mockReset();
  mocks.getTemplateMock.mockReset().mockImplementation(async (templateId: string) => {
    if (templateId === "template-a") return createTemplate("template-a", "模板 A：偏重 TypeScript 与 Vue 项目经验");
    if (templateId === "template-b") return createTemplate("template-b", "模板 B：偏重低代码平台与中后台协作经验");
    return null;
  });
  mocks.logErrorMock.mockReset();
  mocks.logInfoMock.mockReset();
  mocks.logWarnMock.mockReset();
  mocks.parseResumeTextMock.mockReset().mockReturnValue(createParsedResume());
  mocks.verifyCandidateSchoolsMock.mockReset().mockResolvedValue([]);
});

afterEach(() => {
  if (runtimeState.rootDir) {
    rmSync(runtimeState.rootDir, { force: true, recursive: true });
  }
  runtimeState.rootDir = "";
  runtimeState.dataDir = "";
  runtimeState.filesDir = "";
});

async function setupRuntime(name: string) {
  vi.resetModules();
  runtimeState.rootDir = mkdtempSync(join(tmpdir(), `ims-hash-reuse-${name}-`));
  runtimeState.dataDir = join(runtimeState.rootDir, "data");
  runtimeState.filesDir = join(runtimeState.rootDir, "files");
  mkdirSync(runtimeState.dataDir, { recursive: true });
  mkdirSync(runtimeState.filesDir, { recursive: true });
  process.env.CUSTOM_API_KEY = "test-key";
  process.env.IMPORT_SCREENING_MODEL = "gpt-4o-mini";
  process.env.CUSTOM_BASE_URL = "https://ai-gateway.test/v1";

  const pipeline = await import("./pipeline");
  const hashReuse = await import("./hash-reuse");
  const aiScreening = await import("./ai-screening");

  return { aiScreening, hashReuse, pipeline };
}

function seedBatchAndTask(options: {
  batchId: string;
  originalPath: string;
  taskId: string;
  templateId?: string | null;
}) {
  const now = Date.now();
  runtimeState.tables.importBatches.push({
    id: options.batchId,
    displayName: options.batchId,
    status: "queued",
    sourceType: "pdf",
    currentStage: "queued",
    totalFiles: 1,
    processedFiles: 0,
    successFiles: 0,
    failedFiles: 0,
    autoScreen: true,
    templateId: options.templateId ?? null,
    createdAt: now,
    startedAt: null,
    completedAt: null,
  });

  runtimeState.tables.importFileTasks.push({
    id: options.taskId,
    batchId: options.batchId,
    originalPath: options.originalPath,
    normalizedPath: null,
    fileType: "pdf",
    status: "queued",
    stage: "queued",
    errorCode: null,
    errorMessage: null,
    candidateId: null,
    resultJson: null,
    retryCount: 0,
    fileHash: null,
    createdAt: now,
    updatedAt: now,
  });
}

describe("import pipeline hash reuse", () => {
  test("first import calls LLM once and second identical import reuses without extra LLM call", async () => {
    const runtime = await setupRuntime("reuse-hit");
    const sameBytes = Buffer.from("%PDF-1.4 same resume bytes\n");
    const firstFile = join(runtimeState.dataDir, "first.pdf");
    const secondFile = join(runtimeState.dataDir, "second.pdf");
    writeFileSync(firstFile, sameBytes);
    writeFileSync(secondFile, sameBytes);

    mocks.generateTextMock.mockResolvedValue(createAiPayload(88));

    seedBatchAndTask({ batchId: "batch-1", originalPath: firstFile, taskId: "task-1", templateId: "template-a" });
    seedBatchAndTask({ batchId: "batch-2", originalPath: secondFile, taskId: "task-2", templateId: "template-a" });

    await runtime.pipeline.processFile("task-1", firstFile, "pdf", "template-a");
    expect(mocks.generateTextMock).toHaveBeenCalledTimes(1);

    const firstTask = runtimeState.tables.importFileTasks.find((task) => task.id === "task-1");
    const firstResult = JSON.parse(firstTask?.resultJson ?? "null");
    expect(firstTask?.fileHash).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(firstResult.fileHash).toBe(firstTask?.fileHash);
    expect(firstResult.screeningSource).toBe("ai");
    expect(firstResult.screeningReuseKey).toMatch(/^sha256:[a-f0-9]{64}$/);

    await runtime.pipeline.processFile("task-2", secondFile, "pdf", "template-a");
    expect(mocks.generateTextMock).toHaveBeenCalledTimes(1);

    const secondTask = runtimeState.tables.importFileTasks.find((task) => task.id === "task-2");
    const secondResult = JSON.parse(secondTask?.resultJson ?? "null");

    expect(secondTask?.fileHash).toBe(firstTask?.fileHash);
    expect(secondResult.screeningSource).toBe("reused");
    expect(secondResult.reusedFromTaskId).toBe("task-1");
    expect(typeof secondResult.reusedAt).toBe("number");
    expect(secondResult.screeningReuseKey).toBe(firstResult.screeningReuseKey);
    expect(secondResult.screeningConclusion).toEqual(firstResult.screeningConclusion);
    expect(secondResult.templateInfo).toEqual(firstResult.templateInfo);
    expect(runtimeState.tables.resumes).toHaveLength(2);
    expect(runtimeState.tables.resumes[0]?.fileHash).toBe(firstTask?.fileHash);
    expect(runtimeState.tables.resumes[1]?.fileHash).toBe(firstTask?.fileHash);
  });

  test("same file with changed template does not reuse previous screening", async () => {
    const runtime = await setupRuntime("reuse-miss-template");
    const sameBytes = Buffer.from("%PDF-1.4 identical bytes but different template\n");
    const firstFile = join(runtimeState.dataDir, "first.pdf");
    const secondFile = join(runtimeState.dataDir, "second.pdf");
    writeFileSync(firstFile, sameBytes);
    writeFileSync(secondFile, sameBytes);

    mocks.generateTextMock
      .mockResolvedValueOnce(createAiPayload(86))
      .mockResolvedValueOnce(createAiPayload(71));

    seedBatchAndTask({ batchId: "batch-a", originalPath: firstFile, taskId: "task-a", templateId: "template-a" });
    seedBatchAndTask({ batchId: "batch-b", originalPath: secondFile, taskId: "task-b", templateId: "template-b" });

    await runtime.pipeline.processFile("task-a", firstFile, "pdf", "template-a");
    await runtime.pipeline.processFile("task-b", secondFile, "pdf", "template-b");

    expect(mocks.generateTextMock).toHaveBeenCalledTimes(2);

    const firstTask = runtimeState.tables.importFileTasks.find((task) => task.id === "task-a");
    const secondTask = runtimeState.tables.importFileTasks.find((task) => task.id === "task-b");
    const firstResult = JSON.parse(firstTask?.resultJson ?? "null");
    const secondResult = JSON.parse(secondTask?.resultJson ?? "null");

    expect(firstTask?.fileHash).toBe(secondTask?.fileHash);
    expect(secondResult.screeningSource).toBe("ai");
    expect(secondResult.reusedFromTaskId).toBeNull();
    expect(secondResult.screeningReuseKey).not.toBe(firstResult.screeningReuseKey);
  });

  test("failed prior result is never reused even when hash and reuse key match", async () => {
    const runtime = await setupRuntime("reuse-miss-failed");
    const sameBytes = Buffer.from("%PDF-1.4 failed prior result bytes\n");
    const filePath = join(runtimeState.dataDir, "resume.pdf");
    writeFileSync(filePath, sameBytes);

    mocks.generateTextMock.mockResolvedValue(createAiPayload(90));

    const fileHash = runtime.hashReuse.computeFileHash(filePath);
    const reuseContext = await runtime.aiScreening.resolveImportScreeningReuseContext("template-a");
    const screeningReuseKey = runtime.hashReuse.buildScreeningReuseKey({
      fileHash,
      promptSnapshot: reuseContext.promptSnapshot,
      templateId: reuseContext.templateInfo?.templateId,
      templateVersion: reuseContext.templateInfo?.templateVersion,
      screeningProviderId: reuseContext.screeningProviderId,
      screeningModel: reuseContext.screeningModel,
      normalizedBaseURL: reuseContext.normalizedBaseURL,
    });

    const now = Date.now();
    runtimeState.tables.importBatches.push({
      id: "batch-failed-source",
      displayName: "failed-source",
      status: "completed",
      sourceType: "pdf",
      currentStage: "completed",
      totalFiles: 1,
      processedFiles: 1,
      successFiles: 0,
      failedFiles: 1,
      autoScreen: true,
      templateId: "template-a",
      createdAt: now,
      startedAt: now,
      completedAt: now,
    });
    runtimeState.tables.importFileTasks.push({
      id: "task-failed-source",
      batchId: "batch-failed-source",
      originalPath: filePath,
      normalizedPath: null,
      fileType: "pdf",
      status: "done",
      stage: "completed",
      errorCode: null,
      errorMessage: null,
      candidateId: null,
      resultJson: JSON.stringify({
        parsedResume: createParsedResume(),
        screeningStatus: "failed",
        screeningSource: "failed",
        screeningError: "AI 初筛失败",
        screeningConclusion: null,
        fileHash,
        screeningReuseKey,
        reusedFromTaskId: null,
        reusedAt: null,
      }),
      retryCount: 0,
      fileHash,
      createdAt: now,
      updatedAt: now,
    });

    seedBatchAndTask({ batchId: "batch-current", originalPath: filePath, taskId: "task-current", templateId: "template-a" });

    await runtime.pipeline.processFile("task-current", filePath, "pdf", "template-a");
    expect(mocks.generateTextMock).toHaveBeenCalledTimes(1);

    const currentTask = runtimeState.tables.importFileTasks.find((task) => task.id === "task-current");
    const currentResult = JSON.parse(currentTask?.resultJson ?? "null");

    expect(currentResult.screeningSource).toBe("ai");
    expect(currentResult.reusedFromTaskId).toBeNull();
  });
});
