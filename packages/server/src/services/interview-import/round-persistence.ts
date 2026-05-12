import { inferRoundNumbers, type InterviewImportAIRoundDraft, type InterviewImportRoundInput } from "@ims/shared";
import { interviewAssessments, interviews } from "../../schema";

export type InterviewRoundPersistenceAssessmentInsert = typeof interviewAssessments.$inferInsert;
export type InterviewRoundPersistenceInterviewInsert = typeof interviews.$inferInsert;
export type InterviewAssessmentRecommendation = "pass" | "hold" | "reject";

export const DEFAULT_INTERVIEW_ASSESSMENT_SCORE = 80;

const PASS_RESULT_MATCHERS = [/通过/, /pass/i, /录用/, /进入下一轮/, /推荐/];
const HOLD_RESULT_MATCHERS = [/待定/, /hold/i, /pending/i, /观察/, /后续通知/, /考虑/];
const REJECT_RESULT_MATCHERS = [/不通过/, /未通过/, /reject/i, /fail/i, /淘汰/, /拒绝/];

const INTERVIEW_TYPE_CODE_MAP: Record<string, number> = {
  电话: 0,
  电话面试: 0,
  phone: 0,
  onsite: 1,
  on_site: 1,
  现场: 1,
  现场面试: 1,
  video: 2,
  视频: 2,
  视频面试: 2,
};

type ExistingInterviewRoundRef = Pick<typeof interviews.$inferSelect, "id" | "round">;

export interface NormalizedInterviewImportRound {
  inputIndex: number;
  roundNumber: number;
  roundName: string | null;
  interviewDate: string | null;
  scheduledAt: number | null;
  interviewerNames: string[];
  interviewerIdentity: string;
  interviewType: string | null;
  interviewTypeCode: number | null;
  evaluationText: string;
  resultLabel: string | null;
  recommendation: InterviewAssessmentRecommendation;
  interviewResult: number | null;
  confidence?: number | null;
  reason?: string | null;
  auditSnapshot?: InterviewImportAIRoundDraft["auditSnapshot"] | null;
}

export interface InterviewRoundAppendedResult {
  status: "appended";
  code: "appended_round";
  inputIndex: number;
  roundNumber: number;
  roundName: string | null;
  interviewId: string;
  assessmentId: string | null;
}

export interface InterviewRoundSkippedResult {
  status: "skipped";
  code: "skipped_duplicate_round";
  inputIndex: number;
  roundNumber: number;
  roundName: string | null;
  existingInterviewId: string | null;
}

export interface InterviewRoundFailedResult {
  status: "failed";
  code: string;
  inputIndex: number;
  roundNumber: number;
  roundName: string | null;
  reason: string;
}

export interface InterviewRoundPersistenceSummary {
  appendedRounds: InterviewRoundAppendedResult[];
  skippedRounds: InterviewRoundSkippedResult[];
  failedRounds: InterviewRoundFailedResult[];
}

export interface PrepareInterviewRoundPersistenceInput {
  candidateId: string;
  rounds: InterviewImportRoundInput[];
  existingInterviews: ExistingInterviewRoundRef[];
  now?: number;
  startFrom?: number;
}

export interface PrepareInterviewRoundPersistenceResult {
  startFrom: number;
  normalizedRounds: NormalizedInterviewImportRound[];
  interviewCreates: InterviewRoundPersistenceInterviewInsert[];
  assessmentCreates: InterviewRoundPersistenceAssessmentInsert[];
  summary: InterviewRoundPersistenceSummary;
}

