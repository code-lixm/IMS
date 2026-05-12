/**
 * Interview import types & helpers — the shared contract between
 * server pipeline and web UI for importing interview data.
 *
 * New contract layers:
 *   1) raw input        — user-supplied PDF / meeting notes
 *   2) system context   — readonly context such as candidateId
 *   3) AI draft         — candidate hypotheses, round splits, confidence, audit
 *   4) confirmation / persistence — decision state and storage outcome
 *
 * Legacy payloads remain as compatibility bridges for the current pipeline.
 * Round numbers are append-only: duplicates are skipped, missing numbers
 * are inferred from array position.
 */

// ---------------------------------------------------------------------------
// Modes / decision states
// ---------------------------------------------------------------------------

export type InterviewImportMode =
  | "create_candidate"
  | "bind_existing_candidate"
  | "candidate_detail_append";

export type InterviewImportDecisionState =
  | "auto_commit"
  | "needs_confirmation"
  | "rejected_invalid_input";

// ---------------------------------------------------------------------------
// Raw input
// ---------------------------------------------------------------------------

export interface InterviewImportResumeInfo {
  pdfPath?: string;
  extractedText?: string;
}

export interface InterviewImportRawInput {
  resume?: InterviewImportResumeInfo;
  meetingNotesText?: string;
}

export interface InterviewImportSystemContext {
  candidateId?: string;
  candidateName?: string;
}

// ---------------------------------------------------------------------------
// Round input
// ---------------------------------------------------------------------------

export interface InterviewImportRoundInput {
  /**
   * 1-based round number. When omitted, derived from array position
   * (start=1 for create_candidate, continue-from-existing for append modes).
   */
  roundNumber?: number;
  /** Human-readable round label, e.g. "技术一面" */
  roundName?: string;
  /** ISO 8601 date string or free-form date */
  interviewDate?: string;
  /** Interviewer names */
  interviewerNames?: string[];
  /** Interview type label, e.g. "电话", "现场", "视频" */
  interviewType?: string;
  /** Required free-text evaluation for this round */
  evaluationText: string;
  /** Outcome label, e.g. "通过", "待定", "未通过" */
  resultLabel?: string;
}

// ---------------------------------------------------------------------------
// AI draft
// ---------------------------------------------------------------------------

export interface InterviewImportAuditSnapshot {
  sourceText?: string;
  model?: string;
  promptVersion?: string;
  capturedAt?: number;
}

export interface InterviewImportAICandidateHypothesis {
  candidateId?: string;
  candidateName: string;
  confidence: number;
  reason: string;
  evidence?: string[];
}

export interface InterviewImportAIRoundDraft extends InterviewImportRoundInput {
  inputIndex: number;
  resolvedRoundNumber: number;
  confidence: number;
  reason: string;
  auditSnapshot?: InterviewImportAuditSnapshot;
}

export interface InterviewImportAIDraft {
  candidateOptions: InterviewImportAICandidateHypothesis[];
  rounds: InterviewImportAIRoundDraft[];
  overallEvaluationText?: string;
  confidence: number;
  reasons: string[];
  auditSnapshot: InterviewImportAuditSnapshot;
}

// ---------------------------------------------------------------------------
// Confirmation / persistence
// ---------------------------------------------------------------------------

export interface InterviewImportValidationError {
  field: string;
  message: string;
}

export interface InterviewImportConfirmationState {
  decisionState: InterviewImportDecisionState;
  reason: string;
  warnings: string[];
  errors: InterviewImportValidationError[];
}

export interface InterviewImportPersistenceSnapshotRef {
  payloadJson?: string | null;
  aiDraftJson?: string | null;
  confirmationJson?: string | null;
  resultJson?: string | null;
  auditSnapshotJson?: string | null;
}

export interface InterviewImportPersistenceResult {
  state: "persisted" | "pending" | "skipped" | "failed";
  candidateId: string | null;
  batchId: string | null;
  taskId: string | null;
  warnings: string[];
  errors: string[];
  snapshotRef: InterviewImportPersistenceSnapshotRef;
}

// ---------------------------------------------------------------------------
// Legacy compatibility bridge
// ---------------------------------------------------------------------------

export interface InterviewImportLegacyContractBridge {
  rawInput?: InterviewImportRawInput;
  systemContext?: InterviewImportSystemContext;
  aiDraft?: InterviewImportAIDraft | null;
  confirmation?: InterviewImportConfirmationState | null;
  persistence?: InterviewImportPersistenceResult | null;
}

// ---------------------------------------------------------------------------
// Import-level text fields (shared across all legacy modes)
// ---------------------------------------------------------------------------

export interface InterviewImportTextFields {
  resume?: InterviewImportResumeInfo;
  interviewQuestionsText?: string;
  meetingNotesText?: string;
  overallSummaryText?: string;
}

