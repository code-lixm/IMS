export type InterviewStatus = "published" | "pending" | "draft" | "closed" | "duplicate";

export interface InterviewRecord {
  id: string;
  title: string;
  stage: string;
  candidateCount: number;
  channel: string;
  meta: string;
  status: InterviewStatus;
  interviewer: string;
  scheduledAt: string;
  updatedAt: string;
  group: "today" | "week";
}

export interface InterviewStatusFilter {
  value: "all" | InterviewStatus;
  label: string;
  count: number;
}
