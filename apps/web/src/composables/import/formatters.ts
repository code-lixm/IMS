import type { ParsedResume } from "@ims/shared";

type ImportScreeningVerdict = "pass" | "review" | "reject";
type ImportScreeningStatus = "not_requested" | "running" | "completed";
type ImportScreeningSource = "ai" | "heuristic";

interface ImportScreeningConclusion {
  verdict: ImportScreeningVerdict;
  label: string;
  score: number;
  summary: string;
  strengths: string[];
  concerns: string[];
  recommendedAction: string;
}

interface ImportTaskResultData {
  parsedResume: ParsedResume;
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
    queued: "等待处理",
    extracting: "识别文件中",
    text_extracting: "提取 PDF 文本中",
    ocr_running: "OCR 识别中",
    parsing: "结构化解析中",
    matching_candidate: "匹配候选人中",
    saving: "保存候选人与简历中",
    ai_screening: "AI 初筛中",
    completed: "已完成",
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
  } catch {
    return null;
  }
}

export function screeningVerdictClass(verdict: ImportScreeningVerdict | undefined) {
  const map: Record<string, string> = {
    pass: "bg-green-100 text-green-700 border-green-200",
    review: "bg-amber-100 text-amber-700 border-amber-200",
    reject: "bg-red-100 text-red-700 border-red-200",
  };
  return map[verdict ?? ""] ?? "bg-muted text-muted-foreground border-border";
}

export function screeningSourceLabel(source: ImportScreeningSource | null | undefined) {
  if (source === "ai") return "AI Agent";
  if (source === "heuristic") return "规则回退";
  return "";
}

export function formatImportTimestamp(timestamp: number) {
  return new Date(timestamp).toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}
