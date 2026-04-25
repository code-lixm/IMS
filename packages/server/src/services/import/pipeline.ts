import { readFileSync, copyFileSync, existsSync, mkdirSync, unlinkSync, writeFileSync, chmodSync } from "node:fs";
import { join, basename, extname } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import JSZip from "jszip";
import { path7za } from "7zip-bin";
import { db } from "../../db";
import { artifacts, candidateWorkspaces, candidates, importBatches, importFileTasks, interviews, resumes } from "../../schema";
import { and, desc, eq, inArray } from "drizzle-orm";
import { classifyFileType, ImportErrorCodes, type FileType } from "./types";
import { extractText } from "./extractor";
import { parseResumeText } from "./parser";
import { generateImportScreeningConclusionWithAI } from "./ai-screening";
import { verifyCandidateSchools } from "../university-verification";
import { config } from "../../config";
import { ErrorCodes, type ImportScreeningConclusion, type ImportScreeningExportMode, type ImportScreeningExportRequest, type ImportTaskResultData, type UniversityVerificationResult } from "@ims/shared";

type ImportTaskResultWithConfidence = Omit<ImportTaskResultData, "universityVerification"> & {
  extractionConfidence?: number | null;
  universityVerification?: ImportTaskResultData["universityVerification"] | null;
};

type ImportScreeningConclusionWithMetadata = ImportScreeningConclusion & {
  candidateName?: string | null;
  candidatePosition?: string | null;
  candidateYearsOfExperience?: number | null;
  screeningBaseUrl?: string | null;
};

const MAX_FILE_SIZE_BYTES = 50 * 1024 * 1024;
const ACTIVE_TASK_STATUSES = ["queued", "extracting", "text_extracting", "ocr_running", "parsing", "matching_candidate", "saving", "ai_screening"] as const;
const TERMINAL_TASK_STATUSES = ["done", "failed", "skipped"] as const;
const STAGE_PRIORITY = ["queued", "extracting", "text_extracting", "ocr_running", "parsing", "matching_candidate", "saving", "ai_screening"] as const;
const ZIP_IGNORED_ENTRY_NAMES = [".ds_store", "thumbs.db"];
const ZIP_IGNORED_ENTRY_PREFIXES = ["__macosx/"];
const SUPPORTED_ARCHIVE_SUFFIXES = [".zip", ".rar", ".tar", ".7z", ".tgz", ".tar.gz", ".tar.bz2", ".tbz2", ".tar.xz", ".txz"];
const execFileAsync = promisify(execFile);
const ARCHIVE_BIN_PATH = path7za;
const UNIVERSITY_NOT_FOUND_CONCERN = "学校信息异常：未在教育部高校库中查到，建议人工核实";
const UNIVERSITY_API_UNAVAILABLE_ERROR = "大学库查询暂不可用";
const UNIVERSITY_REVIEW_WARNING = "学校信息异常，建议优先人工核实";

export class ImportValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ImportValidationError";
  }
}

class ImportCancelledError extends Error {
  constructor() {
    super("import cancelled");
    this.name = "ImportCancelledError";
  }
}

export interface PreparedImportTask {
  originalPath: string;
  normalizedPath: string | null;
  fileType: FileType;
  status: "queued" | "skipped";
  errorCode: string | null;
  errorMessage: string | null;
}

export async function prepareImportTasks(batchId: string, paths: string[]): Promise<PreparedImportTask[]> {
  const tasks: PreparedImportTask[] = [];

  for (const sourcePath of paths) {
    const sourceType = detectImportSourceType(sourcePath);

    if (sourceType === "archive") {
      tasks.push(...await expandArchiveImportTasks(batchId, sourcePath));
      continue;
    }

    if (sourceType === "pdf") {
      tasks.push(preparePdfImportTask(sourcePath));
      continue;
    }

    throw new ImportValidationError("仅支持导入 PDF 或压缩包");
  }

  return tasks;
}

function preparePdfImportTask(sourcePath: string): PreparedImportTask {
  return {
    originalPath: sourcePath,
    normalizedPath: null,
    fileType: "pdf",
    status: "queued",
    errorCode: null,
    errorMessage: null,
  };
}

function detectImportSourceTypeFromContent(filePath: string): "pdf" | "unknown" {
  if (!existsSync(filePath)) {
    return "unknown";
  }

  try {
    const buffer = readFileSync(filePath);
    return isPdfBuffer(buffer) ? "pdf" : "unknown";
  } catch {
    return "unknown";
  }
}

export async function refreshBatchProgress(batchId: string) {
  const [batch] = await db.select({ status: importBatches.status }).from(importBatches).where(eq(importBatches.id, batchId)).limit(1);
  if (!batch) return;

  const allTasks = await db.select().from(importFileTasks).where(eq(importFileTasks.batchId, batchId));
  const total = allTasks.length;
  const processed = allTasks.filter(t => TERMINAL_TASK_STATUSES.includes((t.status ?? "") as typeof TERMINAL_TASK_STATUSES[number])).length;
  const success = allTasks.filter(t => t.status === "done").length;
  const failed = allTasks.filter(t => t.status === "failed").length;

  if (batch.status === "cancelled") {
    await db.update(importBatches).set({
      status: "cancelled",
      processedFiles: processed,
      successFiles: success,
      failedFiles: failed,
      currentStage: "cancelled",
      completedAt: Date.now(),
    }).where(eq(importBatches.id, batchId));
    return;
  }

  let batchStatus: string;
  if (processed >= total) batchStatus = failed > 0 && success > 0 ? "partial_success" : failed > 0 ? "failed" : "completed";
  else batchStatus = "processing";

  const activeStage = allTasks
    .filter(task => ACTIVE_TASK_STATUSES.includes((task.status ?? "") as typeof ACTIVE_TASK_STATUSES[number]))
    .sort((left, right) => stageWeight(right.stage) - stageWeight(left.stage))[0]?.stage ?? null;

  await db.update(importBatches).set({
    status: batchStatus,
    processedFiles: processed,
    successFiles: success,
    failedFiles: failed,
    currentStage: batchStatus === "processing" ? activeStage ?? batchStatus : batchStatus,
    completedAt: batchStatus === "completed" || batchStatus === "failed" || batchStatus === "partial_success" ? Date.now() : null,
  }).where(eq(importBatches.id, batchId));
}

