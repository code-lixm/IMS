import {
  type InterviewImportAIDraft,
  type InterviewImportConfirmationState,
  type InterviewImportDecisionState,
  type InterviewImportBatchSummary,
  type InterviewImportMode,
  type InterviewImportPayload,
  type InterviewImportPersistenceResult,
  type InterviewImportRawInput,
  type InterviewImportSystemContext,
  validateInterviewImportAIDraft,
  validateInterviewImportPayload,
} from "@ims/shared";
import { eq } from "drizzle-orm";
import { db } from "../../db";
import { importBatches, importFileTasks, interviewAssessments, interviews } from "../../schema";
import { logError, logInfo, logWarn } from "../../utils/logger";
import {
  type InterviewImportCandidateResolutionResult,
  type ResolveInterviewImportCandidateOptions,
  resolveInterviewImportCandidate,
} from "./candidate-resolution";
import {
  type InterviewRoundAppendedResult,
  type InterviewRoundFailedResult,
  type InterviewRoundPersistenceAssessmentInsert,
  type InterviewRoundPersistenceInterviewInsert,
  type InterviewRoundPersistenceSummary,
  type InterviewRoundSkippedResult,
  type NormalizedInterviewImportRound,
  prepareInterviewRoundPersistence,
} from "./round-persistence";
import {
  advanceInterviewImportWorkflow,
  type InterviewImportWorkflowAdvanceServiceResult,
} from "./workflow-advance";

const ACTIVE_TASK_STATUSES = [
  "queued",
  "preparing",
  "extracting_resume",
  "parsing_payload",
  "resolving_candidate",
  "appending_rounds",
  "ai_advancing_stage",
] as const;

const TERMINAL_TASK_STATUSES = ["completed", "partial_success", "failed", "skipped"] as const;

const STAGE_PRIORITY = [
  "queued",
  "preparing",
  "extracting_resume",
  "parsing_payload",
  "resolving_candidate",
  "appending_rounds",
  "ai_advancing_stage",
] as const;

const MIXED_ROUND_NUMBER_WARNING = "检测到显式 roundNumber 与隐式推导混用；当前 append-only pipeline 会按 shared inferRoundNumbers 规则处理，但不保证轮次连续递增，建议后续优先显式填写每轮 roundNumber。";

export type InterviewImportTaskStage = typeof ACTIVE_TASK_STATUSES[number] | typeof TERMINAL_TASK_STATUSES[number];

export interface InterviewImportTaskSummary {
  createdCandidate: boolean;
  candidateId: string | null;
  appendedRounds: InterviewRoundAppendedResult[];
  skippedRounds: InterviewRoundSkippedResult[];
  failedRounds: InterviewRoundFailedResult[];
  workflowAdvance: InterviewImportWorkflowAdvanceServiceResult | null;
  errors: string[];
  warnings: string[];
}

export interface InterviewImportPipelineRoundPersistenceResult {
  startFrom: number;
  normalizedRounds: NormalizedInterviewImportRound[];
  interviewCreates: InterviewRoundPersistenceInterviewInsert[];
  assessmentCreates: InterviewRoundPersistenceAssessmentInsert[];
  summary: InterviewRoundPersistenceSummary;
}

export interface InterviewImportTaskResult {
  sourceType: "interview_data";
  mode: InterviewImportMode | null;
  rawInput: InterviewImportRawInput | null;
  systemContext: InterviewImportSystemContext | null;
  aiDraft: InterviewImportAIDraft | null;
  confirmation: InterviewImportConfirmationState | null;
  persistence: InterviewImportPersistenceResult | null;
  decisionState: InterviewImportDecisionState | null;
  candidateResolution: InterviewImportCandidateResolutionResult | null;
  roundPersistence: InterviewImportPipelineRoundPersistenceResult | null;
  summary: InterviewImportTaskSummary;
  completedAt: number | null;
}

export interface ProcessInterviewImportTaskOptions extends Pick<ResolveInterviewImportCandidateOptions, "resumePdf"> {}

interface LoadedInterviewImportTask {
  id: string;
  batchId: string;
  status: string;
  stage: string | null;
  payloadJson: string | null;
}

interface LoadedInterviewImportBatch {
  id: string;
  status: string;
  sourceType: string | null;
}