// ---------------------------------------------------------------------------
// Payload discriminated by mode (legacy bridge)
// ---------------------------------------------------------------------------

export interface CreateCandidatePayload extends InterviewImportTextFields, InterviewImportLegacyContractBridge {
  mode: "create_candidate";
  name: string;
  phone?: string;
  email?: string;
  position?: string;
  yearsOfExperience?: number;
  source?: "local" | "remote" | "hybrid";
  tags?: string[];
  rounds: InterviewImportRoundInput[];
}

export interface BindExistingCandidatePayload extends InterviewImportTextFields, InterviewImportLegacyContractBridge {
  mode: "bind_existing_candidate";
  candidateId: string;
  rounds: InterviewImportRoundInput[];
}

export interface CandidateDetailAppendPayload extends InterviewImportTextFields, InterviewImportLegacyContractBridge {
  mode: "candidate_detail_append";
  candidateId: string;
  rounds: InterviewImportRoundInput[];
}

export type InterviewImportPayload =
  | CreateCandidatePayload
  | BindExistingCandidatePayload
  | CandidateDetailAppendPayload;

// ---------------------------------------------------------------------------
// Workflow advance result (structured, not free text)
// ---------------------------------------------------------------------------

export interface InterviewImportWorkflowAdvanceResult {
  fromStage: string;
  toStage: string;
  maxAdvancedRound: number | null;
  advanced: boolean;
}

// ---------------------------------------------------------------------------
// Batch summary (append-only import result)
// ---------------------------------------------------------------------------