export async function processFile(taskId: string, filePath: string, fileTypeHint?: FileType): Promise<void> {
  if (await markTaskCancelledIfNeeded(taskId)) {
    await updateBatchProgress(taskId);
    return;
  }

  const fileType = fileTypeHint ?? detectFileType(filePath);
  await updateTask(taskId, { status: "extracting", stage: "extracting", updatedAt: Date.now() });

  try {
    if (fileType === "unknown" || fileType === "zip") {
      await updateTask(taskId, { status: "skipped", stage: "classifying", errorCode: ImportErrorCodes.UNSUPPORTED_TYPE, errorMessage: `unsupported: ${extname(filePath)}`, updatedAt: Date.now() });
      await updateBatchProgress(taskId);
      return;
    }

    await updateTask(taskId, { status: fileType === "pdf" ? "text_extracting" : "ocr_running", stage: fileType === "pdf" ? "text_extracting" : "ocr_running", updatedAt: Date.now() });

    let extractResult: Awaited<ReturnType<typeof extractText>>;
    try {
      extractResult = await extractText(filePath, fileType as "pdf" | "png" | "jpg" | "jpeg" | "webp");
    } catch (err) {
      await updateTask(taskId, { status: "failed", stage: "text_extracting", errorCode: fileType === "pdf" ? ImportErrorCodes.TEXT_EXTRACT_FAILED : ImportErrorCodes.OCR_FAILED, errorMessage: (err as Error).message, updatedAt: Date.now() });
      await updateBatchProgress(taskId);
      return;
    }

    if (await markTaskCancelledIfNeeded(taskId)) {
      await updateBatchProgress(taskId);
      return;
    }

    await updateTask(taskId, { status: "parsing", stage: "parsing", updatedAt: Date.now() });
    const parsed = parseResumeText(extractResult.text);

    if (await markTaskCancelledIfNeeded(taskId)) {
      await updateBatchProgress(taskId);
      return;
    }

    await updateTask(taskId, { status: "matching_candidate", stage: "matching_candidate", updatedAt: Date.now() });
    const candidateMatch = await matchOrCreateCandidate(parsed, taskId);
    const candidateId = candidateMatch.id;

    if (await markTaskCancelledIfNeeded(taskId)) {
      if (candidateMatch.created) {
        await cleanupImportedCandidateIfUnused(candidateId);
      }
      await updateBatchProgress(taskId);
      return;
    }

    await updateTask(taskId, { status: "saving", stage: "saving", updatedAt: Date.now() });
    const resumeId = `res_${crypto.randomUUID()}`;
    const destDir = join(config.filesDir, "resumes");
    mkdirSync(destDir, { recursive: true });
    const destPath = join(destDir, `${resumeId}${extname(filePath)}`);

    if (await markTaskCancelledIfNeeded(taskId)) {
      if (candidateMatch.created) {
        await cleanupImportedCandidateIfUnused(candidateId);
      }
      await updateBatchProgress(taskId);
      return;
    }

    copyFileSync(filePath, destPath);

    if (await markTaskCancelledIfNeeded(taskId)) {
      unlinkIfExists(destPath);
      if (candidateMatch.created) {
        await cleanupImportedCandidateIfUnused(candidateId);
      }
      await updateBatchProgress(taskId);
      return;
    }

    await db.insert(resumes).values({
      id: resumeId, candidateId, fileName: basename(filePath), fileType: fileType as string,
      fileSize: readFileSync(destPath).length, filePath: destPath,
      extractedText: extractResult.text,
      parsedDataJson: JSON.stringify(parsed),
      ocrConfidence: extractResult.confidence, createdAt: Date.now(),
    });

    let result: ImportTaskResultWithConfidence = {
      parsedResume: parsed,
      extractionConfidence: extractResult.confidence,
      screeningStatus: "not_requested",
      screeningSource: null,
      screeningError: null,
      screeningConclusion: null,
    };

    if (await shouldGenerateScreeningConclusion(taskId)) {
      result = {
        ...result,
        screeningStatus: "running",
      };

      await updateTask(taskId, {
        status: "ai_screening",
        stage: "ai_screening",
        candidateId,
        resultJson: JSON.stringify(result),
        updatedAt: Date.now(),
      });

      try {
        const aiConclusion = await generateImportScreeningConclusionWithAI({
          parsed,
          confidence: extractResult.confidence,
          fileName: basename(filePath),
        });

        result = {
          ...result,
          screeningStatus: "completed",
          screeningSource: "ai",
          screeningConclusion: aiConclusion,
        };
      } catch (error) {
        result = {
          ...result,
          screeningStatus: "completed",
          screeningSource: "heuristic",
          screeningError: error instanceof Error ? error.message : "AI 初筛失败，已回退规则结论",
          screeningConclusion: buildImportScreeningConclusion(parsed, extractResult.confidence),
        };
      }

      result = await attachUniversityVerificationResult(parsed, result);
    }

    if (await markTaskCancelledIfNeeded(taskId)) {
      await cleanupImportedResumeIfExists(resumeId);
      if (candidateMatch.created) {
        await cleanupImportedCandidateIfUnused(candidateId);
      }
      await updateBatchProgress(taskId);
      return;
    }

    await updateTask(taskId, { status: "done", stage: "completed", candidateId, resultJson: JSON.stringify(result), updatedAt: Date.now() });
    await updateBatchProgress(taskId);
  } catch (err) {
    if (err instanceof ImportCancelledError) {
      await markTaskCancelledIfNeeded(taskId);
      await updateBatchProgress(taskId);
      return;
    }
    await updateTask(taskId, { status: "failed", errorCode: ImportErrorCodes.SAVE_FAILED, errorMessage: (err as Error).message, updatedAt: Date.now() });
    await updateBatchProgress(taskId);
  }
}

function buildImportScreeningConclusion(parsed: { name: string | null; position: string | null; phone: string | null; email: string | null; yearsOfExperience: number | null; skills: string[]; education: string[]; workHistory: string[]; rawText: string }, confidence: number): import("@ims/shared").ImportScreeningConclusion {
  let score = 32;
  const strengths: string[] = [];
  const concerns: string[] = [];

  if (parsed.phone || parsed.email) {
    score += 10;
    strengths.push("联系方式完整，可快速跟进");
  } else {
    score -= 15;
    concerns.push("联系方式缺失，需要人工补充确认");
  }

  const years = parsed.yearsOfExperience ?? 0;
  if (years >= 5) {
    score += 18;
    strengths.push(`有 ${years} 年以上相关经验`);
  } else if (years >= 3) {
    score += 12;
    strengths.push(`具备 ${years} 年相关经验`);
  } else if (years >= 1) {
    score += 6;
  } else {
    concerns.push("工作年限信息较弱，需要进一步确认资历");
  }

  if (parsed.skills.length >= 8) {
    score += 14;
    strengths.push(`技能覆盖较广（${parsed.skills.slice(0, 4).join(" / ")}）`);
  } else if (parsed.skills.length >= 4) {
    score += 8;
    strengths.push(`已识别关键技能：${parsed.skills.slice(0, 3).join(" / ")}`);
  } else if (parsed.skills.length > 0) {
    score += 3;
  } else {
    concerns.push("技能关键词较少，建议人工复核简历内容");
  }

  if (parsed.workHistory.length >= 2) {
    score += 6;
    strengths.push("工作经历描述较完整");
  } else if (parsed.workHistory.length === 0) {
    concerns.push("工作经历提取不足，可能需要人工阅读原简历");
  }

  if (parsed.education.length > 0) {
    score += 3;
  }

  if (parsed.rawText.length < 300) {
    score -= 20;
    concerns.push("文本提取内容过少，结论可信度较低");
  } else if (parsed.rawText.length < 800) {
    score -= 8;
  }

  if (confidence >= 85) {
    score += 4;
  } else if (confidence < 60) {
    score -= 12;
    concerns.push("文本提取质量一般，建议人工校验");
  }

  score = Math.max(0, Math.min(100, score));

  const verdict = score >= 75 ? "pass" : score >= 55 ? "review" : "reject";
  const label = verdict === "pass" ? "通过" : verdict === "review" ? "待定" : "淘汰";
  const recommendedAction = verdict === "pass" ? "建议进入后续面试环节" : verdict === "review" ? "建议人工复核后再决定" : "建议暂不进入后续流程";
  const summary = verdict === "pass"
    ? "简历关键信息完整，经验与技能匹配度较高，可优先进入下一轮。"
    : verdict === "review"
      ? "简历具备一定匹配度，但仍有关键信息需要人工确认。"
      : "当前提取结果显示匹配度偏弱，不建议直接推进。";
  const primaryReason = verdict === "reject"
    ? (concerns[0] ?? summary)
    : (strengths[0] ?? summary);
  const wechatConclusion = `${label}：${summary}`;
  const wechatReason = `原因：${primaryReason}`;
  const wechatAction = `建议：${recommendedAction}`;
  const wechatCopyText = [wechatConclusion, wechatReason, wechatAction].join("\n");

  return {
    verdict,
    label,
    score,
    candidateName: parsed.name,
    candidatePosition: parsed.position,
    candidateYearsOfExperience: parsed.yearsOfExperience,
    screeningBaseUrl: null,
    summary,
    strengths: strengths.slice(0, 3),
    concerns: concerns.slice(0, 3),
    recommendedAction,
    wechatConclusion,
    wechatReason,
    wechatAction,
    wechatCopyText,
  } satisfies ImportScreeningConclusionWithMetadata;
}

