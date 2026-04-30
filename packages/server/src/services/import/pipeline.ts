import { readFileSync, copyFileSync, existsSync, mkdirSync, unlinkSync, writeFileSync } from "node:fs";
import { join, basename, extname } from "node:path";
import JSZip from "jszip";
import { db } from "../../db";
import { artifacts, candidateWorkspaces, candidates, importBatches, importFileTasks, interviews, resumes } from "../../schema";
import { and, desc, eq, inArray } from "drizzle-orm";
import { classifyFileType, ImportErrorCodes, type FileType } from "./types";
import { extractText } from "./extractor";
import { parseResumeText } from "./parser";
import { generateImportScreeningConclusionWithAI, resolveImportScreeningReuseContext } from "./ai-screening";
import { buildScreeningReuseKey, computeFileHash, findReusableCompletedScreening } from "./hash-reuse";
import { verifyCandidateSchools } from "../university-verification";
import { config } from "../../config";
import { ErrorCodes, type ImportScreeningConclusion, type ImportScreeningExportMode, type ImportScreeningExportRequest, type ImportTaskResultData, type UniversityVerificationResult } from "@ims/shared";
import { extractPdfEntriesFromZip, MAX_IMPORT_FILE_SIZE_BYTES, ZipPdfError } from "./zip-pdf";
import { logError, logInfo, logWarn } from "../../utils/logger";

type ImportTaskResultWithConfidence = Omit<ImportTaskResultData, "screeningStatus" | "screeningSource" | "universityVerification"> & {
  extractionConfidence?: number | null;
  screeningStatus?: ImportTaskResultData["screeningStatus"] | "failed";
  screeningSource?: ImportTaskResultData["screeningSource"] | "failed" | null;
  universityVerification?: ImportTaskResultData["universityVerification"] | null;
};

type ImportScreeningConclusionWithMetadata = ImportScreeningConclusion & {
  candidateName?: string | null;
  candidatePosition?: string | null;
  candidateYearsOfExperience?: number | null;
  candidateEducation?: string[];
  candidateSchools?: string[];
  screeningBaseUrl?: string | null;
};

const ACTIVE_TASK_STATUSES = ["queued", "extracting", "text_extracting", "ocr_running", "parsing", "matching_candidate", "saving", "ai_screening"] as const;
const TERMINAL_TASK_STATUSES = ["done", "failed", "skipped"] as const;
const STAGE_PRIORITY = ["queued", "extracting", "text_extracting", "ocr_running", "parsing", "matching_candidate", "saving", "ai_screening"] as const;
const SUPPORTED_ARCHIVE_SUFFIXES = [".zip"];
const UNSUPPORTED_ARCHIVE_SUFFIXES = [".7z", ".rar", ".tar.gz", ".tgz", ".tar.bz2", ".tbz2", ".tar.xz", ".txz", ".tar"];
const UNSUPPORTED_IMAGE_SUFFIXES = [".png", ".jpg", ".jpeg", ".webp"];
const UNIVERSITY_NOT_FOUND_CONCERN = "院校信息可能异常：未在高校库中查到该院校，建议人工核实";
const UNIVERSITY_API_UNAVAILABLE_ERROR = "大学库查询暂不可用";
const UNIVERSITY_MISSING_EDUCATION_CONCERN = "院校信息缺失：当前简历未解析出教育经历或院校信息，建议人工核实";
const AI_SCREENING_MAX_ATTEMPTS = 3;
const AI_SCREENING_RETRY_BASE_DELAY_MS = 1_000;

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

async function generateImportScreeningConclusionWithRetry(
  input: Parameters<typeof generateImportScreeningConclusionWithAI>[0],
  context: { taskId: string; candidateId?: string | null },
): Promise<Awaited<ReturnType<typeof generateImportScreeningConclusionWithAI>>> {
  let lastError: unknown;

  for (let attempt = 1; attempt <= AI_SCREENING_MAX_ATTEMPTS; attempt += 1) {
    try {
      return await generateImportScreeningConclusionWithAI(input);
    } catch (error) {
      lastError = error;
      if (attempt >= AI_SCREENING_MAX_ATTEMPTS) break;

      const delayMs = AI_SCREENING_RETRY_BASE_DELAY_MS * 2 ** (attempt - 1);
      logWarn("import.ai_screening.retry", {
        taskId: context.taskId,
        candidateId: context.candidateId ?? null,
        attempt,
        nextAttempt: attempt + 1,
        delayMs,
        error: formatErrorMessage(error),
      });
      await sleep(delayMs);
    }
  }

  throw lastError instanceof Error ? lastError : new Error(String(lastError ?? "AI 初筛失败"));
}

