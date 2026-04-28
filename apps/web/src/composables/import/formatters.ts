import type { ImportBatch, ParsedResume, ScreeningTemplateInfo, ScreeningTemplateRenderedInfo, UniversityVerificationResult } from "@ims/shared";

type ImportScreeningVerdict = "pass" | "review" | "reject";
type ImportScreeningStatus = "not_requested" | "queued" | "running" | "completed" | "failed";
type ImportScreeningSource = "ai" | "heuristic" | "failed";

interface ImportScreeningConclusion {
  verdict: ImportScreeningVerdict;
  label: string;
  score: number;
  candidateName?: string | null;
  candidatePosition?: string | null;
  candidateYearsOfExperience?: number | null;
  screeningBaseUrl?: string | null;
  summary: string;
  strengths: string[];
  concerns: string[];
  recommendedAction: string;
  wechatConclusion?: string;
  wechatReason?: string;
  wechatAction?: string;
  wechatCopyText: string;
  templateInfo?: ScreeningTemplateInfo & ScreeningTemplateRenderedInfo;
  universityVerification?: UniversityVerificationResult;
}

interface ImportTaskResultData {
  parsedResume: ParsedResume;
  extractionConfidence?: number | null;
  screeningStatus?: ImportScreeningStatus;
  screeningSource?: ImportScreeningSource | null;
  screeningError?: string | null;
  screeningConclusion?: ImportScreeningConclusion | null;
}

export function statusVariant(status: string) {
  const map: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
    completed: "default",
    partial_success: "secondary",
    processing: "secondary",
    failed: "destructive",
    queued: "outline",
    cancelled: "outline",
  };
  return map[status] ?? "outline";
}

export function statusLabel(status: string) {
  const map: Record<string, string> = {
    completed: "已完成",
    failed: "失败",
    processing: "处理中",
    partial_success: "部分成功",
    queued: "排队中",
    cancelled: "已取消",
  };
  return map[status] ?? status;
}

export function progressIndicatorClass(status: string) {
  const map: Record<string, string> = {
    completed: "[&::-webkit-progress-value]:bg-green-600 [&::-moz-progress-bar]:bg-green-600",
    partial_success: "[&::-webkit-progress-value]:bg-amber-500 [&::-moz-progress-bar]:bg-amber-500",
    processing: "[&::-webkit-progress-value]:bg-primary [&::-moz-progress-bar]:bg-primary",
    failed: "[&::-webkit-progress-value]:bg-destructive [&::-moz-progress-bar]:bg-destructive",
    queued: "[&::-webkit-progress-value]:bg-muted-foreground [&::-moz-progress-bar]:bg-muted-foreground",
    cancelled: "[&::-webkit-progress-value]:bg-muted-foreground [&::-moz-progress-bar]:bg-muted-foreground",
  };
  return map[status] ?? map.processing;
}

export function fileStatusVariant(status: string) {
  const map: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
    done: "default",
    completed: "default",
    failed: "destructive",
    processing: "secondary",
    extracting: "secondary",
    text_extracting: "secondary",
    ocr_running: "secondary",
    parsing: "secondary",
    matching_candidate: "secondary",
    saving: "secondary",
    ai_screening: "secondary",
    queued: "outline",
    cancelled: "outline",
    skipped: "outline",
  };
  return map[status] ?? "outline";
}

export function fileStatusLabel(status: string) {
  const map: Record<string, string> = {
    done: "成功",
    completed: "成功",
    failed: "失败",
    processing: "处理中",
    extracting: "提取中",
    text_extracting: "提取文本",
    ocr_running: "OCR 中",
    parsing: "解析中",
    matching_candidate: "匹配候选人",
    saving: "保存中",
    ai_screening: "AI 初筛中",
    queued: "排队",
    cancelled: "取消",
    skipped: "跳过",
  };
  return map[status] ?? status;
}

export function importStageLabel(stage: string | null | undefined) {
  const map: Record<string, string> = {
    processing: "处理中",
    queued: "等待处理",
    extracting: "识别文件中",
    text_extracting: "提取 PDF 文本中",
    ocr_running: "OCR 识别中",
    parsing: "结构化解析中",
    matching_candidate: "匹配候选人中",
    saving: "保存候选人与简历中",
    ai_screening: "AI 初筛中",
    completed: "已完成",
    failed: "失败",
    partial_success: "部分成功",
    cancelled: "已取消",
  };
  return stage ? (map[stage] ?? stage) : "处理中";
}