export interface InterviewImportBatchSummary {
  createdCandidate: string | null;
  candidateId: string | null;
  appendedRounds: number;
  skippedRounds: number;
  failedRounds: number;
  workflowAdvance: InterviewImportWorkflowAdvanceResult | null;
  decisionState?: InterviewImportDecisionState | null;
  confirmation?: InterviewImportConfirmationState | null;
  persistence?: InterviewImportPersistenceResult | null;
  warnings?: string[];
  errors: string[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export interface InferredRound extends InterviewImportRoundInput {
  resolvedRoundNumber: number;
}

function normalizeOptionalText(value: string | undefined | null) {
  const normalized = value?.trim();
  return normalized ? normalized : undefined;
}

function isValidConfidence(value: number | undefined | null) {
  return Number.isFinite(value) && Number(value) >= 0 && Number(value) <= 1;
}

/**
 * Infer round numbers for an array of round inputs.
 *
 * When `roundNumber` is explicitly provided, it is used as-is.
 * When omitted, it is derived from array position starting at `startFrom`.
 */
export function inferRoundNumbers(
  rounds: InterviewImportRoundInput[],
  startFrom: number = 1,
): InferredRound[] {
  return rounds.map((round, index) => {
    const resolvedRoundNumber =
      typeof round.roundNumber === "number" && Number.isFinite(round.roundNumber)
        ? round.roundNumber
        : startFrom + index;
    return { ...round, resolvedRoundNumber };
  });
}

export function validateInterviewImportRawInput(
  rawInput: InterviewImportRawInput,
): InterviewImportValidationError[] {
  const errors: InterviewImportValidationError[] = [];

  const resumePdfPath = normalizeOptionalText(rawInput.resume?.pdfPath);
  const extractedText = normalizeOptionalText(rawInput.resume?.extractedText);
  const meetingNotesText = normalizeOptionalText(rawInput.meetingNotesText);

  if (!resumePdfPath && !extractedText && !meetingNotesText) {
    errors.push({ field: "rawInput", message: "原始输入至少需要 PDF 或会议纪要" });
  }

  return errors;
}

export function validateInterviewImportAIDraft(
  draft: InterviewImportAIDraft,
): InterviewImportValidationError[] {
  const errors: InterviewImportValidationError[] = [];

  if (!draft.candidateOptions.length) {
    errors.push({ field: "candidateOptions", message: "AI 候选集不能为空" });
  }

  if (!draft.rounds.length) {
    errors.push({ field: "rounds", message: "AI 解析结果至少需要一轮" });
  }

  if (!isValidConfidence(draft.confidence)) {
    errors.push({ field: "confidence", message: "AI draft 置信度必须在 0 到 1 之间" });
  }

  if (!draft.reasons.length) {
    errors.push({ field: "reasons", message: "AI draft 需要提供解释理由" });
  }

  if (draft.auditSnapshot.capturedAt !== undefined && !Number.isFinite(draft.auditSnapshot.capturedAt)) {
    errors.push({ field: "auditSnapshot.capturedAt", message: "审计快照时间戳必须是有限数字" });
  }

  draft.candidateOptions.forEach((option, index) => {
    if (!normalizeOptionalText(option.candidateName)) {
      errors.push({ field: `candidateOptions[${index}].candidateName`, message: "候选人名称为必填项" });
    }
    if (!isValidConfidence(option.confidence)) {
      errors.push({ field: `candidateOptions[${index}].confidence`, message: "候选人置信度必须在 0 到 1 之间" });
    }
    if (!normalizeOptionalText(option.reason)) {
      errors.push({ field: `candidateOptions[${index}].reason`, message: "候选人解释理由为必填项" });
    }
  });

  draft.rounds.forEach((round, index) => {
    if (!Number.isInteger(round.inputIndex) || round.inputIndex < 0) {
      errors.push({ field: `rounds[${index}].inputIndex`, message: "AI 轮次输入索引必须为非负整数" });
    }
    if (!Number.isInteger(round.resolvedRoundNumber) || round.resolvedRoundNumber < 1) {
      errors.push({ field: `rounds[${index}].resolvedRoundNumber`, message: "AI 轮次编号必须为正整数" });
    }
    if (!isValidConfidence(round.confidence)) {
      errors.push({ field: `rounds[${index}].confidence`, message: "AI 轮次置信度必须在 0 到 1 之间" });
    }
    if (!normalizeOptionalText(round.reason)) {
      errors.push({ field: `rounds[${index}].reason`, message: "AI 轮次解释理由为必填项" });
    }
  });

  return errors;
}

export function validateInterviewImportConfirmationState(
  confirmation: InterviewImportConfirmationState,
): InterviewImportValidationError[] {
  const errors: InterviewImportValidationError[] = [];

  if (!confirmation.reason.trim()) {
    errors.push({ field: "reason", message: "确认状态需要说明理由" });
  }

  if (!Array.isArray(confirmation.warnings)) {
    errors.push({ field: "warnings", message: "确认状态需要 warnings 列表" });
  }

  if (!Array.isArray(confirmation.errors)) {
    errors.push({ field: "errors", message: "确认状态需要 errors 列表" });
  }

  if (!["auto_commit", "needs_confirmation", "rejected_invalid_input"].includes(confirmation.decisionState)) {
    errors.push({ field: "decisionState", message: "无效的确认决策状态" });
  }

  return errors;
}

export function validateInterviewImportPersistenceResult(
  result: InterviewImportPersistenceResult,
): InterviewImportValidationError[] {
  const errors: InterviewImportValidationError[] = [];

  if (!["persisted", "pending", "skipped", "failed"].includes(result.state)) {
    errors.push({ field: "state", message: "无效的落库状态" });
  }

  if (result.state === "persisted" && !normalizeOptionalText(result.candidateId ?? undefined)) {
    errors.push({ field: "candidateId", message: "持久化结果需要 candidateId" });
  }

  if (!result.snapshotRef || typeof result.snapshotRef !== "object") {
    errors.push({ field: "snapshotRef", message: "落库结果需要快照引用" });
  }

  return errors;
}

/**
 * Validate an interview import payload.
 *
 * Returns an array of validation errors (empty = valid).
 */
export function validateInterviewImportPayload(
  payload: InterviewImportPayload,
): InterviewImportValidationError[] {
  const errors: InterviewImportValidationError[] = [];

  if (!payload.rounds || payload.rounds.length === 0) {
    errors.push({ field: "rounds", message: "至少需要一轮面试数据" });
  }

  switch (payload.mode) {
    case "create_candidate": {
      if (!payload.name || payload.name.trim().length === 0) {
        errors.push({ field: "name", message: "候选人姓名为必填项" });
      }
      break;
    }
    case "bind_existing_candidate":
    case "candidate_detail_append": {
      break;
    }
  }

  if (payload.rawInput) {
    errors.push(...validateInterviewImportRawInput(payload.rawInput));
  }

  if (payload.aiDraft) {
    errors.push(...validateInterviewImportAIDraft(payload.aiDraft));
  }

  if (payload.confirmation) {
    errors.push(...validateInterviewImportConfirmationState(payload.confirmation));
  }

  if (payload.persistence) {
    errors.push(...validateInterviewImportPersistenceResult(payload.persistence));
  }

  if (payload.rounds) {
    payload.rounds.forEach((round, index) => {
      if (
        round.roundNumber !== undefined &&
        (!Number.isFinite(round.roundNumber) || round.roundNumber < 1)
      ) {
        errors.push({
          field: `rounds[${index}].roundNumber`,
          message: `轮次编号必须为正整数，收到 ${String(round.roundNumber)}`,
        });
      }
      if (!round.evaluationText || round.evaluationText.trim().length === 0) {
        errors.push({
          field: `rounds[${index}].evaluationText`,
          message: "每轮评价内容为必填项",
        });
      }
    });
  }

  return errors;
}