async function attachUniversityVerificationResult(
  parsed: ImportTaskResultData["parsedResume"],
  result: ImportTaskResultWithConfidence,
): Promise<ImportTaskResultWithConfidence> {
  if (!result.screeningConclusion) {
    return {
      ...result,
      universityVerification: null,
    };
  }

  const educationList = parsed.education
    .map(item => item.trim())
    .filter(Boolean);

  if (educationList.length === 0) {
    return {
      ...result,
      universityVerification: null,
    };
  }

  try {
    const primaryVerification = (await verifyCandidateSchools(educationList))[0] ?? null;
    if (!primaryVerification) {
      return {
        ...result,
        universityVerification: null,
      };
    }

    if (primaryVerification.verdict === "api_failed") {
      console.warn(
        `[import] university verification unavailable for ${primaryVerification.schoolName ?? "unknown school"}: ${primaryVerification.detail ?? "unknown reason"}`,
      );
    }

    return {
      ...result,
      screeningError: primaryVerification.verdict === "api_failed"
        ? appendUniqueMessage(result.screeningError, UNIVERSITY_API_UNAVAILABLE_ERROR)
        : result.screeningError,
      screeningConclusion: applyUniversityVerificationToConclusion(result.screeningConclusion, primaryVerification),
      universityVerification: primaryVerification,
    };
  } catch (error) {
    console.warn(`[import] university verification failed: ${error instanceof Error ? error.message : String(error)}`);
    return {
      ...result,
      screeningError: appendUniqueMessage(result.screeningError, UNIVERSITY_API_UNAVAILABLE_ERROR),
      universityVerification: null,
    };
  }
}

function applyUniversityVerificationToConclusion(
  conclusion: ImportScreeningConclusion,
  verification: UniversityVerificationResult,
): ImportScreeningConclusion {
  if (verification.verdict !== "not_found") {
    return {
      ...conclusion,
      universityVerification: verification,
    };
  }

  const score = Math.max(0, conclusion.score - 30);
  const verdict = score < 55
    ? downgradeVerdict(conclusion.verdict)
    : conclusion.verdict;
  const recommendedAction = verdict === conclusion.verdict
    ? conclusion.recommendedAction
    : getRecommendedActionByVerdict(verdict);

  return {
    ...conclusion,
    verdict,
    label: getScreeningLabelByVerdict(verdict),
    score,
    concerns: appendUniqueItem(conclusion.concerns, UNIVERSITY_NOT_FOUND_CONCERN),
    recommendedAction: appendUniqueMessage(recommendedAction, UNIVERSITY_REVIEW_WARNING),
    universityVerification: verification,
  };
}

function downgradeVerdict(verdict: ImportScreeningConclusion["verdict"]): ImportScreeningConclusion["verdict"] {
  if (verdict === "pass") {
    return "review";
  }

  if (verdict === "review") {
    return "reject";
  }

  return verdict;
}

function getScreeningLabelByVerdict(verdict: ImportScreeningConclusion["verdict"]): string {
  return verdict === "pass"
    ? "通过"
    : verdict === "review"
      ? "待定"
      : "淘汰";
}

function getRecommendedActionByVerdict(verdict: ImportScreeningConclusion["verdict"]): string {
  return verdict === "pass"
    ? "建议进入后续面试环节"
    : verdict === "review"
      ? "建议人工复核后再决定"
      : "建议暂不进入后续流程";
}

function appendUniqueItem(items: string[], nextItem: string): string[] {
  return items.includes(nextItem) ? items : [...items, nextItem];
}

function appendUniqueMessage(current: string | null | undefined, nextMessage: string): string {
  const base = current?.trim();
  if (!base) {
    return nextMessage;
  }

  return base.includes(nextMessage) ? base : `${base}；${nextMessage}`;
}

export async function importResumeForCandidate(
  candidateId: string,
  filePath: string,
  options?: {
    fileTypeHint?: FileType;
    originalFileName?: string;
  }
): Promise<{ resumeId: string; parsed: ReturnType<typeof parseResumeText> }> {
  const fileType = options?.fileTypeHint ?? detectFileType(filePath);
  if (fileType === "unknown" || fileType === "zip") {
    throw new Error(`unsupported resume file type: ${extname(filePath) || "unknown"}`);
  }

  const extractResult = await extractText(filePath, fileType as "pdf" | "png" | "jpg" | "jpeg" | "webp");
  const parsed = parseResumeText(extractResult.text);

  const resumeId = `res_${crypto.randomUUID()}`;
  const destDir = join(config.filesDir, "resumes");
  mkdirSync(destDir, { recursive: true });
  const destPath = join(destDir, `${resumeId}${extname(filePath)}`);
  copyFileSync(filePath, destPath);

  await db.insert(resumes).values({
    id: resumeId,
    candidateId,
    fileName: options?.originalFileName ?? basename(filePath),
    fileType: fileType as string,
    fileSize: readFileSync(destPath).length,
    filePath: destPath,
    extractedText: extractResult.text,
    parsedDataJson: JSON.stringify(parsed),
    ocrConfidence: extractResult.confidence,
    createdAt: Date.now(),
  });

  return { resumeId, parsed };
}

