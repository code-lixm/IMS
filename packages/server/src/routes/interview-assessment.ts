import {
  interviewAssessmentService,
  InterviewAssessmentServiceError,
} from "../services/interview-assessment";
import { corsHeaders, fail, ok } from "../utils/http";

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
  recommendation: "pass" | "hold" | "reject";
};

type UpdateInterviewAssessmentInput = Partial<CreateInterviewAssessmentInput>;

function parseJson<T>(request: Request): Promise<T> {
  return request.json() as Promise<T>;
}

function toErrorResponse(error: unknown, fallbackMessage: string): Response {
  if (error instanceof InterviewAssessmentServiceError) {
    return fail(error.code, error.message, error.status);
  }

  console.error("[interview-assessment]", fallbackMessage, error);
  return fail("INTERNAL_ERROR", fallbackMessage, 500);
}

export async function interviewAssessmentRoute(request: Request): Promise<Response | null> {
  const url = new URL(request.url);
  const path = url.pathname;

  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders() });
  }

  const assessmentsMatch = path.match(/^\/api\/candidates\/([^/]+)\/assessments$/);
  if (assessmentsMatch) {
    const candidateId = assessmentsMatch[1];

    if (request.method === "GET") {
      try {
        const items = await interviewAssessmentService.listByCandidate(candidateId);
        return ok({ items });
      } catch (error) {
        return toErrorResponse(error, "获取面试评估列表失败");
      }
    }

    if (request.method === "POST") {
      try {
        const body = await parseJson<CreateInterviewAssessmentInput>(request);
        const assessment = await interviewAssessmentService.create(candidateId, body);
        return ok(assessment, { status: 201 });
      } catch (error) {
        return toErrorResponse(error, "创建面试评估失败");
      }
    }
  }

  const assessmentMatch = path.match(/^\/api\/candidates\/([^/]+)\/assessments\/([^/]+)$/);
  if (assessmentMatch) {
    const candidateId = assessmentMatch[1];
    const assessmentId = assessmentMatch[2];

    if (request.method === "GET") {
      try {
        const assessment = await interviewAssessmentService.getById(candidateId, assessmentId);
        if (!assessment) {
          return fail("NOT_FOUND", "面试评估不存在", 404);
        }
        return ok(assessment);
      } catch (error) {
        return toErrorResponse(error, "获取面试评估失败");
      }
    }

    if (request.method === "PUT") {
      try {
        const body = await parseJson<UpdateInterviewAssessmentInput>(request);
        const assessment = await interviewAssessmentService.update(candidateId, assessmentId, body);
        if (!assessment) {
          return fail("NOT_FOUND", "面试评估不存在", 404);
        }
        return ok(assessment);
      } catch (error) {
        return toErrorResponse(error, "更新面试评估失败");
      }
    }

    if (request.method === "DELETE") {
      try {
        const deleted = await interviewAssessmentService.delete(candidateId, assessmentId);
        if (!deleted) {
          return fail("NOT_FOUND", "面试评估不存在", 404);
        }
        return ok({ success: true, deletedId: assessmentId });
      } catch (error) {
        return toErrorResponse(error, "删除面试评估失败");
      }
    }
  }

  const reportMatch = path.match(/^\/api\/candidates\/([^/]+)\/assessments\/([^/]+)\/report$/);
  if (reportMatch && request.method === "POST") {
    const candidateId = reportMatch[1];
    const assessmentId = reportMatch[2];

    try {
      const result = await interviewAssessmentService.generateReport(candidateId, assessmentId);
      return ok(result, { status: 201 });
    } catch (error) {
      return toErrorResponse(error, "生成面试报告失败");
    }
  }

  return null;
}