function normalizeOptionalText(value: string | null | undefined): string | null {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

function normalizeInterviewerNames(names: string[] | null | undefined): string[] {
  const seen = new Set<string>();
  const normalized: string[] = [];

  for (const name of names ?? []) {
    const trimmed = name.trim();
    if (!trimmed || seen.has(trimmed)) {
      continue;
    }

    seen.add(trimmed);
    normalized.push(trimmed);
  }

  return normalized;
}

function parseInterviewDate(value: string | null): number | null {
  if (!value) {
    return null;
  }

  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : null;
}

function resolveRoundStartFrom(existingInterviews: ExistingInterviewRoundRef[], startFrom?: number): number {
  if (typeof startFrom === "number" && Number.isInteger(startFrom) && startFrom > 0) {
    return startFrom;
  }

  const maxExistingRound = existingInterviews.reduce((max, interview) => {
    return Number.isInteger(interview.round) && interview.round > max ? interview.round : max;
  }, 0);

  return maxExistingRound + 1;
}

function mapInterviewTypeCode(interviewType: string | null): number | null {
  if (!interviewType) {
    return null;
  }

  return INTERVIEW_TYPE_CODE_MAP[interviewType.toLowerCase()] ?? INTERVIEW_TYPE_CODE_MAP[interviewType] ?? null;
}

export function mapResultLabelToRecommendation(resultLabel: string | null | undefined): InterviewAssessmentRecommendation {
  const normalized = normalizeOptionalText(resultLabel);
  if (!normalized) {
    return "hold";
  }

  if (REJECT_RESULT_MATCHERS.some((matcher) => matcher.test(normalized))) {
    return "reject";
  }

  if (PASS_RESULT_MATCHERS.some((matcher) => matcher.test(normalized))) {
    return "pass";
  }

  if (HOLD_RESULT_MATCHERS.some((matcher) => matcher.test(normalized))) {
    return "hold";
  }

  return "hold";
}

function mapRecommendationToInterviewResult(recommendation: InterviewAssessmentRecommendation): number | null {
  switch (recommendation) {
    case "pass":
      return 1;
    case "reject":
      return -1;
    default:
      return null;
  }
}

export function normalizeInterviewImportRounds(
  rounds: InterviewImportRoundInput[],
  options: { existingInterviews?: ExistingInterviewRoundRef[]; startFrom?: number } = {},
): { startFrom: number; rounds: NormalizedInterviewImportRound[] } {
  const startFrom = resolveRoundStartFrom(options.existingInterviews ?? [], options.startFrom);

  return {
    startFrom,
    rounds: inferRoundNumbers(rounds, startFrom).map((round, inputIndex) => {
      const draftRound = round as unknown as InterviewImportRoundInput & Partial<Pick<InterviewImportAIRoundDraft, "confidence" | "reason" | "auditSnapshot">>;
      const draftConfidence = (draftRound as { confidence?: number | null }).confidence;
      const draftReason = (draftRound as { reason?: string | null }).reason;
      const draftAuditSnapshot = (draftRound as { auditSnapshot?: InterviewImportAIRoundDraft["auditSnapshot"] | null }).auditSnapshot;
      const roundName = normalizeOptionalText(round.roundName);
      const interviewDate = normalizeOptionalText(round.interviewDate);
      const interviewerNames = normalizeInterviewerNames(round.interviewerNames);
      const interviewType = normalizeOptionalText(round.interviewType);
      const evaluationText = round.evaluationText.trim();
      const resultLabel = normalizeOptionalText(round.resultLabel);
      const recommendation = mapResultLabelToRecommendation(resultLabel);

      return {
        inputIndex,
        roundNumber: round.resolvedRoundNumber,
        roundName,
        interviewDate,
        scheduledAt: parseInterviewDate(interviewDate),
        interviewerNames,
        interviewerIdentity: interviewerNames.join(" / ") || "system",
        interviewType,
        interviewTypeCode: mapInterviewTypeCode(interviewType),
        evaluationText,
        resultLabel,
        recommendation,
        interviewResult: mapRecommendationToInterviewResult(recommendation),
        confidence: typeof draftConfidence === "number" && Number.isFinite(draftConfidence) ? draftConfidence : null,
        reason: normalizeOptionalText(draftReason),
        auditSnapshot: draftAuditSnapshot ?? null,
      } satisfies NormalizedInterviewImportRound;
    }),
  };
}

function buildInterviewInsert(
  candidateId: string,
  round: NormalizedInterviewImportRound,
  now: number,
): InterviewRoundPersistenceInterviewInsert {
  return {
    id: `intv_${crypto.randomUUID()}`,
    candidateId,
    remoteId: null,
    round: round.roundNumber,
    status: "completed",
    statusRaw: null,
    interviewType: round.interviewTypeCode,
    interviewResult: round.interviewResult,
    interviewResultString: round.resultLabel,
    scheduledAt: round.scheduledAt,
    interviewPlace: null,
    meetingLink: null,
    dockingHrName: null,
    dockingHrbpName: null,
    checkInTime: null,
    arrivalDate: null,
    eliminateReasonString: null,
    remark: null,
    interviewerIdsJson: JSON.stringify(round.interviewerNames),
    manualEvaluationJson: JSON.stringify({
      source: "interview-import-ai-draft",
      confidence: round.confidence,
      reason: round.reason,
      auditSnapshot: round.auditSnapshot,
    }),
    createdAt: now,
    updatedAt: now,
  };
}

function buildAssessmentInsert(
  candidateId: string,
  interviewId: string,
  round: NormalizedInterviewImportRound,
  now: number,
): InterviewRoundPersistenceAssessmentInsert {
  return {
    id: `assessment_${crypto.randomUUID()}`,
    candidateId,
    interviewId,
    interviewerId: round.interviewerIdentity,
    technicalScore: DEFAULT_INTERVIEW_ASSESSMENT_SCORE,
    communicationScore: DEFAULT_INTERVIEW_ASSESSMENT_SCORE,
    cultureFitScore: DEFAULT_INTERVIEW_ASSESSMENT_SCORE,
    overallScore: DEFAULT_INTERVIEW_ASSESSMENT_SCORE,
    technicalEvaluation: round.evaluationText,
    communicationEvaluation: round.evaluationText,
    cultureFitEvaluation: round.evaluationText,
    overallEvaluation: round.evaluationText,
    recommendation: round.recommendation,
    reportMarkdown: null,
    createdAt: now,
    updatedAt: now,
  };
}

export function prepareInterviewRoundPersistence(
  input: PrepareInterviewRoundPersistenceInput,
): PrepareInterviewRoundPersistenceResult {
  const now = input.now ?? Date.now();
  const { startFrom, rounds } = normalizeInterviewImportRounds(input.rounds, {
    existingInterviews: input.existingInterviews,
    startFrom: input.startFrom,
  });

  const takenRounds = new Map<number, string | null>();
  for (const interview of input.existingInterviews) {
    takenRounds.set(interview.round, interview.id);
  }

  const summary: InterviewRoundPersistenceSummary = {
    appendedRounds: [],
    skippedRounds: [],
    failedRounds: [],
  };

  const interviewCreates: InterviewRoundPersistenceInterviewInsert[] = [];
  const assessmentCreates: InterviewRoundPersistenceAssessmentInsert[] = [];

  for (const round of rounds) {
    const existingInterviewId = takenRounds.get(round.roundNumber) ?? null;
    if (takenRounds.has(round.roundNumber)) {
      summary.skippedRounds.push({
        status: "skipped",
        code: "skipped_duplicate_round",
        inputIndex: round.inputIndex,
        roundNumber: round.roundNumber,
        roundName: round.roundName,
        existingInterviewId,
      });
      continue;
    }

    const interviewInsert = buildInterviewInsert(input.candidateId, round, now);
    interviewCreates.push(interviewInsert);
    takenRounds.set(round.roundNumber, interviewInsert.id);

    const assessmentInsert = round.evaluationText
      ? buildAssessmentInsert(input.candidateId, interviewInsert.id, round, now)
      : null;

    if (assessmentInsert) {
      assessmentCreates.push(assessmentInsert);
    }

    summary.appendedRounds.push({
      status: "appended",
      code: "appended_round",
      inputIndex: round.inputIndex,
      roundNumber: round.roundNumber,
      roundName: round.roundName,
      interviewId: interviewInsert.id,
      assessmentId: assessmentInsert?.id ?? null,
    });
  }

  return {
    startFrom,
    normalizedRounds: rounds,
    interviewCreates,
    assessmentCreates,
    summary,
  };
}
