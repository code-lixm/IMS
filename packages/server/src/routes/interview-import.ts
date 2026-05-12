import { desc, eq } from "drizzle-orm";
import {
  type InterviewImportAIDraft,
  type InterviewImportConfirmationState,
  type InterviewImportBatchSummary,
  type InterviewImportPayload,
  type InterviewImportPersistenceResult,
  type InterviewImportRawInput,
  type InterviewImportSystemContext,
  validateInterviewImportPayload,
} from "@ims/shared";
import { db } from "../db";
import { importBatches, importFileTasks } from "../schema";
import {
  processInterviewImportTask,
  refreshInterviewImportBatchProgress,
} from "../services/interview-import/pipeline";
import { corsHeaders, fail, ok } from "../utils/http";
import { cancelImportBatch } from "../services/import/pipeline";

type InterviewImportCreateResult = {
  batch: typeof importBatches.$inferSelect & { summary: InterviewImportBatchSummary | null };
  task: typeof importFileTasks.$inferSelect;
};

type InterviewImportTaskResultJson = {
  aiDraft?: InterviewImportAIDraft | null;
  confirmation?: InterviewImportConfirmationState | null;
  decisionState?: string | null;
  summary?: InterviewImportBatchSummary | null;
};

function parseJson<T>(request: Request): Promise<T> {
  return request.json() as Promise<T>;
}

