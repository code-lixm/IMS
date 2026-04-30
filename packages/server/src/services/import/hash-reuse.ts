import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { and, desc, eq, isNotNull, ne } from "drizzle-orm";
import type { ImportTaskResultData } from "@ims/shared";
import { db } from "../../db";
import { importFileTasks } from "../../schema";

export interface ScreeningReuseKeyInput {
  fileHash: string;
  promptSnapshot: string;
  templateId?: string | null;
  templateVersion?: number | null;
  screeningProviderId?: string | null;
  screeningModel: string;
  normalizedBaseURL: string;
}

export interface ReusableCompletedScreening {
  taskId: string;
  result: ImportTaskResultData;
}

export function sha256Hex(value: string | Uint8Array): string {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}

export function computeFileHash(filePath: string): string {
  return sha256Hex(readFileSync(filePath));
}

export function buildScreeningReuseKey(input: ScreeningReuseKeyInput): string | null {
  const fileHash = input.fileHash.trim();
  const promptSnapshot = input.promptSnapshot.trim();
  const screeningModel = input.screeningModel.trim();
  const normalizedBaseURL = input.normalizedBaseURL.trim();

  if (!fileHash || !promptSnapshot || !screeningModel || !normalizedBaseURL) {
    return null;
  }

  const payload = JSON.stringify({
    fileHash,
    templateId: input.templateId?.trim() || "__none__",
    templateVersion: input.templateVersion ?? 0,
    promptSnapshotHash: sha256Hex(promptSnapshot),
    screeningProviderId: input.screeningProviderId?.trim() || "openai-compatible",
    screeningModel,
    normalizedBaseURL,
  });

  return sha256Hex(payload);
}

export async function findReusableCompletedScreening(options: {
  excludeTaskId?: string;
  fileHash: string;
  screeningReuseKey: string;
}): Promise<ReusableCompletedScreening | null> {
  const filters = [
    eq(importFileTasks.fileHash, options.fileHash),
    eq(importFileTasks.status, "done"),
    isNotNull(importFileTasks.resultJson),
  ];

  if (options.excludeTaskId) {
    filters.push(ne(importFileTasks.id, options.excludeTaskId));
  }

  const rows = await db
    .select({
      id: importFileTasks.id,
      resultJson: importFileTasks.resultJson,
    })
    .from(importFileTasks)
    .where(and(...filters))
    .orderBy(desc(importFileTasks.updatedAt));

  for (const row of rows) {
    if (!row.resultJson) continue;

    try {
      const result = JSON.parse(row.resultJson) as ImportTaskResultData;
      const score = result.screeningConclusion?.score;
      if (
        result.screeningStatus === "completed"
        && typeof score === "number"
        && Number.isFinite(score)
        && !result.screeningError
        && result.screeningReuseKey === options.screeningReuseKey
      ) {
        return {
          taskId: row.id,
          result,
        };
      }
    } catch {
      continue;
    }
  }

  return null;
}
