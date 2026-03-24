import type {
  CandidateInterviewState,
  CandidatePipelineStage,
  CandidateResumeStatus,
} from "@ims/shared";

type BadgeVariant = "default" | "secondary" | "destructive" | "outline";

type PipelineStageClass = string;

const resumeStatusLabels: Record<CandidateResumeStatus, string> = {
  missing: "未上传简历",
  uploaded: "已上传",
  parsed: "已解析",
  failed: "解析失败",
};

const resumeStatusVariants: Record<CandidateResumeStatus, BadgeVariant> = {
  missing: "outline",
  uploaded: "secondary",
  parsed: "default",
  failed: "destructive",
};

const pipelineStageLabels: Record<CandidatePipelineStage, string> = {
  new: "新候选人",
  screening: "筛选中",
  interview: "面试中",
  offer: "Offer",
  rejected: "已淘汰",
};

const pipelineStageVariants: Record<CandidatePipelineStage, BadgeVariant> = {
  new: "outline",
  screening: "secondary",
  interview: "secondary",
  offer: "default",
  rejected: "destructive",
};

const interviewStateLabels: Record<CandidateInterviewState, string> = {
  none: "未安排",
  scheduled: "已安排",
  completed: "已完成",
  cancelled: "已取消",
};

const interviewStateVariants: Record<CandidateInterviewState, BadgeVariant> = {
  none: "outline",
  scheduled: "secondary",
  completed: "default",
  cancelled: "destructive",
};

export function resumeStatusLabel(status: CandidateResumeStatus) {
  return resumeStatusLabels[status];
}

export function resumeStatusVariant(status: CandidateResumeStatus) {
  return resumeStatusVariants[status];
}

export function pipelineStageLabel(stage: CandidatePipelineStage) {
  return pipelineStageLabels[stage];
}

export function pipelineStageVariant(stage: CandidatePipelineStage) {
  return pipelineStageVariants[stage];
}

export function pipelineStageClass(stage: CandidatePipelineStage): PipelineStageClass {
  const map: Record<CandidatePipelineStage, PipelineStageClass> = {
    new: "border-slate-200 bg-slate-50 text-slate-700",
    screening: "border-amber-200 bg-amber-50 text-amber-700",
    interview: "border-sky-200 bg-sky-50 text-sky-700",
    offer: "border-emerald-200 bg-emerald-50 text-emerald-700",
    rejected: "border-rose-200 bg-rose-50 text-rose-700",
  };

  return map[stage];
}

export function interviewStateLabel(state: CandidateInterviewState) {
  return interviewStateLabels[state];
}

export function interviewStateVariant(state: CandidateInterviewState) {
  return interviewStateVariants[state];
}

export function formatCandidateActivityTime(timestamp: number | null | undefined) {
  if (!timestamp) {
    return "暂无活动";
  }

  return new Date(timestamp).toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}