async function matchOrCreateCandidate(
  parsed: { phone: string | null; email: string | null; name: string | null; position: string | null; yearsOfExperience: number | null; skills: string[] },
  taskId?: string,
): Promise<{ id: string; created: boolean }> {
  let existingId: string | null = null;

  if (parsed.phone) {
    const [existing] = await db.select({ id: candidates.id }).from(candidates).where(eq(candidates.phone, parsed.phone)).limit(1);
    if (existing) existingId = existing.id;
  }
  if (!existingId && parsed.email) {
    const [existing] = await db.select({ id: candidates.id }).from(candidates).where(eq(candidates.email, parsed.email)).limit(1);
    if (existing) existingId = existing.id;
  }

  if (existingId) {
    // 如果现有候选人的 yearsOfExperience 为空，但解析结果有值，则更新
    if (parsed.yearsOfExperience != null) {
      const [current] = await db.select({ yearsOfExperience: candidates.yearsOfExperience }).from(candidates).where(eq(candidates.id, existingId)).limit(1);
      if (current && current.yearsOfExperience == null) {
        await db.update(candidates).set({ yearsOfExperience: parsed.yearsOfExperience, updatedAt: Date.now() }).where(eq(candidates.id, existingId));
      }
    }
    return { id: existingId, created: false };
  }

  if (taskId && await isBatchCancelledForTask(taskId)) {
    throw new ImportCancelledError();
  }
  const id = `cand_${crypto.randomUUID()}`;
  const now = Date.now();
  await db.insert(candidates).values({ id, source: "local", remoteId: null, name: parsed.name ?? "未知姓名", phone: parsed.phone ?? null, email: parsed.email ?? null, position: parsed.position ?? null, yearsOfExperience: parsed.yearsOfExperience ?? null, tagsJson: JSON.stringify(parsed.skills.slice(0, 10)), createdAt: now, updatedAt: now });
  return { id, created: true };
}

function detectFileType(filePath: string): FileType {
  return classifyFileType(extname(filePath));
}

async function updateTask(taskId: string, updates: Partial<{ status: string; stage: string | null; errorCode: string | null; errorMessage: string | null; candidateId: string | null; resultJson: string | null; updatedAt: number }>) {
  await db.update(importFileTasks).set(updates).where(eq(importFileTasks.id, taskId));
}

async function updateBatchProgress(taskId: string) {
  const [task] = await db.select({ batchId: importFileTasks.batchId }).from(importFileTasks).where(eq(importFileTasks.id, taskId)).limit(1);
  if (!task) return;
  await refreshBatchProgress(task.batchId);
}

export async function cancelImportBatch(batchId: string) {
  const now = Date.now();

  await db.update(importBatches).set({
    status: "cancelled",
    currentStage: "cancelled",
    completedAt: now,
  }).where(eq(importBatches.id, batchId));

  await db.update(importFileTasks).set({
    status: "skipped",
    stage: "cancelled",
    errorCode: null,
    errorMessage: "cancelled by user",
    updatedAt: now,
  }).where(and(eq(importFileTasks.batchId, batchId), inArray(importFileTasks.status, [...ACTIVE_TASK_STATUSES])));

  await refreshBatchProgress(batchId);
}

export async function rerunImportBatchScreening(batchId: string, templateId?: string): Promise<{ retriedCount: number }> {
  const [batch] = await db.select().from(importBatches).where(eq(importBatches.id, batchId)).limit(1);
  if (!batch) {
    return { retriedCount: 0 };
  }

  const rows = await db.select().from(importFileTasks).where(eq(importFileTasks.batchId, batchId));
  const runnableTasks = rows
    .map((task) => ({ task, result: parseImportTaskResult(task.resultJson) }))
    .filter(({ task, result }) => task.status === "done" && result?.parsedResume);

  if (!runnableTasks.length) {
    return { retriedCount: 0 };
  }

  await db.update(importBatches).set({
    status: "processing",
    currentStage: "ai_screening",
    completedAt: null,
  }).where(eq(importBatches.id, batchId));

  for (const { task, result } of runnableTasks) {
    if (!result) continue;
    const nextResult: ImportTaskResultWithConfidence = {
      parsedResume: result.parsedResume,
      extractionConfidence: result.extractionConfidence,
      screeningStatus: "running",
      screeningSource: null,
      screeningError: null,
      screeningConclusion: null,
    };

    await updateTask(task.id, {
      status: "ai_screening",
      stage: "ai_screening",
      resultJson: JSON.stringify(nextResult),
      updatedAt: Date.now(),
    });
  }

  await refreshBatchProgress(batchId);

  for (const { task, result } of runnableTasks) {
    if (!result) continue;
    let nextResult: ImportTaskResultWithConfidence = {
      parsedResume: result.parsedResume,
      extractionConfidence: result.extractionConfidence,
      screeningStatus: "running",
      screeningSource: null,
      screeningError: null,
      screeningConclusion: null,
    };

    try {
      const confidence = await resolveTaskConfidence(task, result);
      const aiConclusion = await generateImportScreeningConclusionWithAI({
        parsed: result.parsedResume,
        confidence,
        fileName: basename(task.originalPath.split("#").pop() ?? task.originalPath),
        templateId,
      });
      nextResult = {
        ...nextResult,
        screeningStatus: "completed",
        screeningSource: "ai",
        screeningConclusion: aiConclusion,
      };
    } catch (error) {
      const fallbackConfidence = inferConfidenceFromRawText(result.parsedResume.rawText ?? "");
      nextResult = {
        ...nextResult,
        screeningStatus: "completed",
        screeningSource: "heuristic",
        screeningError: error instanceof Error ? error.message : "AI 初筛失败，已回退规则结论",
        screeningConclusion: buildImportScreeningConclusion(result.parsedResume, fallbackConfidence),
      };
    }

    nextResult = await attachUniversityVerificationResult(result.parsedResume, nextResult);

    await updateTask(task.id, {
      status: "done",
      stage: "completed",
      resultJson: JSON.stringify(nextResult),
      updatedAt: Date.now(),
    });

    await refreshBatchProgress(batchId);
  }

  return { retriedCount: runnableTasks.length };
}

export async function startRerunImportBatchScreening(batchId: string): Promise<{
  started: boolean;
  retriedCount: number;
  status: string;
  notFound: boolean;
  alreadyRunning: boolean;
}> {
  return db.transaction(async (tx) => {
    const [batch] = await tx.select().from(importBatches).where(eq(importBatches.id, batchId)).limit(1);
    if (!batch) {
      return {
        started: false,
        retriedCount: 0,
        status: "not_found",
        notFound: true,
        alreadyRunning: false,
      };
    }

    if (batch.status === "processing" || batch.status === "queued") {
      return {
        started: false,
        retriedCount: 0,
        status: batch.status,
        notFound: false,
        alreadyRunning: true,
      };
    }

    const rows = await tx.select().from(importFileTasks).where(eq(importFileTasks.batchId, batchId));
    const retriedCount = rows
      .map((task) => ({ task, result: parseImportTaskResult(task.resultJson) }))
      .filter(({ task, result }) => task.status === "done" && result?.parsedResume).length;

    if (retriedCount === 0) {
      return {
        started: false,
        retriedCount: 0,
        status: batch.status,
        notFound: false,
        alreadyRunning: false,
      };
    }

    await tx.update(importBatches).set({
      status: "processing",
      currentStage: "ai_screening",
      completedAt: null,
    }).where(eq(importBatches.id, batchId));

    return {
      started: true,
      retriedCount,
      status: "processing",
      notFound: false,
      alreadyRunning: false,
    };
  });
}



