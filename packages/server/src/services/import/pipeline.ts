import { readFileSync, copyFileSync, mkdirSync, unlinkSync, writeFileSync } from "node:fs";
import { join, basename, extname } from "node:path";
import JSZip from "jszip";
import { db } from "../../db";
import { artifacts, candidateWorkspaces, candidates, importBatches, importFileTasks, interviews, resumes } from "../../schema";
import { and, eq, inArray } from "drizzle-orm";
import { classifyFileType, ImportErrorCodes, type FileType } from "./types";
import { extractText } from "./extractor";
import { parseResumeText } from "./parser";
import { generateImportScreeningConclusionWithAI } from "./ai-screening";
import { config } from "../../config";
import type { ImportTaskResultData } from "@ims/shared";

const MAX_FILE_SIZE_BYTES = 50 * 1024 * 1024;
const ACTIVE_TASK_STATUSES = ["queued", "extracting", "text_extracting", "ocr_running", "parsing", "matching_candidate", "saving", "ai_screening"] as const;
const TERMINAL_TASK_STATUSES = ["done", "failed", "skipped"] as const;
const STAGE_PRIORITY = ["queued", "extracting", "text_extracting", "ocr_running", "parsing", "matching_candidate", "saving", "ai_screening"] as const;

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
    const fileType = detectFileType(sourcePath);

    if (fileType === "zip") {
      tasks.push(...await expandZipImportTasks(batchId, sourcePath));
      continue;
    }

    tasks.push({
      originalPath: sourcePath,
      normalizedPath: null,
      fileType,
      status: fileType === "unknown" ? "skipped" : "queued",
      errorCode: fileType === "unknown" ? ImportErrorCodes.UNSUPPORTED_TYPE : null,
      errorMessage: fileType === "unknown" ? `unsupported: ${extname(sourcePath) || "unknown"}` : null,
    });
  }

  return tasks;
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

    let result: ImportTaskResultData = {
      parsedResume: parsed,
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

function buildImportScreeningConclusion(parsed: { phone: string | null; email: string | null; yearsOfExperience: number | null; skills: string[]; education: string[]; workHistory: string[]; rawText: string }, confidence: number) {
  let score = 35;
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
    score += 20;
    strengths.push(`有 ${years} 年以上相关经验`);
  } else if (years >= 3) {
    score += 14;
    strengths.push(`具备 ${years} 年相关经验`);
  } else if (years >= 1) {
    score += 8;
  } else {
    concerns.push("工作年限信息较弱，需要进一步确认资历");
  }

  if (parsed.skills.length >= 8) {
    score += 18;
    strengths.push(`技能覆盖较广（${parsed.skills.slice(0, 4).join(" / ")}）`);
  } else if (parsed.skills.length >= 4) {
    score += 10;
    strengths.push(`已识别关键技能：${parsed.skills.slice(0, 3).join(" / ")}`);
  } else if (parsed.skills.length > 0) {
    score += 4;
  } else {
    concerns.push("技能关键词较少，建议人工复核简历内容");
  }

  if (parsed.workHistory.length >= 2) {
    score += 8;
    strengths.push("工作经历描述较完整");
  } else if (parsed.workHistory.length === 0) {
    concerns.push("工作经历提取不足，可能需要人工阅读原简历");
  }

  if (parsed.education.length > 0) {
    score += 4;
  }

  if (parsed.rawText.length < 300) {
    score -= 20;
    concerns.push("文本提取内容过少，结论可信度较低");
  } else if (parsed.rawText.length < 800) {
    score -= 8;
  }

  if (confidence >= 85) {
    score += 8;
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

  return {
    verdict,
    label,
    score,
    summary,
    strengths: strengths.slice(0, 3),
    concerns: concerns.slice(0, 3),
    recommendedAction,
  };
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
  if (parsed.phone) {
    const [existing] = await db.select({ id: candidates.id }).from(candidates).where(eq(candidates.phone, parsed.phone)).limit(1);
    if (existing) return { id: existing.id, created: false };
  }
  if (parsed.email) {
    const [existing] = await db.select({ id: candidates.id }).from(candidates).where(eq(candidates.email, parsed.email)).limit(1);
    if (existing) return { id: existing.id, created: false };
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

export async function rerunImportBatchScreening(batchId: string): Promise<{ retriedCount: number }> {
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
    autoScreen: true,
    completedAt: null,
  }).where(eq(importBatches.id, batchId));

  for (const { task, result } of runnableTasks) {
    const nextResult: ImportTaskResultData = {
      parsedResume: result.parsedResume,
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
    let nextResult: ImportTaskResultData = {
      parsedResume: result.parsedResume,
      screeningStatus: "running",
      screeningSource: null,
      screeningError: null,
      screeningConclusion: null,
    };

    try {
      const aiConclusion = await generateImportScreeningConclusionWithAI({
        parsed: result.parsedResume,
        confidence: resolveTaskConfidence(task, result),
        fileName: basename(task.originalPath.split("#").pop() ?? task.originalPath),
      });
      nextResult = {
        ...nextResult,
        screeningStatus: "completed",
        screeningSource: "ai",
        screeningConclusion: aiConclusion,
      };
    } catch (error) {
      nextResult = {
        ...nextResult,
        screeningStatus: "completed",
        screeningSource: "heuristic",
        screeningError: error instanceof Error ? error.message : "AI 初筛失败，已回退规则结论",
        screeningConclusion: buildImportScreeningConclusion(result.parsedResume, resolveTaskConfidence(task, result)),
      };
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

function parseImportTaskResult(resultJson: string | null): ImportTaskResultData | null {
  if (!resultJson?.trim()) {
    return null;
  }

  try {
    return JSON.parse(resultJson) as ImportTaskResultData;
  } catch {
    return null;
  }
}

function resolveTaskConfidence(_task: { id: string }, _result: ImportTaskResultData) {
  return 85;
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

async function expandZipImportTasks(batchId: string, archivePath: string): Promise<PreparedImportTask[]> {
  let zip: JSZip;

  try {
    zip = await JSZip.loadAsync(readFileSync(archivePath));
  } catch (error) {
    return [{
      originalPath: archivePath,
      normalizedPath: null,
      fileType: "zip",
      status: "skipped",
      errorCode: ImportErrorCodes.PARSE_FAILED,
      errorMessage: `failed to read zip archive: ${(error as Error).message}`,
    }];
  }

  const archiveEntries = Object.values(zip.files)
    .filter(entry => !entry.dir)
    .map((entry) => ({ entry, fileType: classifyFileType(extname(entry.name)) }))
    .filter(({ fileType }) => !["unknown", "zip"].includes(fileType));

  if (archiveEntries.length === 0) {
    return [{
      originalPath: archivePath,
      normalizedPath: null,
      fileType: "zip",
      status: "skipped",
      errorCode: ImportErrorCodes.UNSUPPORTED_TYPE,
      errorMessage: "archive contains no supported resume files",
    }];
  }

  const stagingDir = join(config.dataDir, "import-staging", batchId);
  mkdirSync(stagingDir, { recursive: true });

  const tasks: PreparedImportTask[] = [];
  for (const { entry, fileType } of archiveEntries) {
    const buffer = await entry.async("nodebuffer");
    const entryPath = `${archivePath}#${entry.name}`;

    if (buffer.byteLength > MAX_FILE_SIZE_BYTES) {
      tasks.push({
        originalPath: entryPath,
        normalizedPath: null,
        fileType,
        status: "skipped",
        errorCode: ImportErrorCodes.ARCHIVE_TOO_LARGE,
        errorMessage: `archive entry too large: ${basename(entry.name)}`,
      });
      continue;
    }

    const stagedPath = join(stagingDir, `${crypto.randomUUID()}${extname(entry.name)}`);
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
