import { api } from "./client";

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

type UpdateInterviewAssessmentInput = Partial<CreateInterviewAssessmentInput>;

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

type InterviewAssessmentListData = {
  items: InterviewAssessment[];
};

type InterviewAssessmentReportData = {
  assessment: InterviewAssessment;
  reportMarkdown: string;
  generatedAt: number;
};

export const interviewAssessmentApi = {
  list(candidateId: string): Promise<InterviewAssessmentListData> {
    return api<InterviewAssessmentListData>(`/api/candidates/${candidateId}/assessments`);
  },

  create(candidateId: string, input: CreateInterviewAssessmentInput): Promise<InterviewAssessment> {
    return api<InterviewAssessment>(`/api/candidates/${candidateId}/assessments`, {
      method: "POST",
      json: input,
    });
  },

  get(candidateId: string, assessmentId: string): Promise<InterviewAssessment> {
    return api<InterviewAssessment>(`/api/candidates/${candidateId}/assessments/${assessmentId}`);
  },

  update(
    candidateId: string,
    assessmentId: string,
    input: UpdateInterviewAssessmentInput,
  ): Promise<InterviewAssessment> {
    return api<InterviewAssessment>(`/api/candidates/${candidateId}/assessments/${assessmentId}`, {
      method: "PUT",
      json: input,
    });
  },

  remove(candidateId: string, assessmentId: string): Promise<{ success: boolean; deletedId: string }> {
    return api<{ success: boolean; deletedId: string }>(`/api/candidates/${candidateId}/assessments/${assessmentId}`, {
      method: "DELETE",
    });
  },

  generateReport(candidateId: string, assessmentId: string): Promise<InterviewAssessmentReportData> {
    return api<InterviewAssessmentReportData>(`/api/candidates/${candidateId}/assessments/${assessmentId}/report`, {
      method: "POST",
      json: {},
    });
  },
};
