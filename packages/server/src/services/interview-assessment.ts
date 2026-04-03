import { and, eq } from "drizzle-orm";
import { db } from "../db";
import { candidates, interviewAssessments, interviews } from "../schema";

type InterviewAssessmentRow = typeof interviewAssessments.$inferSelect;
type InterviewAssessmentRecommendation = "pass" | "hold" | "reject";

type CreateInterviewAssessmentInput = {
  interviewId: string;
  interviewerId?: string;
  technicalScore: number;
  communicationScore: number;
  cultureFitScore: number;
  overallScore: number;
  technicalEvaluation: string;
  communicationEvaluation: string;
  cultureFitEvaluation: string;
  overallEvaluation: string;
  recommendation: InterviewAssessmentRecommendation;
};

type UpdateInterviewAssessmentInput = {
  interviewId?: string;
  interviewerId?: string;
  technicalScore?: number;
  communicationScore?: number;
  cultureFitScore?: number;
  overallScore?: number;
  technicalEvaluation?: string;
  communicationEvaluation?: string;
  cultureFitEvaluation?: string;
  overallEvaluation?: string;
  recommendation?: InterviewAssessmentRecommendation;
};

type InterviewAssessment = {
  id: string;
  candidateId: string;
  interviewId: string;
  interviewerId: string;
  technicalScore: number;
  communicationScore: number;
  cultureFitScore: number;
  overallScore: number;
  technicalEvaluation: string;
  communicationEvaluation: string;
  cultureFitEvaluation: string;
  overallEvaluation: string;
  recommendation: InterviewAssessmentRecommendation;
  reportMarkdown: string | null;
  createdAt: number;
  updatedAt: number;
};

const RECOMMENDATION_LABEL: Record<InterviewAssessmentRecommendation, string> = {
  pass: "通过",
  hold: "待定",
  reject: "拒绝",
};

export class InterviewAssessmentServiceError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = "InterviewAssessmentServiceError";
  }
}

function toTimestamp(value: number | Date): number {
  return typeof value === "number" ? value : value.getTime();
}

function toInterviewAssessment(row: InterviewAssessmentRow): InterviewAssessment {
  return {
    id: row.id,
    candidateId: row.candidateId,
    interviewId: row.interviewId,
    interviewerId: row.interviewerId,
    technicalScore: row.technicalScore,
    communicationScore: row.communicationScore,
    cultureFitScore: row.cultureFitScore,
    overallScore: row.overallScore,
    technicalEvaluation: row.technicalEvaluation,
    communicationEvaluation: row.communicationEvaluation,
    cultureFitEvaluation: row.cultureFitEvaluation,
    overallEvaluation: row.overallEvaluation,
    recommendation: row.recommendation as InterviewAssessmentRecommendation,
    reportMarkdown: row.reportMarkdown,
    createdAt: toTimestamp(row.createdAt),
    updatedAt: toTimestamp(row.updatedAt),
  };
}

function ensureScore(name: string, value: number | undefined): void {
  if (value === undefined) {
    return;
  }

  if (!Number.isInteger(value) || value < 1 || value > 10) {
    throw new InterviewAssessmentServiceError("VALIDATION_ERROR", `${name} 必须是 1-10 的整数`, 422);
  }
}

function ensureNonEmpty(name: string, value: string | undefined): void {
  if (value === undefined) {
    return;
  }

  if (!value.trim()) {
    throw new InterviewAssessmentServiceError("VALIDATION_ERROR", `${name} 不能为空`, 422);
  }
}

function validateCreateInput(input: CreateInterviewAssessmentInput): void {
  ensureNonEmpty("interviewId", input.interviewId);
  ensureScore("technicalScore", input.technicalScore);
  ensureScore("communicationScore", input.communicationScore);
  ensureScore("cultureFitScore", input.cultureFitScore);
  ensureScore("overallScore", input.overallScore);
  ensureNonEmpty("technicalEvaluation", input.technicalEvaluation);
  ensureNonEmpty("communicationEvaluation", input.communicationEvaluation);
  ensureNonEmpty("cultureFitEvaluation", input.cultureFitEvaluation);
  ensureNonEmpty("overallEvaluation", input.overallEvaluation);
}

