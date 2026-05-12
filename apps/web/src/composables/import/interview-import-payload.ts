import type {
  CandidateDetailAppendPayload,
  InterviewImportRawInput,
  InterviewImportSystemContext,
} from "@ims/shared";
import type { InterviewImportPayload } from "@ims/shared";

export interface InterviewImportFormDraft {
  meetingNotesText: string;
}

export interface InterviewImportValidationIssue {
  field: string;
  message: string;
  severity: "error" | "warning";
}

export interface InterviewImportSubmissionContext {
  candidateId?: string;
  candidateName?: string | null;
  nextRoundNumber?: number;
  resumePdf?: File | null;
}

function normalizeOptionalText(value: string | null | undefined) {
  const normalized = value?.trim();
  return normalized ? normalized : undefined;
}

function createHiddenRoundEvaluationText(draft: InterviewImportFormDraft, context: InterviewImportSubmissionContext) {
  return normalizeOptionalText(draft.meetingNotesText)
    ?? normalizeOptionalText(context.resumePdf?.name)
    ?? normalizeOptionalText(context.candidateName)
    ?? "候选人导入";
}

function resolveRoundNumber(context: InterviewImportSubmissionContext) {
  const value = context.nextRoundNumber ?? 1;
  return Number.isFinite(value) && value > 0 ? Math.trunc(value) : 1;
}

function buildRawInput(context: InterviewImportSubmissionContext, draft: InterviewImportFormDraft): InterviewImportRawInput {
  return {
    resume: context.resumePdf
      ? {
          pdfPath: context.resumePdf.name,
        }
      : undefined,
    meetingNotesText: normalizeOptionalText(draft.meetingNotesText),
  };
}

function buildSystemContext(context: InterviewImportSubmissionContext): InterviewImportSystemContext {
  return {
    candidateId: normalizeOptionalText(context.candidateId),
    candidateName: normalizeOptionalText(context.candidateName),
  };
}

function buildCandidateDetailPayload(
  draft: InterviewImportFormDraft,
  context: InterviewImportSubmissionContext,
): CandidateDetailAppendPayload {
  const hiddenRoundEvaluationText = createHiddenRoundEvaluationText(draft, context);

  return {
    mode: "candidate_detail_append",
    candidateId: normalizeOptionalText(context.candidateId) ?? "",
    rawInput: buildRawInput(context, draft),
    systemContext: buildSystemContext(context),
    rounds: [
      {
        roundNumber: resolveRoundNumber(context),
        evaluationText: hiddenRoundEvaluationText,
      },
    ],
  };
}

export function buildInterviewImportPayload(
  draft: InterviewImportFormDraft,
  context: InterviewImportSubmissionContext,
): InterviewImportPayload {
  return buildCandidateDetailPayload(draft, context);
}

export function validateInterviewImportFormDraft(
  draft: InterviewImportFormDraft,
  context: Pick<InterviewImportSubmissionContext, "resumePdf">,
): InterviewImportValidationIssue[] {
  const issues: InterviewImportValidationIssue[] = [];

  if (!normalizeOptionalText(draft.meetingNotesText) && !context.resumePdf) {
    issues.push({
      field: "meetingNotesText",
      message: "请填写会议纪要或上传 PDF",
      severity: "error",
    });
  }

  if (!normalizeOptionalText(draft.meetingNotesText) && context.resumePdf) {
    issues.push({
      field: "meetingNotesText",
      message: "建议补充会议纪要，便于 AI 更准确识别历史轮次",
      severity: "warning",
    });
  }

  return issues;
}
