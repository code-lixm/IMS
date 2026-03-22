/**
 * Import pipeline coordinator.
 *
 * Orchestrates a single file: extract text → parse → match/create candidate → save resume.
 *
 * Public API:
 *   processFile(taskId: string, filePath: string, fileType: FileType): Promise<void>
 */

import { readFileSync, copyFileSync, mkdirSync, existsSync } from "node:fs";
import { join, basename, extname } from "node:path";
import { db } from "../../db";
import { candidates, resumes, importBatches, importFileTasks } from "../../schema";
import { eq } from "drizzle-orm";
import { classifyFileType, ImportErrorCodes, type FileType } from "./types";
import { extractText } from "./extractor";
import { parseResumeText } from "./parser";
import { config } from "../../config";

// ---------------------------------------------------------------------------
// Limits
// ---------------------------------------------------------------------------

const MAX_ARCHIVE_DEPTH = 3;
const MAX_ARCHIVE_ENTRIES = 500;
const MAX_FILE_SIZE_BYTES = 50 * 1024 * 1024; // 50 MB

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export async function processFile(
  taskId: string,
  filePath: string,
  fileTypeHint?: FileType
): Promise<void> {
  const fileType = fileTypeHint ?? detectFileType(filePath);

  // Update stage: extracting
  await updateTask(taskId, { status: "extracting", stage: "extracting", updatedAt: Date.now() });

  try {
    // ── Unsupported type ───────────────────────────────────────────────────
    if (fileType === "unknown" || fileType === "zip") {
      await updateTask(taskId, {
        status: "skipped",
        stage: "classifying",
        errorCode: ImportErrorCodes.UNSUPPORTED_TYPE,
        errorMessage: `unsupported file type: ${extname(filePath)}`,
        updatedAt: Date.now(),
      });
      await updateBatchProgress(taskId);
      return;
    }

    // ── Text extraction ───────────────────────────────────────────────────
    let extractResult: Awaited<ReturnType<typeof extractText>>;
    try {
      await updateTask(taskId, {
        status: fileType === "pdf" ? "text_extracting" : "ocr_running",
        stage: fileType === "pdf" ? "text_extracting" : "ocr_running",
        updatedAt: Date.now(),
      });

      extractResult = await extractText(filePath, fileType as "pdf" | "png" | "jpg" | "jpeg" | "webp");
    } catch (err) {
      await updateTask(taskId, {
        status: "failed",
        stage: "text_extracting",
        errorCode: fileType === "pdf" ? ImportErrorCodes.TEXT_EXTRACT_FAILED : ImportErrorCodes.OCR_FAILED,
        errorMessage: (err as Error).message,
        updatedAt: Date.now(),
      });
      await updateBatchProgress(taskId);
      return;
    }

    // ── Parsing ───────────────────────────────────────────────────────────
    await updateTask(taskId, { status: "parsing", stage: "parsing", updatedAt: Date.now() });

    const parsed = parseResumeText(extractResult.text);

    // ── Candidate matching ─────────────────────────────────────────────────
    await updateTask(taskId, { status: "matching_candidate", stage: "matching_candidate", updatedAt: Date.now() });

    const candidateId = await matchOrCreateCandidate(parsed);

    // ── Save resume ────────────────────────────────────────────────────────
    await updateTask(taskId, { status: "saving", stage: "saving", updatedAt: Date.now() });

    const resumeId = `res_${crypto.randomUUID()}`;
    const destDir = join(config.filesDir, "resumes");
    mkdirSync(destDir, { recursive: true });
    const destPath = join(destDir, `${resumeId}${extname(filePath)}`);

    try {
      copyFileSync(filePath, destPath);
    } catch (err) {
      throw new Error(`file copy failed: ${(err as Error).message}`);
    }

    const stat = readFileSync(destPath);
    const fileSize = stat.length;

    await db.insert(resumes).values({
      id: resumeId,
      candidateId,
      fileName: basename(filePath),
      fileType: fileType as string,
      fileSize,
      filePath: destPath,
      extractedText: extractResult.text,
      parsedDataJson: JSON.stringify(parsed),
      ocrConfidence: extractResult.confidence,
      createdAt: Date.now(),
    });

    await updateTask(taskId, {
      status: "done",
      stage: "saving",
      candidateId,
      resultJson: JSON.stringify(parsed),
      updatedAt: Date.now(),
    });

    await updateBatchProgress(taskId);
  } catch (err) {
    await updateTask(taskId, {
      status: "failed",
      errorCode: ImportErrorCodes.SAVE_FAILED,
      errorMessage: (err as Error).message,
      updatedAt: Date.now(),
    });
    await updateBatchProgress(taskId);
  }
}