export async function rerunFileScreening(taskId: string, templateId?: string): Promise<{ retried: boolean; screeningStatus: string }> {
  const [task] = await db.select().from(importFileTasks).where(eq(importFileTasks.id, taskId)).limit(1);
  if (!task) {
    return { retried: false, screeningStatus: "not_requested" };
  }

  const result = parseImportTaskResult(task.resultJson);
  if (!result?.parsedResume) {
    return { retried: false, screeningStatus: "not_requested" };
  }

  const nextResult: ImportTaskResultWithConfidence = {
    parsedResume: result.parsedResume,
    extractionConfidence: result.extractionConfidence,
    screeningStatus: "running",
    screeningSource: null,
    screeningError: null,
    screeningConclusion: null,
  };

  await updateTask(taskId, {
    status: "ai_screening",
    stage: "ai_screening",
    resultJson: JSON.stringify(nextResult),
    updatedAt: Date.now(),
  });

  await updateBatchProgress(taskId);

  try {
    const confidence = await resolveTaskConfidence(task, result);
    const aiConclusion = await generateImportScreeningConclusionWithAI({
      parsed: result.parsedResume,
      confidence,
      fileName: basename(task.originalPath.split("#").pop() ?? task.originalPath),
      templateId,
    });
    nextResult.screeningStatus = "completed";
    nextResult.screeningSource = "ai";
    nextResult.screeningConclusion = aiConclusion;
  } catch (error) {
    const fallbackConfidence = inferConfidenceFromRawText(result.parsedResume.rawText ?? "");
    nextResult.screeningStatus = "completed";
    nextResult.screeningSource = "heuristic";
    nextResult.screeningError = error instanceof Error ? error.message : "AI 初筛失败，已回退规则结论";
    nextResult.screeningConclusion = buildImportScreeningConclusion(result.parsedResume, fallbackConfidence);
  }

  Object.assign(nextResult, await attachUniversityVerificationResult(result.parsedResume, nextResult));

  await updateTask(taskId, {
    status: "done",
    stage: "completed",
    resultJson: JSON.stringify(nextResult),
    updatedAt: Date.now(),
  });

  await updateBatchProgress(taskId);

  return { retried: true, screeningStatus: nextResult.screeningStatus };
}

async function markTaskCancelledIfNeeded(taskId: string): Promise<boolean> {
  const [task] = await db.select({ batchStatus: importBatches.status, taskStatus: importFileTasks.status })
    .from(importFileTasks)
    .innerJoin(importBatches, eq(importBatches.id, importFileTasks.batchId))
    .where(eq(importFileTasks.id, taskId))
    .limit(1);

  if (!task || task.batchStatus !== "cancelled") {
    return false;
  }

  if (TERMINAL_TASK_STATUSES.includes((task.taskStatus ?? "") as typeof TERMINAL_TASK_STATUSES[number])) {
    return true;
  }

  await updateTask(taskId, {
    status: "skipped",
    stage: "cancelled",
    errorCode: null,
    errorMessage: "cancelled by user",
    updatedAt: Date.now(),
  });
  return true;
}

async function isBatchCancelledForTask(taskId: string): Promise<boolean> {
  const [task] = await db.select({ batchStatus: importBatches.status })
    .from(importFileTasks)
    .innerJoin(importBatches, eq(importBatches.id, importFileTasks.batchId))
    .where(eq(importFileTasks.id, taskId))
    .limit(1);
  return task?.batchStatus === "cancelled";
}

function parseImportTaskResult(resultJson: string | null): ImportTaskResultWithConfidence | null {
  if (!resultJson?.trim()) {
    return null;
  }

  try {
    return JSON.parse(resultJson) as ImportTaskResultWithConfidence;
  } catch {
    return null;
  }
}

async function resolveTaskConfidence(task: { candidateId: string | null }, result: ImportTaskResultWithConfidence) {
  if (typeof result.extractionConfidence === "number" && Number.isFinite(result.extractionConfidence)) {
    return clampConfidence(result.extractionConfidence);
  }

  if (task.candidateId) {
    const [latestResume] = await db
      .select({ ocrConfidence: resumes.ocrConfidence })
      .from(resumes)
      .where(eq(resumes.candidateId, task.candidateId))
      .orderBy(desc(resumes.createdAt))
      .limit(1);

    if (typeof latestResume?.ocrConfidence === "number" && Number.isFinite(latestResume.ocrConfidence)) {
      return clampConfidence(latestResume.ocrConfidence);
    }
  }

  return inferConfidenceFromRawText(result.parsedResume.rawText);
}

function inferConfidenceFromRawText(rawText: string) {
  const length = rawText.trim().length;
  if (length > 2000) return 95;
  if (length > 800) return 88;
  if (length > 200) return 72;
  return 55;
}