function buildAiScreeningFailedResult(
  result: ImportTaskResultWithConfidence,
  error: unknown,
): ImportTaskResultWithConfidence {
  return {
    ...result,
    screeningStatus: "failed",
    screeningSource: "failed",
    screeningError: `AI 初筛重试 ${AI_SCREENING_MAX_ATTEMPTS} 次后仍失败：${formatErrorMessage(error)}`,
    screeningConclusion: null,
    universityVerification: null,
  };
}

function formatErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error || "未知错误");
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function resolveScreeningReuseMetadata(fileHash: string | null, templateId?: string | null) {
  if (!fileHash) {
    return {
      screeningReuseKey: null,
      templateInfo: undefined,
    };
  }

  const reuseContext = await resolveImportScreeningReuseContext(templateId ?? undefined);
  return {
    screeningReuseKey: buildScreeningReuseKey({
      fileHash,
      promptSnapshot: reuseContext.promptSnapshot,
      templateId: reuseContext.templateInfo?.templateId,
      templateVersion: reuseContext.templateInfo?.templateVersion,
      screeningProviderId: reuseContext.screeningProviderId,
      screeningModel: reuseContext.screeningModel,
      normalizedBaseURL: reuseContext.normalizedBaseURL,
    }),
    templateInfo: reuseContext.templateInfo,
  };
}

function createBaseImportTaskResult(
  parsedResume: ImportTaskResultData["parsedResume"],
  extractionConfidence: number | null | undefined,
  options: {
    fileHash: string | null;
    screeningReuseKey?: string | null;
    templateInfo?: ImportTaskResultData["templateInfo"];
  },
): ImportTaskResultWithConfidence {
  return {
    parsedResume,
    extractionConfidence,
    screeningStatus: "not_requested",
    screeningSource: null,
    screeningError: null,
    screeningConclusion: null,
    fileHash: options.fileHash,
    screeningReuseKey: options.screeningReuseKey ?? null,
    reusedFromTaskId: null,
    reusedAt: null,
    templateInfo: options.templateInfo,
    universityVerification: null,
  };
}

function buildCompletedAiScreeningResult(
  result: ImportTaskResultWithConfidence,
  aiConclusion: ImportScreeningConclusion,
): ImportTaskResultWithConfidence {
  return {
    ...result,
    screeningStatus: "completed",
    screeningSource: "ai",
    screeningError: null,
    screeningConclusion: aiConclusion,
    templateInfo: aiConclusion.templateInfo ?? result.templateInfo,
  };
}

