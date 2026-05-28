import type {
  InterviewImportBatchSummary,
  InterviewImportWorkflowAdvanceResult,
} from "@ims/shared";

export const INTERVIEW_IMPORT_SOURCE_TYPE = "interview_data";

const INTERVIEW_IMPORT_STAGE_LABELS: Record<string, string> = {
  queued: "排队中",
  preparing: "准备中",
  extracting_resume: "提取简历中",
  parsing_payload: "解析导入内容",
  resolving_candidate: "识别候选人中",
  appending_rounds: "追加轮次中",
  ai_advancing_stage: "推进 Workflow 中",
  processing: "处理中",
  partial_success: "部分成功",
  completed: "已完成",
  failed: "失败",
  cancelled: "已取消",
};

export interface InterviewImportStatusInput {
  status?: string | null;
  currentStage?: string | null;
  summary?: InterviewImportBatchSummary | null;
}

export interface InterviewImportOverviewItem {
  label: string;
  value: string;
  hint: string;
}

export interface InterviewImportCandidateState {
  label: string;
  hint: string;
}

export function isInterviewImportSourceType(sourceType: string | null | undefined): boolean {
  return sourceType === INTERVIEW_IMPORT_SOURCE_TYPE;
}

export function interviewImportSourceTypeLabel(sourceType: string | null | undefined): string {
  return isInterviewImportSourceType(sourceType) ? "面试数据导入" : "简历导入";
}

export function interviewImportStageLabel(stage: string | null | undefined): string {
  if (!stage) {
    return INTERVIEW_IMPORT_STAGE_LABELS.processing;
  }

  return INTERVIEW_IMPORT_STAGE_LABELS[stage] ?? stage;
}

export function parseInterviewImportBatchSummary(
  summaryJson: string | null | undefined,
): InterviewImportBatchSummary | null {
  if (!summaryJson?.trim()) {
    return null;
  }

  try {
    const parsed = JSON.parse(summaryJson) as InterviewImportBatchSummary;
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

export function parseInterviewImportTaskSummary(
  resultJson: string | null | undefined,
): InterviewImportBatchSummary | null {
  if (!resultJson?.trim()) {
    return null;
  }

  try {
    const parsed = JSON.parse(resultJson) as { summary?: InterviewImportBatchSummary | null };
    return parsed.summary ?? null;
  } catch {
    return null;
  }
}

export function resolveInterviewImportBatchSummary(input: {
  summary?: InterviewImportBatchSummary | null;
  summaryJson?: string | null;
  resultJson?: string | null;
}): InterviewImportBatchSummary | null {
  return input.summary
    ?? parseInterviewImportBatchSummary(input.summaryJson)
    ?? parseInterviewImportTaskSummary(input.resultJson);
}

export function interviewImportStatusLabel(input: InterviewImportStatusInput): string {
  const stage = input.status === "processing"
    ? (input.currentStage ?? input.status)
    : (input.status ?? input.currentStage);
  return interviewImportStageLabel(stage);
}

export function interviewImportCandidateState(
  summary: InterviewImportBatchSummary | null | undefined,
): InterviewImportCandidateState {
  if (!summary?.candidateId) {
    return {
      label: "待生成",
      hint: "等待批次处理结果",
    };
  }

  if (summary.createdCandidate) {
    return {
      label: "已创建",
      hint: `ID：${summary.candidateId}`,
    };
  }

  return {
    label: "已绑定",
    hint: `ID：${summary.candidateId}`,
  };
}

export function interviewImportWorkflowLabel(
  workflowAdvance: InterviewImportWorkflowAdvanceResult | null | undefined,
): string {
  if (!workflowAdvance) {
    return "未推进";
  }

  if (workflowAdvance.advanced) {
    return `${workflowAdvance.fromStage} → ${workflowAdvance.toStage}`;
  }

  return `保持 ${workflowAdvance.toStage}`;
}

export function interviewImportWorkflowDescription(
  workflowAdvance: InterviewImportWorkflowAdvanceResult | null | undefined,
): string {
  if (!workflowAdvance) {
    return "当前批次没有触发 workflow 推进。";
  }

  const roundSuffix = workflowAdvance.maxAdvancedRound === null
    ? ""
    : ` · 最高推进到第 ${workflowAdvance.maxAdvancedRound} 轮`;

  if (workflowAdvance.advanced) {
    return `已从 ${workflowAdvance.fromStage} 推进到 ${workflowAdvance.toStage}${roundSuffix}`;
  }

  return `当前保持在 ${workflowAdvance.toStage}${roundSuffix}`;
}

export function buildInterviewImportOverviewItems(
  summary: InterviewImportBatchSummary | null | undefined,
): InterviewImportOverviewItem[] {
  const candidate = interviewImportCandidateState(summary);
  const totalRounds =
    (summary?.appendedRounds ?? 0)
    + (summary?.skippedRounds ?? 0)
    + (summary?.failedRounds ?? 0);

  return [
    {
      label: "候选人",
      value: candidate.label,
      hint: candidate.hint,
    },
    {
      label: "总轮次",
      value: String(totalRounds),
      hint: `新增 ${summary?.appendedRounds ?? 0} / 跳过 ${summary?.skippedRounds ?? 0}`,
    },
    {
      label: "失败",
      value: String(summary?.failedRounds ?? 0),
      hint: (summary?.failedRounds ?? 0) > 0 ? "需复核失败原因" : "暂无失败轮次",
    },
    {
      label: "Workflow",
      value: interviewImportWorkflowLabel(summary?.workflowAdvance),
      hint: interviewImportWorkflowDescription(summary?.workflowAdvance),
    },
  ];
}

export function interviewImportStatusDescription(input: InterviewImportStatusInput): string {
  const summary = input.summary;
  const stage = input.status === "processing"
    ? (input.currentStage ?? input.status)
    : (input.status ?? input.currentStage);

  if (input.status === "completed") {
    return `候选人与轮次已写入完成，共新增 ${summary?.appendedRounds ?? 0} 轮。`;
  }

  if (input.status === "partial_success") {
    const parts: string[] = [];
    if ((summary?.appendedRounds ?? 0) > 0) {
      parts.push(`已写入 ${summary?.appendedRounds ?? 0} 轮`);
    }
    if ((summary?.failedRounds ?? 0) > 0) {
      parts.push(`${summary?.failedRounds ?? 0} 轮失败`);
    }
    if ((summary?.errors?.length ?? 0) > 0) {
      parts.push(`有 ${summary?.errors.length ?? 0} 条处理提示`);
    }
    return parts.length > 0
      ? `${parts.join("，")}。`
      : "部分结果已写入，请检查处理提示。";
  }

  if (input.status === "failed") {
    if ((summary?.failedRounds ?? 0) > 0) {
      return `本次导入失败，共 ${summary?.failedRounds ?? 0} 轮未能写入。`;
    }

    return "本次导入未生成可落库结果，请检查错误后重试。";
  }

  if (input.status === "cancelled") {
    return "批次已取消，未继续处理后续内容。";
  }

  switch (stage) {
    case "queued":
      return "任务已创建，等待服务器开始处理。";
    case "preparing":
      return "正在准备导入任务。";
    case "extracting_resume":
      return "正在解析随批次上传的 PDF 简历。";
    case "parsing_payload":
      return "正在整理候选人与轮次输入。";
    case "resolving_candidate":
      return "正在创建或绑定候选人。";
    case "appending_rounds":
      return "正在按 append-only 规则写入面试轮次。";
    case "ai_advancing_stage":
      return "正在尝试推进候选人的 workflow 阶段。";
    default:
      return "服务器正在处理这批面试导入。";
  }
}