// ---------------------------------------------------------------------------
// Candidate matching
// ---------------------------------------------------------------------------

async function matchOrCreateCandidate(parsed: {
  phone: string | null;
  email: string | null;
  name: string | null;
  position: string | null;
  yearsOfExperience: number | null;
  skills: string[];
}): Promise<string> {
  // 1. Phone match
  if (parsed.phone) {
    const [existing] = await db
      .select({ id: candidates.id })
      .from(candidates)
      .where(eq(candidates.phone, parsed.phone))
      .limit(1);
    if (existing) return existing.id;
  }

  // 2. Email match
  if (parsed.email) {
    const [existing] = await db
      .select({ id: candidates.id })
      .from(candidates)
      .where(eq(candidates.email, parsed.email))
      .limit(1);
    if (existing) return existing.id;
  }

  // 3. Create new
  const id = `cand_${crypto.randomUUID()}`;
  const now = Date.now();
  await db.insert(candidates).values({
    id,
    source: "local",
    remoteId: null,
    name: parsed.name ?? "未知姓名",
    phone: parsed.phone ?? null,
    email: parsed.email ?? null,
    position: parsed.position ?? null,
    yearsOfExperience: parsed.yearsOfExperience ?? null,
    tagsJson: JSON.stringify(parsed.skills.slice(0, 10)),
    createdAt: now,
    updatedAt: now,
  });

  return id;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function detectFileType(filePath: string): FileType {
  const ext = extname(filePath);
  return classifyFileType(ext);
}

async function updateTask(
  taskId: string,
  updates: Partial<{
    status: string;
    stage: string | null;
    errorCode: string | null;
    errorMessage: string | null;
    candidateId: string | null;
    resultJson: string | null;
    updatedAt: number;
  }>
) {
  await db.update(importFileTasks).set(updates).where(eq(importFileTasks.id, taskId));
}

async function updateBatchProgress(taskId: string) {
  // Find batch for this task and refresh counters
  const [task] = await db
    .select({ batchId: importFileTasks.batchId })
    .from(importFileTasks)
    .where(eq(importFileTasks.id, taskId))
    .limit(1);

  if (!task) return;

  const allTasks = await db
    .select()
    .from(importFileTasks)
    .where(eq(importFileTasks.batchId, task.batchId));

  const total = allTasks.length;
  const processed = allTasks.filter((t) => !["queued", "extracting"].includes(t.status ?? "")).length;
  const success = allTasks.filter((t) => t.status === "done").length;
  const failed = allTasks.filter((t) => t.status === "failed").length;

  let batchStatus: string;
  if (processed >= total) {
    batchStatus = failed > 0 && success > 0 ? "partial_success" : failed > 0 ? "failed" : "completed";
  } else {
    batchStatus = "processing";
  }

  await db.update(importBatches).set({
    processedFiles: processed,
    successFiles: success,
    failedFiles: failed,
    currentStage: batchStatus,
    completedAt: batchStatus === "completed" || batchStatus === "failed" || batchStatus === "partial_success" ? Date.now() : null,
  }).where(eq(importBatches.id, task.batchId));
}