function buildReusedScreeningResult(
  result: ImportTaskResultWithConfidence,
  reused: { taskId: string; result: ImportTaskResultData },
): ImportTaskResultWithConfidence {
  return {
    ...result,
    screeningStatus: "completed",
    screeningSource: "reused",
    screeningError: null,
    screeningConclusion: reused.result.screeningConclusion ?? null,
    templateInfo: reused.result.templateInfo ?? reused.result.screeningConclusion?.templateInfo ?? result.templateInfo,
    universityVerification: reused.result.universityVerification ?? reused.result.screeningConclusion?.universityVerification ?? null,
    reusedFromTaskId: reused.taskId,
    reusedAt: Date.now(),
  };
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

    if (sourceType === "unsupported_archive" || sourceType === "unsupported_image") {
      throw new ImportValidationError(buildUnsupportedSourceMessage(sourcePath));
    }

    throw new ImportValidationError("仅支持导入 PDF 或 ZIP 压缩包");
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

export async function processFile(taskId: string, filePath: string, fileTypeHint?: FileType, templateId?: string | null): Promise<void> {
  if (await markTaskCancelledIfNeeded(taskId)) {
    logInfo("import.file.cancelled_before_start", { taskId });
    await updateBatchProgress(taskId);
    return;
  }

  const startedAt = Date.now();
  const fileType = fileTypeHint ?? detectFileType(filePath);
  logInfo("import.file.start", { taskId, fileType, fileExt: extname(filePath).toLowerCase(), hasTemplate: Boolean(templateId) });
  await updateTask(taskId, { status: "extracting", stage: "extracting", updatedAt: Date.now() });

  try {
    const unsupportedMessage = getUnsupportedImportMessage(fileType, filePath);
    if (unsupportedMessage) {
      logWarn("import.file.unsupported", { taskId, fileType, fileExt: extname(filePath).toLowerCase(), message: unsupportedMessage });
      await updateTask(taskId, { status: "skipped", stage: "classifying", errorCode: ImportErrorCodes.UNSUPPORTED_TYPE, errorMessage: unsupportedMessage, updatedAt: Date.now() });
      await updateBatchProgress(taskId);
      return;
    }

    const fileHash = computeFileHash(filePath);

    await updateTask(taskId, { status: "text_extracting", stage: "text_extracting", fileHash, updatedAt: Date.now() });

    let extractResult: Awaited<ReturnType<typeof extractText>>;
    try {
      extractResult = await extractText(filePath, "pdf");
    } catch (err) {
      logError("import.file.extract_failed", err, { taskId, fileType, fileExt: extname(filePath).toLowerCase() });
      await updateTask(taskId, { status: "failed", stage: "text_extracting", errorCode: ImportErrorCodes.TEXT_EXTRACT_FAILED, errorMessage: (err as Error).message, updatedAt: Date.now() });
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
    logInfo("import.file.candidate_matched", { taskId, candidateId, matchType: candidateMatch.created ? "created" : "existing" });

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
      ocrConfidence: extractResult.confidence, fileHash, createdAt: Date.now(),
    });

    const screeningReuseMetadata = await resolveScreeningReuseMetadata(fileHash, templateId ?? undefined);
    let result = createBaseImportTaskResult(parsed, extractResult.confidence, {
      fileHash,
      screeningReuseKey: screeningReuseMetadata.screeningReuseKey,
      templateInfo: screeningReuseMetadata.templateInfo,
    });

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
        const reusable = result.screeningReuseKey
          ? await findReusableCompletedScreening({
              excludeTaskId: taskId,
              fileHash,
              screeningReuseKey: result.screeningReuseKey,
            })
          : null;

        if (reusable) {
          result = buildReusedScreeningResult(result, reusable);
          logInfo("import.file.ai_screening.finish", { taskId, candidateId, source: "reused", reusedFromTaskId: reusable.taskId });
        } else {
          logInfo("import.file.ai_screening.start", { taskId, candidateId, hasTemplate: Boolean(templateId) });
          const aiConclusion = await generateImportScreeningConclusionWithRetry({
            parsed,
            confidence: extractResult.confidence,
            fileName: basename(filePath),
            templateId: templateId ?? undefined,
          }, { taskId, candidateId });

          result = buildCompletedAiScreeningResult(result, aiConclusion);
          logInfo("import.file.ai_screening.finish", { taskId, candidateId, source: "ai" });
        }
      } catch (error) {
        logWarn("import.file.ai_screening.failed", { taskId, candidateId, error: formatErrorMessage(error) });
        result = buildAiScreeningFailedResult(result, error);
      }

      result = result.screeningConclusion && result.screeningSource !== "reused"
        ? await attachUniversityVerificationResult(parsed, result)
        : result;
      if (result.screeningConclusion) {
        const schoolName = extractSchoolName(result.screeningConclusion);
        if (schoolName) {
          await updateCandidateOrganizationName(candidateId, schoolName);
        }
      }
    }

    if (await markTaskCancelledIfNeeded(taskId)) {
      await cleanupImportedResumeIfExists(resumeId);
      if (candidateMatch.created) {
        await cleanupImportedCandidateIfUnused(candidateId);
      }
      await updateBatchProgress(taskId);
      return;
    }

    await updateTask(taskId, { status: "done", stage: "completed", candidateId, resultJson: JSON.stringify(result), fileHash, updatedAt: Date.now() });
    await updateBatchProgress(taskId);
    logInfo("import.file.finish", {
      taskId,
      candidateId,
      durationMs: Date.now() - startedAt,
      screeningStatus: result.screeningStatus,
      screeningSource: result.screeningSource,
    });
  } catch (err) {
    if (err instanceof ImportCancelledError) {
      logWarn("import.file.cancelled", { taskId, durationMs: Date.now() - startedAt });
      await markTaskCancelledIfNeeded(taskId);
      await updateBatchProgress(taskId);
      return;
    }
    logError("import.file.failed", err, { taskId, fileType, fileExt: extname(filePath).toLowerCase(), durationMs: Date.now() - startedAt });
    await updateTask(taskId, { status: "failed", errorCode: ImportErrorCodes.SAVE_FAILED, errorMessage: (err as Error).message, updatedAt: Date.now() });
    await updateBatchProgress(taskId);
  }
}