function clampConfidence(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

async function shouldGenerateScreeningConclusion(taskId: string): Promise<boolean> {
  const [task] = await db.select({ autoScreen: importBatches.autoScreen })
    .from(importFileTasks)
    .innerJoin(importBatches, eq(importBatches.id, importFileTasks.batchId))
    .where(eq(importFileTasks.id, taskId))
    .limit(1);
  return task?.autoScreen ?? false;
}

async function cleanupImportedCandidateIfUnused(candidateId: string) {
  const [resumeRow] = await db.select({ id: resumes.id }).from(resumes).where(eq(resumes.candidateId, candidateId)).limit(1);
  if (resumeRow) return;

  const [interviewRow] = await db.select({ id: interviews.id }).from(interviews).where(eq(interviews.candidateId, candidateId)).limit(1);
  if (interviewRow) return;

  const [artifactRow] = await db.select({ id: artifacts.id }).from(artifacts).where(eq(artifacts.candidateId, candidateId)).limit(1);
  if (artifactRow) return;

  const [workspaceRow] = await db.select({ id: candidateWorkspaces.id }).from(candidateWorkspaces).where(eq(candidateWorkspaces.candidateId, candidateId)).limit(1);
  if (workspaceRow) return;

  await db.delete(candidates).where(eq(candidates.id, candidateId));
}

async function cleanupImportedResumeIfExists(resumeId: string) {
  const [resumeRow] = await db.select({ id: resumes.id, filePath: resumes.filePath }).from(resumes).where(eq(resumes.id, resumeId)).limit(1);
  if (!resumeRow) return;
  unlinkIfExists(resumeRow.filePath);
  await db.delete(resumes).where(eq(resumes.id, resumeId));
}

function stageWeight(stage: string | null) {
  if (!stage) return -1;
  return STAGE_PRIORITY.indexOf(stage as typeof STAGE_PRIORITY[number]);
}

function unlinkIfExists(filePath: string) {
  try {
    unlinkSync(filePath);
  } catch (error) {
    console.warn(`[import] cleanup failed for ${filePath}: ${(error as Error).message}`);
  }
}

function shouldIgnoreZipEntry(entryName: string) {
  const normalized = entryName.replace(/\\/g, "/").toLowerCase();
  if (ZIP_IGNORED_ENTRY_PREFIXES.some((prefix) => normalized.startsWith(prefix))) {
    return true;
  }

  const baseName = basename(normalized);
  return ZIP_IGNORED_ENTRY_NAMES.includes(baseName);
}

function detectImportSourceType(filePath: string): "archive" | "pdf" | "unknown" {
  const normalized = filePath.toLowerCase();
  if (SUPPORTED_ARCHIVE_SUFFIXES.some((suffix) => normalized.endsWith(suffix))) {
    return "archive";
  }
  if (normalized.endsWith(".pdf")) {
    return "pdf";
  }

  return detectImportSourceTypeFromContent(filePath);
}

function isPdfBuffer(buffer: Buffer) {
  if (buffer.byteLength < 5) {
    return false;
  }

  return buffer.subarray(0, 5).toString("ascii") === "%PDF-";
}

function ensureArchiveBinaryReady() {
  if (process.platform === "win32") {
    return ARCHIVE_BIN_PATH;
  }

  try {
    chmodSync(ARCHIVE_BIN_PATH, 0o755);
  } catch {
    // ignore chmod failure and let actual execution surface the error
  }

  return ARCHIVE_BIN_PATH;
}

async function runArchiveCommand(args: string[], encoding: BufferEncoding): Promise<string>;
async function runArchiveCommand(args: string[], encoding: "buffer"): Promise<Buffer>;
async function runArchiveCommand(args: string[], encoding: BufferEncoding | "buffer"): Promise<string | Buffer> {
  const binPath = ensureArchiveBinaryReady();
  const { stdout } = await execFileAsync(binPath, args, {
    encoding,
    maxBuffer: MAX_FILE_SIZE_BYTES + 10 * 1024 * 1024,
  });
  return stdout;
}

function parseArchiveListOutput(output: string): string[] {
  const lines = output.split(/\r?\n/);
  const entries: string[] = [];
  let current: Record<string, string> = {};

  const flush = () => {
    const entryPath = current.Path?.trim();
    const isFile = current.Folder?.trim() === "-";
    if (entryPath && isFile) {
      entries.push(entryPath);
    }
    current = {};
  };

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) {
      flush();
      continue;
    }

    const separatorIndex = line.indexOf(" = ");
    if (separatorIndex <= 0) {
      continue;
    }

    const key = line.slice(0, separatorIndex).trim();
    const value = line.slice(separatorIndex + 3).trim();
    current[key] = value;
  }

  flush();
  return entries;
}

async function listArchiveEntries(archivePath: string): Promise<string[]> {
  try {
    const stdout = await runArchiveCommand(["l", "-slt", archivePath], "utf8");
    return parseArchiveListOutput(stdout);
  } catch (error) {
    void error;
    throw new ImportValidationError("压缩包读取失败");
  }
}

async function extractArchiveEntry(archivePath: string, entryName: string): Promise<Buffer> {
  try {
    return await runArchiveCommand(["e", "-so", archivePath, entryName], "buffer");
  } catch (error) {
    void error;
    throw new ImportValidationError("压缩包解压失败");
  }
}

async function expandArchiveImportTasks(batchId: string, archivePath: string): Promise<PreparedImportTask[]> {
  const archiveEntries = (await listArchiveEntries(archivePath))
    .filter((entryName) => !shouldIgnoreZipEntry(entryName));

  const invalidEntries = archiveEntries
    .map((entryName) => ({ entryName, fileType: classifyFileType(extname(entryName)) }))
    .filter(({ fileType }) => fileType !== "pdf");

  if (invalidEntries.length > 0) {
    throw new ImportValidationError("压缩包内只能包含 PDF 文件");
  }

  if (archiveEntries.length === 0) {
    throw new ImportValidationError("压缩包内没有可导入的 PDF 文件");
  }

  const stagingDir = join(config.dataDir, "import-staging", batchId);
  mkdirSync(stagingDir, { recursive: true });

  const tasks: PreparedImportTask[] = [];
  for (const entryName of archiveEntries) {
    const fileType = classifyFileType(extname(entryName));
    const buffer = await extractArchiveEntry(archivePath, entryName);
    const entryPath = `${archivePath}#${entryName}`;

    if (buffer.byteLength > MAX_FILE_SIZE_BYTES) {
      throw new ImportValidationError("压缩包内文件过大");
    }

    if (!isPdfBuffer(buffer)) {
      throw new ImportValidationError("压缩包内存在无法解析的 PDF 文件");
    }

    const stagedPath = join(stagingDir, `${crypto.randomUUID()}${extname(entryName)}`);
    writeFileSync(stagedPath, buffer);
    tasks.push({
      originalPath: entryPath,
      normalizedPath: stagedPath,
      fileType,
      status: "queued",
      errorCode: null,
      errorMessage: null,
    });
  }

  return tasks;
}


export interface ScreeningExportFile {
  buffer: Uint8Array;
  fileName: string;
  contentType: string;
}

interface ExportableScreeningEntry {
  task: typeof importFileTasks.$inferSelect;
  result: ImportTaskResultWithConfidence & { screeningConclusion: ImportScreeningConclusion };
  candidate: typeof candidates.$inferSelect | null;
  resume: typeof resumes.$inferSelect | null;
}

export class ImportScreeningExportError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = "ImportScreeningExportError";
  }
}