function validateUpdateInput(input: UpdateInterviewAssessmentInput): void {
  if (Object.keys(input).length === 0) {
    throw new InterviewAssessmentServiceError("VALIDATION_ERROR", "至少提供一个更新字段", 422);
  }

  ensureNonEmpty("interviewId", input.interviewId);
  ensureNonEmpty("interviewerId", input.interviewerId);
  ensureScore("technicalScore", input.technicalScore);
  ensureScore("communicationScore", input.communicationScore);
  ensureScore("cultureFitScore", input.cultureFitScore);
  ensureScore("overallScore", input.overallScore);
  ensureNonEmpty("technicalEvaluation", input.technicalEvaluation);
  ensureNonEmpty("communicationEvaluation", input.communicationEvaluation);
  ensureNonEmpty("cultureFitEvaluation", input.cultureFitEvaluation);
  ensureNonEmpty("overallEvaluation", input.overallEvaluation);
}

async function ensureCandidateExists(candidateId: string): Promise<void> {
  const [candidate] = await db.select({ id: candidates.id }).from(candidates).where(eq(candidates.id, candidateId)).limit(1);

  if (!candidate) {
    throw new InterviewAssessmentServiceError("NOT_FOUND", "候选人不存在", 404);
  }
}

async function ensureInterviewBelongsToCandidate(candidateId: string, interviewId: string): Promise<void> {
  const [interview] = await db
    .select({ id: interviews.id })
    .from(interviews)
    .where(and(eq(interviews.id, interviewId), eq(interviews.candidateId, candidateId)))
    .limit(1);

  if (!interview) {
    throw new InterviewAssessmentServiceError("NOT_FOUND", "面试记录不存在或不属于当前候选人", 404);
  }
}

function buildReportMarkdown(assessment: InterviewAssessment): string {
  const averageScore = (
    (assessment.technicalScore + assessment.communicationScore + assessment.cultureFitScore + assessment.overallScore) /
    4
  ).toFixed(1);

  return [
    "# 面试评估报告",
    "",
    `- 候选人 ID：${assessment.candidateId}`,
    `- 面试 ID：${assessment.interviewId}`,
    `- 评估人 ID：${assessment.interviewerId}`,
    `- 综合建议：${RECOMMENDATION_LABEL[assessment.recommendation]}`,
    `- 平均分：${averageScore}`,
    "",
    "## 评分概览",
    "",
    `- 技术能力：${assessment.technicalScore}/10`,
    `- 沟通能力：${assessment.communicationScore}/10`,
    `- 文化匹配：${assessment.cultureFitScore}/10`,
    `- 综合评分：${assessment.overallScore}/10`,
    "",
    "## 分项评价",
    "",
    "### 技术能力",
    assessment.technicalEvaluation,
    "",
    "### 沟通能力",
    assessment.communicationEvaluation,
    "",
    "### 文化匹配",
    assessment.cultureFitEvaluation,
    "",
    "### 综合结论",
    assessment.overallEvaluation,
  ].join("\n");
}

export class InterviewAssessmentService {
  async listByCandidate(candidateId: string): Promise<InterviewAssessment[]> {
    await ensureCandidateExists(candidateId);

    const rows = await db
      .select()
      .from(interviewAssessments)
      .where(eq(interviewAssessments.candidateId, candidateId))
      .orderBy(interviewAssessments.createdAt);

    return rows.map(toInterviewAssessment);
  }

  async getById(candidateId: string, assessmentId: string): Promise<InterviewAssessment | null> {
    await ensureCandidateExists(candidateId);

    const [row] = await db
      .select()
      .from(interviewAssessments)
      .where(and(eq(interviewAssessments.id, assessmentId), eq(interviewAssessments.candidateId, candidateId)))
      .limit(1);

    return row ? toInterviewAssessment(row) : null;
  }