async function attachUniversityVerificationResult(
  parsed: ImportTaskResultData["parsedResume"],
  result: ImportTaskResultWithConfidence,
  options: { forceRefresh?: boolean } = {},
): Promise<ImportTaskResultWithConfidence> {
  const conclusion = result.screeningConclusion;
  if (!conclusion) {
    return { ...result, universityVerification: null };
  }

  try {
    // Priority 1: AI 提供了干净学校名 → 直接查询
    if (conclusion.candidateSchools && conclusion.candidateSchools.length > 0) {
      const primary = (await verifyCandidateSchools(conclusion.candidateSchools, conclusion.candidateSchools, options))[0] ?? null;
      if (primary) return wrapVerificationResult(result, primary);
    }

    // Priority 2: AI 提供了教育详情 → 从中提取学校名
    if (conclusion.candidateEducation && conclusion.candidateEducation.length > 0) {
      const primary = (await verifyCandidateSchools(conclusion.candidateEducation, undefined, options))[0] ?? null;
      if (primary) return wrapVerificationResult(result, primary);
    }

    // Priority 3: 规则解析兜底
    if (parsed.education.length === 0) {
      if (result.screeningConclusion) {
        return {
          ...result,
          screeningConclusion: {
            ...result.screeningConclusion,
            concerns: appendUniqueItem(result.screeningConclusion.concerns, UNIVERSITY_MISSING_EDUCATION_CONCERN),
          },
          universityVerification: null,
        };
      }
      return { ...result, universityVerification: null };
    }
    const primary = (await verifyCandidateSchools(parsed.education, undefined, options))[0] ?? null;
    if (primary) return wrapVerificationResult(result, primary);

    return { ...result, universityVerification: null };
  } catch (error) {
    console.warn(`[import] university verification failed: ${error instanceof Error ? error.message : String(error)}`);
    return {
      ...result,
      screeningError: appendUniqueMessage(result.screeningError, UNIVERSITY_API_UNAVAILABLE_ERROR),
      universityVerification: null,
    };
  }
}

function wrapVerificationResult(
  result: ImportTaskResultWithConfidence,
  verification: UniversityVerificationResult,
): ImportTaskResultWithConfidence {
  if (verification.verdict === "api_failed") {
    console.warn(
      `[import] university verification unavailable for ${verification.schoolName ?? "unknown school"}: ${verification.detail ?? "unknown reason"}`,
    );
  }
  return {
    ...result,
    screeningError: result.screeningError,
    screeningConclusion: applyUniversityVerificationToConclusion(result.screeningConclusion!, verification),
    universityVerification: verification,
  };
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

  return {
    ...conclusion,
    concerns: appendUniqueItem(conclusion.concerns, UNIVERSITY_NOT_FOUND_CONCERN),
    universityVerification: verification,
  };
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
function extractSchoolName(conclusion: ImportScreeningConclusion): string | null {
  if (conclusion.universityVerification?.schoolName) {
    return conclusion.universityVerification.schoolName;
  }
  if (conclusion.candidateSchools && conclusion.candidateSchools.length > 0) {
    const first = conclusion.candidateSchools.find(s => s?.trim());
    if (first) return first.trim();
  }
  if (conclusion.candidateEducation && conclusion.candidateEducation.length > 0) {
    return extractSchoolNamesFromEducation(conclusion.candidateEducation)[0] ?? null;
  }
  return null;
}

function extractSchoolNamesFromEducation(educationItems: string[]): string[] {
  const seen = new Set<string>();
  const schools: string[] = [];

  for (const item of educationItems) {
    const schoolName = extractSchoolNameFromEducation(item);
    if (!schoolName || seen.has(schoolName)) continue;
    seen.add(schoolName);
    schools.push(schoolName);
    if (schools.length >= 5) break;
  }

  return schools;
}

function extractSchoolNameFromEducation(education: string): string | null {
  const parenthesizedSchool = education.match(/([\u4e00-\u9fa5]{2,30}(?:大学|学院|学校)[（(][^）)]+[）)])/);
  if (parenthesizedSchool?.[1]?.trim()) {
    return parenthesizedSchool[1].trim();
  }

  const normalized = education
    .replace(/\([^)]*\)/g, " ")
    .replace(/[（）]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!normalized) return null;

  const compact = normalized.replace(/\s+/g, "");
  const chineseMatches = Array.from(compact.matchAll(/[\u4e00-\u9fa5]{2,30}(?:大学|学院|学校)/g));
  for (const match of chineseMatches) {
    const candidate = match[0]
      .replace(/^(?:教育背景|教育经历|毕业院校|毕业学校|学校名称|学历|院校|毕业于|就读于|我的|本人|是|于|在)+/, "")
      .trim();
    if (candidate.length >= 4) return candidate;
  }

  const englishMatch = normalized.match(/([A-Za-z][A-Za-z·.&\- ]{2,60}(?:University|College|Institute))/i);
  if (englishMatch?.[1]?.trim()) {
    return englishMatch[1].trim();
  }

  return normalized
    .split(/\s+/)
    .find((part) => /大学|学院|学校|University|College|Institute/i.test(part))
    ?.trim() ?? null;
}