function sanitizeFileNamePart(value: string | null | undefined, fallback: string): string {
  const normalized = value?.trim();
  if (!normalized) return fallback;

  return normalized
    .replace(/[\\/:*?"<>|]/g, "_")
    .replace(/\s+/g, " ")
    .trim() || fallback;
}

function formatExperienceForFileName(years: number | null | undefined): string {
  if (years === null || years === undefined) {
    return "NA";
  }

  return `${years}Y`;
}

function resolveTaskSourceFileName(task: typeof importFileTasks.$inferSelect): string {
  const raw = task.originalPath.split("#").pop() ?? task.originalPath;
  return raw.split(/[\\/]/).pop() ?? raw;
}

function baseNameWithoutExtension(fileName: string): string {
  const index = fileName.lastIndexOf(".");
  return index > 0 ? fileName.slice(0, index) : fileName;
}

function inferRoleTrack(position: string | null | undefined): "FE" | "BE" {
  const normalized = (position ?? "").trim().toLowerCase();
  if (!normalized) return "BE";

  const frontendKeywords = [
    "前端",
    "frontend",
    "front-end",
    "web前端",
    "react",
    "vue",
    "ui",
    "客户端",
    "client",
    "ios",
    "android",
  ];

  return frontendKeywords.some((keyword) => normalized.includes(keyword)) ? "FE" : "BE";
}

function resolveEntryDisplayName(entry: ExportableScreeningEntry, sourceFileName: string): string {
  const conclusion = entry.result.screeningConclusion as ImportScreeningConclusionWithMetadata;
  return sanitizeFileNamePart(
    conclusion.candidateName ?? entry.result.parsedResume.name ?? entry.candidate?.name,
    sanitizeFileNamePart(baseNameWithoutExtension(sourceFileName), entry.task.id),
  );
}

function resolveEntryContact(entry: ExportableScreeningEntry): string {
  return sanitizeFileNamePart(
    entry.result.parsedResume.phone ?? entry.candidate?.phone ?? entry.result.parsedResume.email ?? entry.candidate?.email,
    "NA",
  );
}

function ensureSelectedBatchIds(batchIds: string[]): string[] {
  const normalized = Array.from(new Set(batchIds.map(id => id.trim()).filter(Boolean)));
  if (normalized.length === 0) {
    throw new ImportScreeningExportError("VALIDATION_ERROR", "请至少选择一个已完成批次", 422);
  }
  return normalized;
}

async function loadCompletedBatches(batchIds: string[]) {
  const rows = await db.select().from(importBatches).where(inArray(importBatches.id, batchIds));
  if (rows.length !== batchIds.length) {
    throw new ImportScreeningExportError("NOT_FOUND", "存在已不存在的导出批次，请刷新后重试", 404);
  }

  const nonCompleted = rows.filter(
    (batch) => batch.status !== "completed" && batch.status !== "partial_success",
  );
  if (nonCompleted.length > 0) {
    throw new ImportScreeningExportError(
      ErrorCodes.IMPORT_EXPORT_BATCH_NOT_READY,
      "仅支持导出已完成或部分成功的批次",
      409,
    );
  }

  return rows;
}

function formatExportDate(date = new Date()): string {
  return date.toISOString().slice(0, 10);
}

function buildReadableBatchExportLabel(batch: typeof importBatches.$inferSelect): string {
  const dateStr = formatExportDate(new Date(batch.createdAt));
  return `${dateStr}-${batch.totalFiles}份简历`;
}

function buildExportFileStem(batches: Array<typeof importBatches.$inferSelect>, now = new Date()): string {
  const dateStr = formatExportDate(now);
  if (batches.length === 1) {
    const batch = batches[0];
    return `${buildReadableBatchExportLabel(batch)}-初筛报告`;
  }

  return `${dateStr}-批量导出-${batches.length}个批次-初筛报告`;
}

function normalizeSelectedTaskIds(taskIds: string[] | undefined): string[] | null {
  if (!taskIds) return null;
  const normalized = Array.from(new Set(taskIds.map(id => id.trim()).filter(Boolean)));
  return normalized.length > 0 ? normalized : null;
}

function applyExportFilters(
  entries: ExportableScreeningEntry[],
  request: ImportScreeningExportRequest,
): ExportableScreeningEntry[] {
  const selectedTaskIds = normalizeSelectedTaskIds(request.selectedTaskIds);
  const scoreMin = typeof request.scoreMin === "number" ? request.scoreMin : null;
  const scoreMax = typeof request.scoreMax === "number" ? request.scoreMax : null;

  if (scoreMin !== null && scoreMax !== null && scoreMin > scoreMax) {
    throw new ImportScreeningExportError("VALIDATION_ERROR", "最低分不能高于最高分", 422);
  }

  const filtered = entries.filter((entry) => {
    if (selectedTaskIds && !selectedTaskIds.includes(entry.task.id)) {
      return false;
    }

    const score = entry.result.screeningConclusion.score;
    if (scoreMin !== null && score < scoreMin) return false;
    if (scoreMax !== null && score > scoreMax) return false;
    return true;
  });

  if (filtered.length === 0) {
    throw new ImportScreeningExportError(ErrorCodes.IMPORT_EXPORT_EMPTY, "当前筛选条件下没有可导出的记录", 422);
  }

  return filtered;
}

async function collectExportableScreeningEntries(batchIds: string[]): Promise<ExportableScreeningEntry[]> {
  await loadCompletedBatches(batchIds);
  const tasks = await db.select().from(importFileTasks).where(inArray(importFileTasks.batchId, batchIds));

  const exportableTasks = tasks.filter((task) => {
    if (task.status !== "done") return false;
    const result = parseImportTaskResult(task.resultJson);
    return Boolean(result?.parsedResume && result.screeningStatus === "completed" && result.screeningConclusion);
  });

  if (exportableTasks.length === 0) {
    throw new ImportScreeningExportError(
      ErrorCodes.IMPORT_EXPORT_EMPTY,
      "所选批次没有可导出的已完成初筛结果",
      422,
    );
  }

  const candidateIds = Array.from(new Set(exportableTasks.map(task => task.candidateId).filter((id): id is string => Boolean(id))));
  const [candidateRows, resumeRows] = await Promise.all([
    candidateIds.length > 0
      ? db.select().from(candidates).where(inArray(candidates.id, candidateIds))
      : Promise.resolve([] as Array<typeof candidates.$inferSelect>),
    candidateIds.length > 0
      ? db.select().from(resumes).where(inArray(resumes.candidateId, candidateIds))
      : Promise.resolve([] as Array<typeof resumes.$inferSelect>),
  ]);

  const candidateMap = new Map(candidateRows.map(candidate => [candidate.id, candidate]));
  const resumeMap = new Map<string, Array<typeof resumes.$inferSelect>>();
  for (const resume of resumeRows) {
    const list = resumeMap.get(resume.candidateId) ?? [];
    list.push(resume);
    resumeMap.set(resume.candidateId, list);
  }

  for (const list of resumeMap.values()) {
    list.sort((left, right) => right.createdAt - left.createdAt);
  }

  return exportableTasks.map((task) => {
    const result = parseImportTaskResult(task.resultJson);
    if (!result?.parsedResume || result.screeningStatus !== "completed" || !result.screeningConclusion) {
      throw new ImportScreeningExportError(ErrorCodes.IMPORT_EXPORT_EMPTY, "存在无法导出的初筛记录", 422);
    }

    const taskFileName = resolveTaskSourceFileName(task);
    const candidateResumeList = task.candidateId ? (resumeMap.get(task.candidateId) ?? []) : [];
    const preferredResume = candidateResumeList.find(resume => extname(resume.fileName).toLowerCase() === extname(taskFileName).toLowerCase())
      ?? candidateResumeList[0]
      ?? null;

    return {
      task,
      result: {
        ...result,
        screeningConclusion: result.screeningConclusion,
      },
      candidate: task.candidateId ? (candidateMap.get(task.candidateId) ?? null) : null,
      resume: preferredResume,
    };
  });
}

function buildScreeningReportMarkdown(entry: ExportableScreeningEntry): string {
  const { task, result, candidate } = entry;
  const conclusion = result.screeningConclusion as ImportScreeningConclusionWithMetadata;
  const reportName = conclusion.candidateName ?? result.parsedResume.name ?? candidate?.name ?? "未命名候选人";
  const reportPosition = conclusion.candidatePosition ?? result.parsedResume.position ?? candidate?.position ?? "未填写";
  const reportYears = conclusion.candidateYearsOfExperience ?? result.parsedResume.yearsOfExperience ?? candidate?.yearsOfExperience ?? "未填写";
  const lines = [
    `# ${reportName} 初筛报告`,
    "",
    "## 基本信息",
    `- 候选人：${reportName}`,
    `- 岗位：${reportPosition}`,
    `- 工作年限：${reportYears}`,
    `- 电话：${result.parsedResume.phone ?? candidate?.phone ?? "未填写"}`,
    `- 邮箱：${result.parsedResume.email ?? candidate?.email ?? "未填写"}`,
    `- AI Base URL：${conclusion.screeningBaseUrl ?? "未记录"}`,
    `- 批次 ID：${task.batchId}`,
    `- 原始文件：${resolveTaskSourceFileName(task)}`,
    `- 初筛来源：${result.screeningSource ?? "未知"}`,
    "",
    "## 初筛结论",
    `- 结论：${conclusion.label}（${conclusion.score} 分）`,
    `- verdict：${conclusion.verdict}`,
    `- 建议操作：${conclusion.recommendedAction}`,
    "",
    "## 综合评价",
    conclusion.summary,
    "",
    "## 优点",
    ...(conclusion.strengths.length > 0 ? conclusion.strengths.map(item => `- ${item}`) : ["- 无"]),
    "",
    "## 顾虑",
    ...(conclusion.concerns.length > 0 ? conclusion.concerns.map(item => `- ${item}`) : ["- 无"]),
    "",
    "## 简历提取摘要",
    `- 技能：${result.parsedResume.skills.join("；") || "未提取"}`,
    `- 学历：${result.parsedResume.education.join("；") || "未提取"}`,
    `- 工作经历：${result.parsedResume.workHistory.join("；") || "未提取"}`,
  ];

  return lines.join("\n");
}

function isPdfSourceFile(sourceFile: { fileName: string; path: string }) {
  return extname(sourceFile.fileName || sourceFile.path).toLowerCase() === ".pdf";
}

function buildUnifiedPdfStem(entry: ExportableScreeningEntry, sourceFileName: string): string {
  const conclusion = entry.result.screeningConclusion as ImportScreeningConclusionWithMetadata;
  const roleTrack = inferRoleTrack(
    conclusion.candidatePosition ?? entry.result.parsedResume.position ?? entry.candidate?.position,
  );
  const baseName = resolveEntryDisplayName(entry, sourceFileName);
  const experience = formatExperienceForFileName(
    conclusion.candidateYearsOfExperience ?? entry.result.parsedResume.yearsOfExperience ?? entry.candidate?.yearsOfExperience,
  );
  const contact = resolveEntryContact(entry);
  return `${roleTrack}-${baseName}-${experience}-${contact}`;
}

function buildWechatExportText(entries: ExportableScreeningEntry[]): string {
  return entries.map(({ result, candidate }) => {
    const conclusion = result.screeningConclusion as ImportScreeningConclusionWithMetadata;
    const displayName = conclusion.candidateName ?? result.parsedResume.name ?? candidate?.name ?? "未命名候选人";
    const displayPosition = conclusion.candidatePosition ?? result.parsedResume.position ?? candidate?.position ?? "岗位待补充";
    const displayYears = conclusion.candidateYearsOfExperience ?? result.parsedResume.yearsOfExperience ?? "经验未填写";
    const conciseText = [
      conclusion.wechatConclusion?.trim() || `${conclusion.label}：${conclusion.summary}`,
      conclusion.wechatReason?.trim() || `原因：${conclusion.verdict === "reject" ? (conclusion.concerns[0] ?? conclusion.summary) : (conclusion.strengths[0] ?? conclusion.summary)}`,
      conclusion.wechatAction?.trim() || `建议：${conclusion.recommendedAction}`,
    ].join("\n");

    return [
      `${displayName}｜${displayPosition}｜${displayYears}`,
      conciseText,
    ].join("\n");
  }).join("\n\n");
}

function resolveReportSourceFile(entry: ExportableScreeningEntry): { path: string; fileName: string } | null {
  const taskFileName = resolveTaskSourceFileName(entry.task);
  if (!entry.task.originalPath.includes("#") && existsSync(entry.task.originalPath)) {
    return { path: entry.task.originalPath, fileName: taskFileName };
  }

  if (entry.task.normalizedPath && existsSync(entry.task.normalizedPath)) {
    return { path: entry.task.normalizedPath, fileName: taskFileName };
  }

  if (entry.resume?.filePath && existsSync(entry.resume.filePath)) {
    return { path: entry.resume.filePath, fileName: entry.resume.fileName };
  }

  return null;
}

async function exportScreeningCustomBundle(
  entries: ExportableScreeningEntry[],
  batches: Array<typeof importBatches.$inferSelect>,
  includeReports: boolean,
): Promise<ScreeningExportFile> {
  const zip = new JSZip();
  let fileCount = 0;

  for (const entry of entries) {
    const sourceFile = resolveReportSourceFile(entry);
    if (!sourceFile || !isPdfSourceFile(sourceFile)) {
      continue;
    }

    const fileStem = buildUnifiedPdfStem(entry, sourceFile.fileName);
    const pdfBytes = readFileSync(sourceFile.path);

    if (includeReports) {
      zip.file(`${fileStem}/简历-${fileStem}.pdf`, pdfBytes);
      zip.file(`${fileStem}/初筛报告-${fileStem}.md`, buildScreeningReportMarkdown(entry));
      fileCount += 2;
      continue;
    }

    zip.file(`简历-${fileStem}.pdf`, pdfBytes);
    fileCount += 1;
  }

  if (fileCount === 0) {
    throw new ImportScreeningExportError(ErrorCodes.IMPORT_EXPORT_EMPTY, "没有符合条件的 PDF 文件可导出", 422);
  }

  const buffer = await zip.generateAsync({ type: "uint8array", compression: "DEFLATE", compressionOptions: { level: 6 } });
  if (buffer.byteLength === 0) {
    throw new ImportScreeningExportError(ErrorCodes.IMPORT_EXPORT_EMPTY, "报告包没有可导出的文件内容", 422);
  }

  return {
    buffer,
    fileName: `${buildExportFileStem(batches)}.zip`,
    contentType: "application/zip",
  };
}

async function exportScreeningWechatText(
  entries: ExportableScreeningEntry[],
  batches: Array<typeof importBatches.$inferSelect>,
): Promise<ScreeningExportFile> {
  const content = buildWechatExportText(entries).trim();
  if (!content) {
    throw new ImportScreeningExportError(ErrorCodes.IMPORT_EXPORT_EMPTY, "筛选文案为空，无法导出", 422);
  }

  return {
    buffer: new TextEncoder().encode(content),
    fileName: `${buildExportFileStem(batches)}.txt`,
    contentType: "text/plain; charset=utf-8",
  };
}

export async function exportScreeningResults(request: ImportScreeningExportRequest): Promise<ScreeningExportFile> {
  const batchIds = ensureSelectedBatchIds(request.batchIds);
  const completedBatches = await loadCompletedBatches(batchIds);
  const entries = applyExportFilters(await collectExportableScreeningEntries(batchIds), request);

  switch (request.mode as ImportScreeningExportMode) {
    case "custom_bundle":
      return exportScreeningCustomBundle(entries, completedBatches, request.includeReports !== false);
    case "wechat_text":
      return exportScreeningWechatText(entries, completedBatches);
    default:
      throw new ImportScreeningExportError("VALIDATION_ERROR", "不支持的导出模式", 422);
  }
}