function parseJsonString<T>(value: string | null | undefined): T {
  if (!value?.trim()) {
    throw new Error("missing json value");
  }

  return JSON.parse(value) as T;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function getString(value: FormDataEntryValue | null | undefined): string {
  return typeof value === "string" ? value.trim() : "";
}

function parseMaybeJson<T>(value: FormDataEntryValue | null | undefined): T | null {
  const raw = getString(value);
  if (!raw) return null;

  return JSON.parse(raw) as T;
}

function parseNumber(value: FormDataEntryValue | null | undefined): number | undefined {
  const raw = getString(value);
  if (!raw) return undefined;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function buildDisplayName(payload: InterviewImportPayload, batchId: string, createdAt: number): string {
  const suffix = normalizeOptionalText(
    payload.systemContext?.candidateName
      ?? payload.aiDraft?.candidateOptions[0]?.candidateName
      ?? payload.systemContext?.candidateId
      ?? (payload.mode === "create_candidate" ? getLegacyCandidateName(payload) : getLegacyCandidateId(payload)),
  );
  return `面试数据导入-${suffix || `${createdAt}-${batchId.slice(-6)}`}`;
}

function getLegacyCandidateId(payload: InterviewImportPayload): string | undefined {
  return (payload as { candidateId?: string }).candidateId;
}

function getLegacyCandidateName(payload: InterviewImportPayload): string | undefined {
  return (payload as { name?: string }).name;
}

function normalizePayloadFromFormData(formData: FormData): InterviewImportPayload {
  const payloadJson = getString(formData.get("payload")) || getString(formData.get("json")) || getString(formData.get("body"));
  if (payloadJson) {
    return JSON.parse(payloadJson) as InterviewImportPayload;
  }

  const rounds = parseMaybeJson<InterviewImportPayload["rounds"]>(formData.get("rounds")) ?? [];
  const mode = getString(formData.get("mode"));
  const basePayload: Record<string, unknown> = {
    mode,
    rounds,
    rawInput: parseMaybeJson<InterviewImportRawInput>(formData.get("rawInput")) ?? undefined,
    systemContext: parseMaybeJson<InterviewImportSystemContext>(formData.get("systemContext")) ?? undefined,
    aiDraft: parseMaybeJson<InterviewImportAIDraft | null>(formData.get("aiDraft")) ?? undefined,
    confirmation: parseMaybeJson<InterviewImportConfirmationState | null>(formData.get("confirmation")) ?? undefined,
    persistence: parseMaybeJson<InterviewImportPersistenceResult | null>(formData.get("persistence")) ?? undefined,
    interviewQuestionsText: getString(formData.get("interviewQuestionsText")) || undefined,
    meetingNotesText: getString(formData.get("meetingNotesText")) || undefined,
    overallSummaryText: getString(formData.get("overallSummaryText")) || undefined,
  };

  const resume = formData.get("resume");
  if (isRecord(resume)) {
    basePayload.resume = resume;
  }

  if (mode === "create_candidate") {
    return {
      ...basePayload,
      name: getString(formData.get("name")),
      phone: getString(formData.get("phone")) || undefined,
      email: getString(formData.get("email")) || undefined,
      position: getString(formData.get("position")) || undefined,
      yearsOfExperience: parseNumber(formData.get("yearsOfExperience")),
      source: getString(formData.get("source")) as "local" | "remote" | "hybrid" | undefined,
      tags: parseMaybeJson<string[]>(formData.get("tags")) ?? undefined,
    } as InterviewImportPayload;
  }

  return {
    ...basePayload,
    candidateId: getString(formData.get("candidateId")),
  } as InterviewImportPayload;
}

function normalizeOptionalText(value: string | undefined | null) {
  const normalized = value?.trim();
  return normalized ? normalized : undefined;
}

function normalizePayloadForValidation(payload: InterviewImportPayload): InterviewImportPayload {
  return {
    ...payload,
    candidateId: normalizeOptionalText(getLegacyCandidateId(payload) ?? payload.systemContext?.candidateId),
    name: payload.mode === "create_candidate" ? normalizeOptionalText(getLegacyCandidateName(payload) ?? payload.systemContext?.candidateName) ?? getLegacyCandidateName(payload) : getLegacyCandidateName(payload),
  } as unknown as InterviewImportPayload;
}

function validateCreatePayload(payload: InterviewImportPayload): string | null {
  if (![
    "create_candidate",
    "bind_existing_candidate",
    "candidate_detail_append",
  ].includes(payload.mode)) {
    return "无效的导入模式";
  }

  const errors = validateInterviewImportPayload(normalizePayloadForValidation(payload));
  if (payload.mode === "create_candidate") {
    if (!normalizeOptionalText(getLegacyCandidateName(payload) ?? payload.systemContext?.candidateName)) {
      errors.push({ field: "name", message: "候选人姓名为必填项" });
    }
    if (!payload.position?.trim()) {
      errors.push({ field: "position", message: "候选人岗位为必填项" });
    }
    if (!payload.phone?.trim() && !payload.email?.trim()) {
      errors.push({ field: "phone", message: "手机号或邮箱至少填写一项" });
    }
  }

  return errors[0]?.message ?? null;
}

async function loadInterviewImportBatch(batchId: string) {
  const [row] = await db.select().from(importBatches).where(eq(importBatches.id, batchId)).limit(1);
  return row ?? null;
}

function parseBatchSummary(summaryJson: string | null | undefined): InterviewImportBatchSummary | null {
  if (!summaryJson?.trim()) return null;
  try {
    const parsed = JSON.parse(summaryJson) as InterviewImportBatchSummary;
    return isRecord(parsed) ? parsed as InterviewImportBatchSummary : null;
  } catch {
    return null;
  }
}

function parseTaskResultJson(resultJson: string | null | undefined): InterviewImportTaskResultJson | null {
  if (!resultJson?.trim()) {
    return null;
  }

  try {
    const parsed = JSON.parse(resultJson) as InterviewImportTaskResultJson;
    return isRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function serializeBatch(row: typeof importBatches.$inferSelect | null) {
  if (!row) return null;
  return {
    ...row,
    summary: parseBatchSummary(row.summaryJson),
  };
}

async function createInterviewImportBatch(payload: InterviewImportPayload, resumePdf: File | null) {
  const batchId = `batch_${crypto.randomUUID()}`;
  const taskId = `task_${crypto.randomUUID()}`;
  const now = Date.now();
  const displayName = buildDisplayName(payload, batchId, now);

  const batchRow = {
    id: batchId,
    displayName,
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
    createdAt: now,
    startedAt: now,
    completedAt: null,
  };

  const taskRow = {
    id: taskId,
    batchId,
    originalPath: resumePdf?.name ?? "interview-import.json",
    normalizedPath: null,
    fileType: resumePdf?.type ?? "application/json",
    status: "queued",
    stage: null,
    errorCode: null,
    errorMessage: null,
    candidateId: null,
    matchedTemplateId: null,
    payloadJson: JSON.stringify(payload),
    resultJson: null,
    retryCount: 0,
    fileHash: null,
    createdAt: now,
    updatedAt: now,
  };

  await db.insert(importBatches).values(batchRow);
  await db.insert(importFileTasks).values(taskRow);

  void processInterviewImportTask(taskId, resumePdf ? { resumePdf } : {}).catch((error) => {
    console.error("[interview-import] failed to process task", error);
  });

  await refreshInterviewImportBatchProgress(batchId);

  const createdBatch = await loadInterviewImportBatch(batchId);
  if (!createdBatch) {
    throw new Error(`created interview import batch not found: ${batchId}`);
  }

  return {
    batchId,
    taskId,
    batch: serializeBatch(createdBatch)!,
    task: taskRow,
  } satisfies InterviewImportCreateResult & { batchId: string; taskId: string };
}

export async function interviewImportRoute(request: Request): Promise<Response | null> {
  const url = new URL(request.url);
  const path = url.pathname;

  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders() });
  }

  if (path === "/api/interview-import/batches" && request.method === "GET") {
    try {
      const rows = await db
        .select()
        .from(importBatches)
        .where(eq(importBatches.sourceType, "interview_data"))
        .orderBy(desc(importBatches.createdAt))
        .limit(50);

      return ok({ items: rows.map((row) => serializeBatch(row)) });
    } catch (error) {
      console.error("[interview-import] failed to list batches", error);
      return fail("INTERNAL_ERROR", "Failed to list interview import batches", 500);
    }
  }

  if (path === "/api/interview-import/batches" && request.method === "POST") {
    try {
      const contentType = request.headers.get("content-type") ?? "";

      let payload: InterviewImportPayload;
      let upload: File | null = null;

      if (contentType.includes("multipart/form-data")) {
        const formData = await request.formData();
        upload = formData.get("resumePdf") instanceof File && (formData.get("resumePdf") as File).size > 0 ? (formData.get("resumePdf") as File) : null;
        payload = normalizePayloadFromFormData(formData);
      } else {
        payload = await parseJson<InterviewImportPayload>(request);
      }

      const validationError = validateCreatePayload(payload);
      if (validationError) {
        return fail("VALIDATION_ERROR", validationError, 422);
      }

      const result = await createInterviewImportBatch(payload, upload);
      return ok(result, { status: 201 });
    } catch (error) {
      if (error instanceof SyntaxError) {
        return fail("VALIDATION_ERROR", "invalid interview import payload", 422);
      }
      console.error("[interview-import] failed to create batch", error);
      return fail("INTERNAL_ERROR", "Failed to create interview import batch", 500);
    }
  }

  const batchMatch = path.match(/^\/api\/interview-import\/batches\/([^/]+)$/);
  if (batchMatch && request.method === "GET") {
    try {
      const batchId = batchMatch[1];
      await refreshInterviewImportBatchProgress(batchId);

      const batch = await loadInterviewImportBatch(batchId);
      if (!batch || batch.sourceType !== "interview_data") {
        return fail("NOT_FOUND", "batch not found", 404);
      }

      const tasks = await db.select().from(importFileTasks).where(eq(importFileTasks.batchId, batchId));
      return ok({ batch: serializeBatch(batch), items: tasks });
    } catch (error) {
      console.error("[interview-import] failed to load batch", error);
      return fail("INTERNAL_ERROR", "Failed to load interview import batch", 500);
    }
  }

  const batchFilesMatch = path.match(/^\/api\/interview-import\/batches\/([^/]+)\/files$/);
  if (batchFilesMatch && request.method === "GET") {
    try {
      const batchId = batchFilesMatch[1];
      const batch = await loadInterviewImportBatch(batchId);
      if (!batch || batch.sourceType !== "interview_data") {
        return fail("NOT_FOUND", "batch not found", 404);
      }

      const items = await db.select().from(importFileTasks).where(eq(importFileTasks.batchId, batchId));
      return ok({ items });
    } catch (error) {
      console.error("[interview-import] failed to load batch files", error);
      return fail("INTERNAL_ERROR", "Failed to load interview import files", 500);
    }
  }

  const batchCancelMatch = path.match(/^\/api\/interview-import\/batches\/([^/]+)\/cancel$/);
  if (batchCancelMatch && request.method === "POST") {
    try {
      const batchId = batchCancelMatch[1];
      const batch = await loadInterviewImportBatch(batchId);
      if (!batch || batch.sourceType !== "interview_data") {
        return fail("NOT_FOUND", "batch not found", 404);
      }

      await cancelImportBatch(batchId);
      return ok({ id: batchId, status: "cancelled" });
    } catch (error) {
      console.error("[interview-import] failed to cancel batch", error);
      return fail("INTERNAL_ERROR", "Failed to cancel interview import batch", 500);
    }
  }

  const batchConfirmMatch = path.match(/^\/api\/interview-import\/batches\/([^/]+)\/confirm$/);
  if (batchConfirmMatch && request.method === "POST") {
    try {
      const batchId = batchConfirmMatch[1];
      const batch = await loadInterviewImportBatch(batchId);
      if (!batch || batch.sourceType !== "interview_data") {
        return fail("NOT_FOUND", "batch not found", 404);
      }

      const [task] = await db.select().from(importFileTasks).where(eq(importFileTasks.batchId, batchId)).limit(1);
      if (!task) {
        return fail("NOT_FOUND", "task not found", 404);
      }

      const parsedTaskResult = parseTaskResultJson(task.resultJson);
      if (parsedTaskResult?.decisionState !== "needs_confirmation") {
        return fail("VALIDATION_ERROR", "当前批次不需要确认", 422);
      }

      const payload = parseJsonString<InterviewImportPayload>(task.payloadJson);
      const confirmedPayload: InterviewImportPayload = {
        ...payload,
        aiDraft: parsedTaskResult.aiDraft ?? payload.aiDraft ?? undefined,
        confirmation: {
          decisionState: "auto_commit",
          reason: "用户已确认 AI 建议，继续落库。",
          warnings: parsedTaskResult.confirmation?.warnings ?? [],
          errors: [],
        },
        persistence: null,
      };

      await db.update(importFileTasks).set({
        payloadJson: JSON.stringify(confirmedPayload),
        status: "queued",
        stage: null,
        errorCode: null,
        errorMessage: null,
        resultJson: null,
        updatedAt: Date.now(),
      }).where(eq(importFileTasks.id, task.id));

      await db.update(importBatches).set({
        status: "processing",
        currentStage: "queued",
        completedAt: null,
      }).where(eq(importBatches.id, batchId));

      void processInterviewImportTask(task.id, {}).catch((error) => {
        console.error("[interview-import] failed to continue confirmed task", error);
      });

      await refreshInterviewImportBatchProgress(batchId);

      const nextBatch = await loadInterviewImportBatch(batchId);
      const nextTask = await db.select().from(importFileTasks).where(eq(importFileTasks.batchId, batchId)).limit(1);

      return ok({
        batch: serializeBatch(nextBatch)!,
        task: nextTask[0] ?? task,
      });
    } catch (error) {
      console.error("[interview-import] failed to confirm batch", error);
      return fail("INTERNAL_ERROR", "Failed to confirm interview import batch", 500);
    }
  }

  return null;
}