function buildEmptySummary(): InterviewImportTaskSummary {
  return {
    createdCandidate: false,
    candidateId: null,
    appendedRounds: [],
    skippedRounds: [],
    failedRounds: [],
    workflowAdvance: null,
    errors: [],
    warnings: [],
  };
}

function buildEmptyResult(mode: InterviewImportMode | null = null): InterviewImportTaskResult {
  return {
    sourceType: "interview_data",
    mode,
    rawInput: null,
    systemContext: null,
    aiDraft: null,
    confirmation: null,
    persistence: null,
    decisionState: null,
    candidateResolution: null,
    roundPersistence: null,
    summary: buildEmptySummary(),
    completedAt: null,
  };
}

function normalizeMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error ?? "未知错误");
}

function normalizeOptionalText(value: string | undefined | null): string | null {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

function extractRawInput(payload: InterviewImportPayload): InterviewImportRawInput {
  if (payload.rawInput) {
    return payload.rawInput;
  }

  return {
    resume: payload.resume
      ? {
          pdfPath: normalizeOptionalText(payload.resume.pdfPath) ?? undefined,
          extractedText: normalizeOptionalText(payload.resume.extractedText) ?? undefined,
        }
      : undefined,
    meetingNotesText: normalizeOptionalText(payload.meetingNotesText) ?? undefined,
  };
}

function extractSystemContext(payload: InterviewImportPayload): InterviewImportSystemContext {
  if (payload.systemContext) {
    return payload.systemContext;
  }

  return {
    candidateId: payload.mode === "create_candidate" ? undefined : (normalizeOptionalText(getLegacyCandidateId(payload)) || undefined),
    candidateName: payload.mode === "create_candidate" ? (normalizeOptionalText(getLegacyCandidateName(payload)) || undefined) : undefined,
  };
}

function getLegacyCandidateId(payload: InterviewImportPayload): string | undefined {
  return "candidateId" in payload ? payload.candidateId : undefined;
}

function getLegacyCandidateName(payload: InterviewImportPayload): string | undefined {
  return "name" in payload ? payload.name : undefined;
}

function buildCompatibilityAIDraft(
  payload: InterviewImportPayload,
  rawInput: InterviewImportRawInput,
  systemContext: InterviewImportSystemContext,
  capturedAt: number,
): InterviewImportAIDraft {
  const sourceText = rawInput.resume?.extractedText?.trim() || rawInput.meetingNotesText?.trim() || payload.overallSummaryText?.trim() || payload.interviewQuestionsText?.trim() || null;
  const candidateName = systemContext.candidateName ?? (payload.mode === "create_candidate" ? normalizeOptionalText(getLegacyCandidateName(payload)) : null) ?? "候选人";
  const candidateId = normalizeOptionalText(systemContext.candidateId) ?? undefined;
  const inferredRounds = payload.rounds.map((round, index) => ({
    ...round,
    inputIndex: index,
    resolvedRoundNumber: typeof round.roundNumber === "number" && Number.isFinite(round.roundNumber) ? round.roundNumber : index + 1,
    confidence: 0.92,
    reason: "legacy payload bridge",
    auditSnapshot: {
      sourceText: sourceText ?? undefined,
      model: "legacy_bridge",
      promptVersion: "compat_v1",
      capturedAt,
    },
  }));

  return {
    candidateOptions: [
      {
        candidateId,
        candidateName,
        confidence: candidateId ? 1 : 0.85,
        reason: candidateId ? "system context candidateId" : "legacy payload bridge",
        evidence: sourceText ? [sourceText.slice(0, 180)] : undefined,
      },
    ],
    rounds: inferredRounds,
    overallEvaluationText: normalizeOptionalText(payload.overallSummaryText) ?? normalizeOptionalText(payload.meetingNotesText) ?? undefined,
    confidence: candidateId ? 1 : 0.85,
    reasons: [candidateId ? "系统上下文已提供候选人标识" : "使用兼容桥接自动生成 AI draft"],
    auditSnapshot: {
      sourceText: sourceText ?? undefined,
      model: "legacy_bridge",
      promptVersion: "compat_v1",
      capturedAt,
    },
  };
}

function normalizeAIDraft(payload: InterviewImportPayload, rawInput: InterviewImportRawInput, systemContext: InterviewImportSystemContext, capturedAt: number) {
  return payload.aiDraft ?? buildCompatibilityAIDraft(payload, rawInput, systemContext, capturedAt);
}

function deriveDecisionState(
  payload: InterviewImportPayload,
  aiDraft: InterviewImportAIDraft,
  validationErrors: Array<{ field: string; message: string }>,
): InterviewImportDecisionState {
  if (validationErrors.length > 0) {
    return "rejected_invalid_input";
  }

  const providedDecision = payload.confirmation?.decisionState;
  if (providedDecision) {
    return providedDecision;
  }

  const minConfidence = 0.7;
  if (!Number.isFinite(aiDraft.confidence) || aiDraft.confidence < minConfidence) {
    return "needs_confirmation";
  }

  return "auto_commit";
}

function normalizeConfirmationState(
  payload: InterviewImportPayload,
  decisionState: InterviewImportDecisionState,
  validationErrors: Array<{ field: string; message: string }>,
): InterviewImportConfirmationState {
  const provided = payload.confirmation;
  const reason = normalizeOptionalText(provided?.reason) ?? (decisionState === "needs_confirmation" ? "AI draft 置信度不足，需要人工确认后再落库。" : decisionState === "rejected_invalid_input" ? "输入数据校验失败。" : "AI draft 通过自动落库条件。");
  const warnings = Array.from(new Set([...(provided?.warnings ?? []), ...(decisionState === "needs_confirmation" ? ["AI draft 置信度不足，需要人工确认。"] : [])]));
  const errors = validationErrors.length > 0
    ? validationErrors
    : provided?.errors ?? [];

  return {
    decisionState,
    reason,
    warnings,
    errors,
  };
}

function parseInterviewImportPayload(payloadJson: string | null): InterviewImportPayload {
  if (!payloadJson?.trim()) {
    throw new Error("缺少 interview import payload_json");
  }

  return JSON.parse(payloadJson) as InterviewImportPayload;
}

function hasMixedRoundNumberInputs(payload: InterviewImportPayload): boolean {
  const hasExplicit = payload.rounds.some(
    (round) => typeof round.roundNumber === "number" && Number.isFinite(round.roundNumber),
  );
  const hasImplicit = payload.rounds.some(
    (round) => !(typeof round.roundNumber === "number" && Number.isFinite(round.roundNumber)),
  );
  return hasExplicit && hasImplicit;
}

function toBatchSummary(result: InterviewImportTaskResult): InterviewImportBatchSummary {
  const { summary } = result;
  return {
    createdCandidate: summary.createdCandidate ? summary.candidateId : null,
    candidateId: summary.candidateId,
    appendedRounds: summary.appendedRounds.length,
    skippedRounds: summary.skippedRounds.length,
    failedRounds: summary.failedRounds.length,
    workflowAdvance: summary.workflowAdvance,
    decisionState: result.decisionState,
    confirmation: result.confirmation,
    persistence: result.persistence,
    warnings: [...summary.warnings],
    errors: [...summary.errors],
  };
}

function stageWeight(stage: string | null | undefined): number {
  if (!stage) {
    return -1;
  }

  const index = STAGE_PRIORITY.indexOf(stage as typeof STAGE_PRIORITY[number]);
  return index >= 0 ? index : -1;
}

async function loadTask(taskId: string): Promise<LoadedInterviewImportTask> {
  const [task] = await db
    .select({
      id: importFileTasks.id,
      batchId: importFileTasks.batchId,
      status: importFileTasks.status,
      stage: importFileTasks.stage,
      payloadJson: importFileTasks.payloadJson,
    })
    .from(importFileTasks)
    .where(eq(importFileTasks.id, taskId))
    .limit(1);

  if (!task) {
    throw new Error(`interview import task not found: ${taskId}`);
  }

  return task;
}

async function loadBatch(batchId: string): Promise<LoadedInterviewImportBatch> {
  const [batch] = await db
    .select({
      id: importBatches.id,
      status: importBatches.status,
      sourceType: importBatches.sourceType,
    })
    .from(importBatches)
    .where(eq(importBatches.id, batchId))
    .limit(1);

  if (!batch) {
    throw new Error(`interview import batch not found: ${batchId}`);
  }

  return batch;
}

async function updateTask(
  taskId: string,
  updates: Partial<{
    status: string;
    stage: string | null;
    errorCode: string | null;
    errorMessage: string | null;
    candidateId: string | null;
    resultJson: string | null;
    updatedAt: number;
  }>,
) {
  await db.update(importFileTasks).set(updates).where(eq(importFileTasks.id, taskId));
}

async function updateBatch(
  batchId: string,
  updates: Partial<{
    status: string;
    currentStage: string | null;
    summaryJson: string | null;
    processedFiles: number;
    successFiles: number;
    failedFiles: number;
    startedAt: number | null;
    completedAt: number | null;
  }>,
) {
  await db.update(importBatches).set(updates).where(eq(importBatches.id, batchId));
}

async function markTaskCancelledIfNeeded(taskId: string): Promise<boolean> {
  const [row] = await db
    .select({
      taskStatus: importFileTasks.status,
      batchStatus: importBatches.status,
    })
    .from(importFileTasks)
    .innerJoin(importBatches, eq(importFileTasks.batchId, importBatches.id))
    .where(eq(importFileTasks.id, taskId))
    .limit(1);

  if (!row || row.batchStatus !== "cancelled") {
    return false;
  }

  if (row.taskStatus !== "skipped") {
    await updateTask(taskId, {
      status: "skipped",
      stage: "cancelled",
      errorCode: null,
      errorMessage: "cancelled by user",
      updatedAt: Date.now(),
    });
  }

  return true;
}

function buildPartialFailureResults(
  rounds: NormalizedInterviewImportRound[],
  skippedRounds: InterviewRoundSkippedResult[],
  reason: string,
): InterviewRoundFailedResult[] {
  const skippedRoundKeys = new Set(skippedRounds.map((round) => `${round.inputIndex}:${round.roundNumber}`));

  return rounds
    .filter((round) => !skippedRoundKeys.has(`${round.inputIndex}:${round.roundNumber}`))
    .map((round) => ({
      status: "failed",
      code: "round_persistence_failed",
      inputIndex: round.inputIndex,
      roundNumber: round.roundNumber,
      roundName: round.roundName,
      reason,
    }));
}

export async function refreshInterviewImportBatchProgress(batchId: string) {
  const [batch] = await db
    .select({
      status: importBatches.status,
      sourceType: importBatches.sourceType,
    })
    .from(importBatches)
    .where(eq(importBatches.id, batchId))
    .limit(1);
  if (!batch) {
    return;
  }

  const allTasks = await db
    .select({
      id: importFileTasks.id,
      status: importFileTasks.status,
      stage: importFileTasks.stage,
      resultJson: importFileTasks.resultJson,
    })
    .from(importFileTasks)
    .where(eq(importFileTasks.batchId, batchId));

  const total = allTasks.length;
  const processed = allTasks.filter((task) => TERMINAL_TASK_STATUSES.includes(task.status as typeof TERMINAL_TASK_STATUSES[number])).length;
  const completed = allTasks.filter((task) => task.status === "completed").length;
  const partialSuccess = allTasks.filter((task) => task.status === "partial_success").length;
  const failed = allTasks.filter((task) => task.status === "failed").length;

  if (batch.status === "cancelled") {
    await updateBatch(batchId, {
      status: "cancelled",
      processedFiles: processed,
      successFiles: completed + partialSuccess,
      failedFiles: failed,
      currentStage: "cancelled",
      completedAt: Date.now(),
    });
    return;
  }

  const activeStage = allTasks
    .filter((task) => ACTIVE_TASK_STATUSES.includes(task.status as typeof ACTIVE_TASK_STATUSES[number]))
    .sort((left, right) => stageWeight(right.stage ?? right.status) - stageWeight(left.stage ?? left.status))[0]?.stage ?? null;

  let batchStatus = "processing";
  if (processed >= total) {
    if (failed === total && total > 0) {
      batchStatus = "failed";
    } else if (failed > 0 || partialSuccess > 0) {
      batchStatus = "partial_success";
    } else {
      batchStatus = "completed";
    }
  }

  let summaryJson: string | null = null;
  if (batch.sourceType === "interview_data") {
    const terminalTask = allTasks.find((task) => task.resultJson?.trim());
    if (terminalTask?.resultJson?.trim()) {
      summaryJson = JSON.stringify(toBatchSummary(JSON.parse(terminalTask.resultJson) as InterviewImportTaskResult));
    }
  }

  await updateBatch(batchId, {
    status: batchStatus,
    processedFiles: processed,
    successFiles: completed + partialSuccess,
    failedFiles: failed,
    currentStage: batchStatus === "processing" ? activeStage ?? batchStatus : batchStatus,
    completedAt: batchStatus === "processing" ? null : Date.now(),
    summaryJson,
  });
}

export async function processInterviewImportTask(
  taskId: string,
  options: ProcessInterviewImportTaskOptions = {},
): Promise<InterviewImportTaskResult> {
  const startedAt = Date.now();
  const task = await loadTask(taskId);
  const batch = await loadBatch(task.batchId);

  if (batch.sourceType !== "interview_data") {
    throw new Error(`task ${taskId} is not an interview_data import task`);
  }

  if (await markTaskCancelledIfNeeded(taskId)) {
    await refreshInterviewImportBatchProgress(task.batchId);
    return buildEmptyResult();
  }

  await updateBatch(task.batchId, {
    status: "processing",
    currentStage: "preparing",
    startedAt,
    completedAt: null,
  });
  await updateTask(taskId, {
    status: "preparing",
    stage: "preparing",
    updatedAt: startedAt,
  });

  let payload: InterviewImportPayload | null = null;
  let result = buildEmptyResult();

  try {
    await updateTask(taskId, {
      status: "parsing_payload",
      stage: "parsing_payload",
      updatedAt: Date.now(),
    });

    payload = parseInterviewImportPayload(task.payloadJson);
    result = buildEmptyResult(payload.mode);

    const rawInput = extractRawInput(payload);
    const systemContext = extractSystemContext(payload);
    const aiDraft = normalizeAIDraft(payload, rawInput, systemContext, startedAt);
    const normalizedPayload = {
      ...payload,
    candidateId: normalizeOptionalText(getLegacyCandidateId(payload) ?? systemContext.candidateId),
    name: payload.mode === "create_candidate" ? normalizeOptionalText(getLegacyCandidateName(payload) ?? systemContext.candidateName) ?? getLegacyCandidateName(payload) : getLegacyCandidateName(payload),
    rawInput,
    systemContext,
    aiDraft,
  } as unknown as InterviewImportPayload;
    const aiDraftErrors = validateInterviewImportAIDraft(aiDraft);
    const payloadErrors = validateInterviewImportPayload(normalizedPayload);
    const validationErrors = [...payloadErrors, ...aiDraftErrors];
    const decisionState = deriveDecisionState(normalizedPayload, aiDraft, validationErrors);
    const confirmation = normalizeConfirmationState(normalizedPayload, decisionState, validationErrors);

    result.rawInput = rawInput;
    result.systemContext = systemContext;
    result.aiDraft = aiDraft;
    result.confirmation = confirmation;
    result.decisionState = decisionState;
    result.summary.warnings.push(...confirmation.warnings);
    result.summary.errors.push(...confirmation.errors.map((error) => `${error.field}: ${error.message}`));

    if (hasMixedRoundNumberInputs(payload)) {
      result.summary.warnings.push(MIXED_ROUND_NUMBER_WARNING);
      logWarn("interview_import.pipeline.mixed_round_numbers", {
        taskId,
        batchId: task.batchId,
      });
    }

    if (decisionState === "rejected_invalid_input") {
      result.summary.errors.push("AI draft 或输入内容校验失败，已拒绝落库");
      result.completedAt = Date.now();
      result.persistence = {
        state: "failed",
        candidateId: null,
        batchId: task.batchId,
        taskId,
        warnings: [...result.summary.warnings],
        errors: [...result.summary.errors],
        snapshotRef: {
          payloadJson: JSON.stringify(normalizedPayload),
          aiDraftJson: JSON.stringify(aiDraft),
          confirmationJson: JSON.stringify(confirmation),
          resultJson: JSON.stringify({ ...result, persistence: null }),
          auditSnapshotJson: JSON.stringify(aiDraft.auditSnapshot),
        },
      };
      await updateTask(taskId, {
        status: "failed",
        stage: "failed",
        candidateId: null,
        resultJson: JSON.stringify(result),
        errorCode: "INTERVIEW_IMPORT_FAILED",
        errorMessage: result.summary.errors.join("；") || "interview import rejected",
        updatedAt: Date.now(),
      });
      await refreshInterviewImportBatchProgress(task.batchId);
      return result;
    }

    if (decisionState === "needs_confirmation") {
      result.completedAt = Date.now();
      result.persistence = {
        state: "pending",
        candidateId: null,
        batchId: task.batchId,
        taskId,
        warnings: [...result.summary.warnings],
        errors: [...result.summary.errors],
        snapshotRef: {
          payloadJson: JSON.stringify(normalizedPayload),
          aiDraftJson: JSON.stringify(aiDraft),
          confirmationJson: JSON.stringify(confirmation),
          resultJson: JSON.stringify({ ...result, persistence: null }),
          auditSnapshotJson: JSON.stringify(aiDraft.auditSnapshot),
        },
      };

      await updateTask(taskId, {
        status: "partial_success",
        stage: "needs_confirmation",
        candidateId: null,
        resultJson: JSON.stringify(result),
        errorCode: null,
        errorMessage: null,
        updatedAt: Date.now(),
      });
      await refreshInterviewImportBatchProgress(task.batchId);
      return result;
    }

    const hasResumeInput = Boolean(options.resumePdf || rawInput.resume?.pdfPath?.trim());
    await updateTask(taskId, {
      status: hasResumeInput ? "extracting_resume" : "resolving_candidate",
      stage: hasResumeInput ? "extracting_resume" : "resolving_candidate",
      updatedAt: Date.now(),
      resultJson: JSON.stringify(result),
    });

    const candidateResolution = await resolveInterviewImportCandidate(normalizedPayload, {
      batchId: task.batchId,
      resumePdf: options.resumePdf,
      systemContext,
      aiDraft,
      now: startedAt,
    });
    result.candidateResolution = candidateResolution;
    result.summary.createdCandidate = candidateResolution.createdCandidate;
    result.summary.candidateId = candidateResolution.candidateId;

    if (candidateResolution.resumeError) {
      result.summary.errors.push(`简历导入失败：${candidateResolution.resumeError.message}`);
    }

    if (await markTaskCancelledIfNeeded(taskId)) {
      await refreshInterviewImportBatchProgress(task.batchId);
      return result;
    }

    await updateTask(taskId, {
      status: "appending_rounds",
      stage: "appending_rounds",
      candidateId: candidateResolution.candidateId,
      resultJson: JSON.stringify(result),
      updatedAt: Date.now(),
    });

    const existingInterviews = await db
      .select({
        id: interviews.id,
        round: interviews.round,
      })
      .from(interviews)
      .where(eq(interviews.candidateId, candidateResolution.candidateId));

    const roundPersistence = prepareInterviewRoundPersistence({
      candidateId: candidateResolution.candidateId,
      rounds: aiDraft.rounds,
      existingInterviews,
      now: startedAt,
    });

    result.roundPersistence = roundPersistence;

    try {
      await db.transaction(async (tx) => {
        if (roundPersistence.interviewCreates.length > 0) {
          await tx.insert(interviews).values(roundPersistence.interviewCreates);
        }
        if (roundPersistence.assessmentCreates.length > 0) {
          await tx.insert(interviewAssessments).values(roundPersistence.assessmentCreates);
        }
      });

      result.summary.appendedRounds = roundPersistence.summary.appendedRounds;
      result.summary.skippedRounds = roundPersistence.summary.skippedRounds;
      result.summary.failedRounds = roundPersistence.summary.failedRounds;
    } catch (error) {
      const reason = normalizeMessage(error);
      result.summary.skippedRounds = roundPersistence.summary.skippedRounds;
      result.summary.failedRounds = buildPartialFailureResults(
        roundPersistence.normalizedRounds,
        roundPersistence.summary.skippedRounds,
        reason,
      );
      result.summary.errors.push(`面试轮次写入失败：${reason}`);
      logError("interview_import.pipeline.round_persistence_failed", error, {
        taskId,
        batchId: task.batchId,
        candidateId: candidateResolution.candidateId,
      });
    }

    await updateTask(taskId, {
      status: "ai_advancing_stage",
      stage: "ai_advancing_stage",
      candidateId: candidateResolution.candidateId,
      resultJson: JSON.stringify(result),
      updatedAt: Date.now(),
    });

    const workflowAdvanceResult: InterviewImportWorkflowAdvanceServiceResult = await advanceInterviewImportWorkflow({
      batchId: task.batchId,
      importSource: batch.sourceType ?? "interview_data",
      candidateId: candidateResolution.candidateId,
      roundPersistence: result.roundPersistence,
    });
    result.summary.workflowAdvance = workflowAdvanceResult;

    if (workflowAdvanceResult.errorMessage) {
      result.summary.errors.push(`工作流推进失败：${workflowAdvanceResult.errorMessage}`);
      logWarn("interview_import.pipeline.workflow_advance_failed", {
        taskId,
        batchId: task.batchId,
        candidateId: candidateResolution.candidateId,
        errorMessage: workflowAdvanceResult.errorMessage,
      });
    }

    const finalStatus = resolveTaskTerminalStatus(result.summary);
    result.completedAt = Date.now();
    result.persistence = {
      state: finalStatus === "completed" ? "persisted" : finalStatus === "partial_success" ? "persisted" : "failed",
      candidateId: candidateResolution.candidateId,
      batchId: task.batchId,
      taskId,
      warnings: [...result.summary.warnings],
      errors: [...result.summary.errors],
      snapshotRef: {
        payloadJson: JSON.stringify(normalizedPayload),
        aiDraftJson: JSON.stringify(aiDraft),
        confirmationJson: JSON.stringify(confirmation),
        resultJson: JSON.stringify({ ...result, persistence: null }),
        auditSnapshotJson: JSON.stringify(aiDraft.auditSnapshot),
      },
    };

    await updateTask(taskId, {
      status: finalStatus,
      stage: finalStatus,
      candidateId: candidateResolution.candidateId,
      resultJson: JSON.stringify(result),
      errorCode: finalStatus === "failed" ? "INTERVIEW_IMPORT_FAILED" : null,
      errorMessage: finalStatus === "failed" ? result.summary.errors.join("；") || "interview import failed" : null,
      updatedAt: Date.now(),
    });

    await refreshInterviewImportBatchProgress(task.batchId);

    logInfo("interview_import.pipeline.finish", {
      taskId,
      batchId: task.batchId,
      candidateId: candidateResolution.candidateId,
      status: finalStatus,
      appendedRounds: result.summary.appendedRounds.length,
      skippedRounds: result.summary.skippedRounds.length,
      failedRounds: result.summary.failedRounds.length,
      durationMs: Date.now() - startedAt,
    });

    return result;
  } catch (error) {
    const message = normalizeMessage(error);
    result.summary.errors.push(message);
    result.completedAt = Date.now();

    await updateTask(taskId, {
      status: "failed",
      stage: "failed",
      candidateId: result.summary.candidateId,
      resultJson: JSON.stringify(result),
      errorCode: "INTERVIEW_IMPORT_FAILED",
      errorMessage: message,
      updatedAt: Date.now(),
    });
    await refreshInterviewImportBatchProgress(task.batchId);

    logError("interview_import.pipeline.failed", error, {
      taskId,
      batchId: task.batchId,
      mode: payload?.mode ?? null,
      durationMs: Date.now() - startedAt,
    });

    return result;
  }
}

function resolveTaskTerminalStatus(summary: InterviewImportTaskSummary): "completed" | "partial_success" | "failed" {
  const hasFailedRounds = summary.failedRounds.length > 0;
  const hasWarningsOrErrors = summary.warnings.length > 0 || summary.errors.length > 0;
  const hasSuccessfulRoundOutcome = summary.appendedRounds.length > 0 || summary.skippedRounds.length > 0;

  if (hasFailedRounds && !hasSuccessfulRoundOutcome) {
    return "failed";
  }

  if (hasFailedRounds || hasWarningsOrErrors) {
    return "partial_success";
  }

  return "completed";
}