async function updateCandidateOrganizationName(candidateId: string, schoolName: string): Promise<void> {
  const normalizedSchoolName = schoolName.trim();
  if (!normalizedSchoolName) return;

  const [candidate] = await db.select({ organizationName: candidates.organizationName })
    .from(candidates)
    .where(eq(candidates.id, candidateId))
    .limit(1);
  if (candidate && !candidate.organizationName?.trim()) {
    await db.update(candidates)
      .set({ organizationName: normalizedSchoolName, updatedAt: Date.now() })
      .where(eq(candidates.id, candidateId));
  }
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
  const unsupportedMessage = getUnsupportedImportMessage(fileType, filePath);
  if (unsupportedMessage) {
    throw new Error(unsupportedMessage);
  }

  const fileHash = computeFileHash(filePath);
  const extractResult = await extractText(filePath, "pdf");
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
    fileHash,
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

async function updateTask(taskId: string, updates: Partial<{ status: string; stage: string | null; errorCode: string | null; errorMessage: string | null; candidateId: string | null; resultJson: string | null; fileHash: string | null; updatedAt: number }>) {
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
  const effectiveTemplateId = templateId ?? batch.templateId ?? undefined;

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
    const screeningReuseMetadata = await resolveScreeningReuseMetadata(task.fileHash, effectiveTemplateId);
    const nextResult: ImportTaskResultWithConfidence = {
      ...createBaseImportTaskResult(result.parsedResume, result.extractionConfidence, {
        fileHash: task.fileHash,
        screeningReuseKey: screeningReuseMetadata.screeningReuseKey,
        templateInfo: screeningReuseMetadata.templateInfo,
      }),
      screeningStatus: "queued",
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
    const screeningReuseMetadata = await resolveScreeningReuseMetadata(task.fileHash, effectiveTemplateId);
    let nextResult: ImportTaskResultWithConfidence = {
      ...createBaseImportTaskResult(result.parsedResume, result.extractionConfidence, {
        fileHash: task.fileHash,
        screeningReuseKey: screeningReuseMetadata.screeningReuseKey,
        templateInfo: screeningReuseMetadata.templateInfo,
      }),
      screeningStatus: "running",
    };

    // Mark this specific task as actively running before AI call
    const runningResult: ImportTaskResultWithConfidence = {
      ...createBaseImportTaskResult(result.parsedResume, result.extractionConfidence, {
        fileHash: task.fileHash,
        screeningReuseKey: screeningReuseMetadata.screeningReuseKey,
        templateInfo: screeningReuseMetadata.templateInfo,
      }),
      screeningStatus: "running",
    };
    await updateTask(task.id, {
      status: "ai_screening",
      stage: "ai_screening",
      resultJson: JSON.stringify(runningResult),
      updatedAt: Date.now(),
    });
    await refreshBatchProgress(batchId);

    try {
      const reusable = task.fileHash && nextResult.screeningReuseKey
        ? await findReusableCompletedScreening({
            excludeTaskId: task.id,
            fileHash: task.fileHash,
            screeningReuseKey: nextResult.screeningReuseKey,
          })
        : null;

      if (reusable) {
        nextResult = buildReusedScreeningResult(nextResult, reusable);
      } else {
        const confidence = await resolveTaskConfidence(task, result);
        const aiConclusion = await generateImportScreeningConclusionWithRetry({
          parsed: result.parsedResume,
          confidence,
          fileName: basename(task.originalPath.split("#").pop() ?? task.originalPath),
          templateId: effectiveTemplateId,
        }, { taskId: task.id, candidateId: task.candidateId });
        nextResult = buildCompletedAiScreeningResult(nextResult, aiConclusion);
      }
    } catch (error) {
      nextResult = buildAiScreeningFailedResult(nextResult, error);
    }

    nextResult = nextResult.screeningConclusion && nextResult.screeningSource !== "reused"
      ? await attachUniversityVerificationResult(result.parsedResume, nextResult)
      : nextResult;
    if (nextResult.screeningConclusion && task.candidateId) {
      const schoolName = extractSchoolName(nextResult.screeningConclusion);
      if (schoolName) {
        await updateCandidateOrganizationName(task.candidateId, schoolName);
      }
    }

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
  const [batch] = await db.select({ templateId: importBatches.templateId }).from(importBatches).where(eq(importBatches.id, task.batchId)).limit(1);
  const effectiveTemplateId = templateId ?? batch?.templateId ?? undefined;

  const result = parseImportTaskResult(task.resultJson);
  if (!result?.parsedResume) {
    return { retried: false, screeningStatus: "not_requested" };
  }

  const screeningReuseMetadata = await resolveScreeningReuseMetadata(task.fileHash, effectiveTemplateId);

  const nextResult: ImportTaskResultWithConfidence = {
    ...createBaseImportTaskResult(result.parsedResume, result.extractionConfidence, {
      fileHash: task.fileHash,
      screeningReuseKey: screeningReuseMetadata.screeningReuseKey,
      templateInfo: screeningReuseMetadata.templateInfo,
    }),
    screeningStatus: "running",
  };

  await updateTask(taskId, {
    status: "ai_screening",
    stage: "ai_screening",
    resultJson: JSON.stringify(nextResult),
    updatedAt: Date.now(),
  });

  await updateBatchProgress(taskId);

  try {
    const reusable = task.fileHash && nextResult.screeningReuseKey
      ? await findReusableCompletedScreening({
          excludeTaskId: taskId,
          fileHash: task.fileHash,
          screeningReuseKey: nextResult.screeningReuseKey,
        })
      : null;

    if (reusable) {
      Object.assign(nextResult, buildReusedScreeningResult(nextResult, reusable));
    } else {
      const confidence = await resolveTaskConfidence(task, result);
      const aiConclusion = await generateImportScreeningConclusionWithRetry({
        parsed: result.parsedResume,
        confidence,
        fileName: basename(task.originalPath.split("#").pop() ?? task.originalPath),
        templateId: effectiveTemplateId,
      }, { taskId, candidateId: task.candidateId });
      Object.assign(nextResult, buildCompletedAiScreeningResult(nextResult, aiConclusion));
    }
  } catch (error) {
    Object.assign(nextResult, buildAiScreeningFailedResult(nextResult, error));
  }

  if (nextResult.screeningConclusion && nextResult.screeningSource !== "reused") {
    Object.assign(nextResult, await attachUniversityVerificationResult(result.parsedResume, nextResult));
  }
  if (nextResult.screeningConclusion && task.candidateId) {
    const schoolName = extractSchoolName(nextResult.screeningConclusion);
    if (schoolName) {
      await updateCandidateOrganizationName(task.candidateId, schoolName);
    }
  }

  await updateTask(taskId, {
    status: "done",
    stage: "completed",
    resultJson: JSON.stringify(nextResult),
    updatedAt: Date.now(),
  });

  await updateBatchProgress(taskId);

  return { retried: true, screeningStatus: nextResult.screeningStatus ?? "not_requested" };
}

export async function retryFileUniversityVerification(taskId: string): Promise<{ retried: boolean; universityVerification: UniversityVerificationResult | null }> {
  const [task] = await db.select().from(importFileTasks).where(eq(importFileTasks.id, taskId)).limit(1);
  if (!task) {
    return { retried: false, universityVerification: null };
  }

  const result = parseImportTaskResult(task.resultJson);
  if (!result?.parsedResume || !result.screeningConclusion) {
    return { retried: false, universityVerification: null };
  }

  const nextResult = await attachUniversityVerificationResult(result.parsedResume, result, { forceRefresh: true });
  if (nextResult.screeningConclusion && task.candidateId) {
    const schoolName = extractSchoolName(nextResult.screeningConclusion);
    if (schoolName) {
      await updateCandidateOrganizationName(task.candidateId, schoolName);
    }
  }

  await updateTask(taskId, {
    resultJson: JSON.stringify(nextResult),
    updatedAt: Date.now(),
  });

  await updateBatchProgress(taskId);

  return {
    retried: true,
    universityVerification: nextResult.universityVerification ?? null,
  };
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

function detectImportSourceType(filePath: string): "archive" | "pdf" | "unsupported_archive" | "unsupported_image" | "unknown" {
  if (findMatchingSuffix(filePath, SUPPORTED_ARCHIVE_SUFFIXES)) {
    return "archive";
  }
  if (findMatchingSuffix(filePath, UNSUPPORTED_ARCHIVE_SUFFIXES)) {
    return "unsupported_archive";
  }
  if (findMatchingSuffix(filePath, UNSUPPORTED_IMAGE_SUFFIXES)) {
    return "unsupported_image";
  }
  if (filePath.toLowerCase().endsWith(".pdf")) {
    return "pdf";
  }

  return detectImportSourceTypeFromContent(filePath);
}

function findMatchingSuffix(filePath: string, suffixes: readonly string[]): string | null {
  const normalized = filePath.toLowerCase();
  return suffixes.find((suffix) => normalized.endsWith(suffix)) ?? null;
}

function buildUnsupportedSourceMessage(filePath: string): string {
  const imageSuffix = findMatchingSuffix(filePath, UNSUPPORTED_IMAGE_SUFFIXES);
  if (imageSuffix) {
    return `图片导入已不再支持（${imageSuffix}），图片 OCR 已移除，请先转换为可搜索 PDF 后再导入`;
  }

  const archiveSuffix = findMatchingSuffix(filePath, UNSUPPORTED_ARCHIVE_SUFFIXES);
  if (archiveSuffix) {
    return `仅支持导入 PDF 或 ZIP 压缩包，不再支持 ${archiveSuffix} 归档格式`;
  }

  return "仅支持导入 PDF 或 ZIP 压缩包";
}

function getUnsupportedImportMessage(fileType: FileType, filePath: string): string | null {
  if (fileType === "pdf") {
    return null;
  }

  if (fileType === "zip") {
    return "ZIP 压缩包仅支持作为批量导入入口，不能作为单个简历文件处理";
  }

  if (fileType === "png" || fileType === "jpg" || fileType === "jpeg" || fileType === "webp") {
    return buildUnsupportedSourceMessage(filePath);
  }

  return `暂不支持的文件类型：${extname(filePath) || "unknown"}`;
}

function isPdfBuffer(buffer: Buffer) {
  if (buffer.byteLength < 5) {
    return false;
  }

  return buffer.subarray(0, 5).toString("ascii") === "%PDF-";
}

async function expandArchiveImportTasks(batchId: string, archivePath: string): Promise<PreparedImportTask[]> {
  let archiveEntries: Awaited<ReturnType<typeof extractPdfEntriesFromZip>>;
  try {
    archiveEntries = await extractPdfEntriesFromZip(archivePath, {
      archiveReadErrorMessage: "ZIP 压缩包读取失败",
      archiveExtractErrorMessage: "ZIP 压缩包解压失败",
      invalidEntryMessage: "压缩包内存在无法解析的 PDF 文件",
      emptyArchiveMessage: "压缩包内没有可导入的 PDF 文件",
      archiveTooLargeMessage: "ZIP 压缩包过大",
      entryTooLargeMessage: "压缩包内文件过大",
      totalTooLargeMessage: "ZIP 压缩包解压后的总文件过大",
      tooManyEntriesMessage: "ZIP 压缩包内文件数量过多",
      strictPdfOnly: false,
    });
  } catch (error) {
    if (error instanceof ZipPdfError) {
      throw new ImportValidationError(error.message);
    }
    throw error;
  }

  const stagingDir = join(config.dataDir, "import-staging", batchId);
  mkdirSync(stagingDir, { recursive: true });

  const tasks: PreparedImportTask[] = [];
  for (const { entryName, buffer } of archiveEntries) {
    const fileType = classifyFileType(extname(entryName));
    const entryPath = `${archivePath}#${entryName}`;

    if (buffer.byteLength > MAX_IMPORT_FILE_SIZE_BYTES) {
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