  async create(candidateId: string, input: CreateInterviewAssessmentInput): Promise<InterviewAssessment> {
    validateCreateInput(input);
    await ensureCandidateExists(candidateId);
    await ensureInterviewBelongsToCandidate(candidateId, input.interviewId.trim());

    const now = Date.now();

    const [row] = await db
      .insert(interviewAssessments)
      .values({
        id: `assessment_${crypto.randomUUID()}`,
        candidateId,
        interviewId: input.interviewId.trim(),
        interviewerId: input.interviewerId?.trim() || "system",
        technicalScore: input.technicalScore,
        communicationScore: input.communicationScore,
        cultureFitScore: input.cultureFitScore,
        overallScore: input.overallScore,
        technicalEvaluation: input.technicalEvaluation.trim(),
        communicationEvaluation: input.communicationEvaluation.trim(),
        cultureFitEvaluation: input.cultureFitEvaluation.trim(),
        overallEvaluation: input.overallEvaluation.trim(),
        recommendation: input.recommendation,
        reportMarkdown: null,
        createdAt: now,
        updatedAt: now,
      })
      .returning();

    return toInterviewAssessment(row);
  }

  async update(candidateId: string, assessmentId: string, input: UpdateInterviewAssessmentInput): Promise<InterviewAssessment | null> {
    validateUpdateInput(input);

    const existing = await this.getById(candidateId, assessmentId);
    if (!existing) {
      return null;
    }

    if (input.interviewId !== undefined) {
      await ensureInterviewBelongsToCandidate(candidateId, input.interviewId.trim());
    }

    const updatePayload: Partial<typeof interviewAssessments.$inferInsert> = {
      updatedAt: Date.now(),
    };

    if (input.interviewId !== undefined) updatePayload.interviewId = input.interviewId.trim();
    if (input.interviewerId !== undefined) updatePayload.interviewerId = input.interviewerId.trim();
    if (input.technicalScore !== undefined) updatePayload.technicalScore = input.technicalScore;
    if (input.communicationScore !== undefined) updatePayload.communicationScore = input.communicationScore;
    if (input.cultureFitScore !== undefined) updatePayload.cultureFitScore = input.cultureFitScore;
    if (input.overallScore !== undefined) updatePayload.overallScore = input.overallScore;
    if (input.technicalEvaluation !== undefined) updatePayload.technicalEvaluation = input.technicalEvaluation.trim();
    if (input.communicationEvaluation !== undefined) updatePayload.communicationEvaluation = input.communicationEvaluation.trim();
    if (input.cultureFitEvaluation !== undefined) updatePayload.cultureFitEvaluation = input.cultureFitEvaluation.trim();
    if (input.overallEvaluation !== undefined) updatePayload.overallEvaluation = input.overallEvaluation.trim();
    if (input.recommendation !== undefined) updatePayload.recommendation = input.recommendation;

    const [row] = await db
      .update(interviewAssessments)
      .set(updatePayload)
      .where(and(eq(interviewAssessments.id, assessmentId), eq(interviewAssessments.candidateId, candidateId)))
      .returning();

    return row ? toInterviewAssessment(row) : null;
  }

  async delete(candidateId: string, assessmentId: string): Promise<boolean> {
    const result = await db
      .delete(interviewAssessments)
      .where(and(eq(interviewAssessments.id, assessmentId), eq(interviewAssessments.candidateId, candidateId)))
      .returning({ id: interviewAssessments.id });

    return result.length > 0;
  }

  async generateReport(
    candidateId: string,
    assessmentId: string,
  ): Promise<{ assessment: InterviewAssessment; reportMarkdown: string; generatedAt: number }> {
    const assessment = await this.getById(candidateId, assessmentId);
    if (!assessment) {
      throw new InterviewAssessmentServiceError("NOT_FOUND", "面试评估不存在", 404);
    }

    const reportMarkdown = buildReportMarkdown(assessment);
    const generatedAt = Date.now();

    const [row] = await db
      .update(interviewAssessments)
      .set({ reportMarkdown, updatedAt: generatedAt })
      .where(and(eq(interviewAssessments.id, assessmentId), eq(interviewAssessments.candidateId, candidateId)))
      .returning();

    if (!row) {
      throw new InterviewAssessmentServiceError("NOT_FOUND", "面试评估不存在", 404);
    }

    return {
      assessment: toInterviewAssessment(row),
      reportMarkdown,
      generatedAt,
    };
  }
}

export const interviewAssessmentService = new InterviewAssessmentService();