export function parseImportTaskResult(resultJson: string | null): ImportTaskResultData | null {
  if (!resultJson) {
    return null;
  }

  try {
    return JSON.parse(resultJson) as ImportTaskResultData;
  } catch (_error) {
    return null;
  }
}

export function screeningVerdictClass(verdict: ImportScreeningVerdict | undefined) {
  const map: Record<string, string> = {
    pass: "bg-green-100 text-green-700 border-green-200 dark:bg-green-900/30 dark:text-green-300 dark:border-green-800",
    review: "bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-900/30 dark:text-amber-300 dark:border-amber-800",
    reject: "bg-red-100 text-red-700 border-red-200 dark:bg-red-900/30 dark:text-red-300 dark:border-red-800",
  };
  return map[verdict ?? ""] ?? "bg-muted text-muted-foreground border-border";
}

export function screeningScoreClass(score: number | undefined): string {
  if (score === undefined || score === null) {
    return "bg-muted text-muted-foreground border-border";
  }

  // < 60: 不及格 - 红色
  if (score < 60) {
    return "bg-red-100 text-red-700 border-red-200 dark:bg-red-900/30 dark:text-red-300 dark:border-red-800";
  }

  // 60-69: 及格 - 橙色
  if (score < 70) {
    return "bg-orange-100 text-orange-700 border-orange-200 dark:bg-orange-900/30 dark:text-orange-300 dark:border-orange-800";
  }

  // 70-84: 良好 - 蓝色
  if (score < 85) {
    return "bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-900/30 dark:text-blue-300 dark:border-blue-800";
  }

  // 85-100: 优秀 - 绿色
  return "bg-green-100 text-green-700 border-green-200 dark:bg-green-900/30 dark:text-green-300 dark:border-green-800";
}

export function screeningSourceLabel(source: ImportScreeningSource | null | undefined) {
  if (source === "ai") return "AI Agent";
  if (source === "heuristic") return "规则回退";
  if (source === "failed") return "AI 初筛失败";
  return "";
}


export function screeningUniversityTags(result: UniversityVerificationResult | null | undefined): string[] {
  if (!result) return [];
  const tags: string[] = [];
  if (result.is985) tags.push("985");
  if (result.is211) tags.push("211");
  if (result.isDoubleFirstClass) tags.push("双一流");
  return tags;
}

export function screeningUniversityVerdictBadgeProps(
  verdict: "verified" | "not_found" | "api_failed" | null | undefined,
): { label: string; variant: "default" | "secondary" | "destructive" | "outline"; class?: string } | null {
  if (verdict === "verified") {
    return {
      label: "学历已认证",
      variant: "outline",
      class: "bg-green-100 text-green-700 border-green-200 dark:bg-green-900/30 dark:text-green-300 dark:border-green-800",
    };
  }
  if (verdict === "not_found") {
    return { label: "认证失败", variant: "destructive" };
  }
  if (verdict === "api_failed") {
    return {
      label: "暂未识别（服务异常）",
      variant: "outline",
      class: "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-900/20 dark:text-amber-300 dark:border-amber-800",
    };
  }
  return null;
}

export function screeningUniversityVerdictLabel(verdict: "verified" | "not_found" | "api_failed" | null | undefined): string {
  return screeningUniversityVerdictBadgeProps(verdict)?.label ?? "";
}

export function screeningTemplateLabel(info: ScreeningTemplateInfo | null | undefined): string {
  if (!info) return "系统默认";
  return `${info.templateName} v${info.templateVersion}`;
}


export function formatImportTimestamp(timestamp: number) {
  return new Date(timestamp).toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatImportBatchTimeLabel(timestamp: number) {
  const now = new Date();
  const date = new Date(timestamp);
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const startOfTarget = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  const diffDays = Math.round((startOfToday - startOfTarget) / 86400000);
  const period = date.getHours() < 12 ? "上午" : "下午";

  if (diffDays === 0) return `今天${period}`;
  if (diffDays === 1) return `昨天${period}`;
  if (diffDays === 2) return `前天${period}`;
  return `${String(date.getMonth() + 1).padStart(2, "0")}月${String(date.getDate()).padStart(2, "0")}日${period}`;
}

export function formatImportBatchDisplayName(batch: Pick<ImportBatch, "displayName" | "createdAt" | "totalFiles" | "id">) {
  if (batch.displayName?.trim()) {
    return batch.displayName;
  }

  return `${formatImportBatchTimeLabel(batch.createdAt)}-${batch.totalFiles}个-【批次${batch.id.slice(-8)}】`;
}
