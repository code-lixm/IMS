import { mkdir, unlink } from "node:fs/promises";
import { isAbsolute, join } from "node:path";
import { desc, eq, sql } from "drizzle-orm";
import type { RecorderDetail, RecorderListItem, RecorderStatus, RecorderTranscriptSegment } from "@ims/shared";
import { config } from "../config";
import { db } from "../db";
import { recordings } from "../schema";

const RECORDINGS_DIR = join(config.runtimeDir, "recordings");

export const MAX_RECORDER_STORAGE_BYTES = 5 * 1024 * 1024 * 1024;

type RecordingRow = typeof recordings.$inferSelect;

function normalizeTimestamp(value: number | Date): number {
  return typeof value === "number" ? value : new Date(value).getTime();
}

function parseTranscriptSegments(transcriptJson: string | null | undefined): RecorderTranscriptSegment[] {
  if (!transcriptJson?.trim()) {
    return [];
  }

  try {
    const parsed = JSON.parse(transcriptJson) as unknown;
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed.flatMap((item, index) => {
      if (typeof item !== "object" || item === null) {
        return [];
      }

      const record = item as Record<string, unknown>;
      const sequence = typeof record.sequence === "number" ? record.sequence : index;
      const startMs = typeof record.startMs === "number" ? record.startMs : 0;
      const endMs = typeof record.endMs === "number" ? record.endMs : startMs;
      const text = typeof record.text === "string" ? record.text : "";
      const isFinal = typeof record.isFinal === "boolean" ? record.isFinal : true;

      return [{
        id: typeof record.id === "string" && record.id.trim() ? record.id : `segment_${sequence}`,
        sequence,
        startMs,
        endMs,
        text,
        isFinal,
      } satisfies RecorderTranscriptSegment];
    });
  } catch {
    return [];
  }
}

function toRecorderListItem(row: RecordingRow): RecorderListItem {
  return {
    id: row.id,
    status: row.status as RecorderStatus,
    durationMs: row.durationMs,
    fileSizeBytes: row.fileSizeBytes,
    language: row.language ?? null,
    liveTranscriptText: row.liveTranscriptText ?? "",
    finalTranscriptText: row.finalTranscriptText ?? "",
    organisedText: row.organisedText ?? null,
    createdAt: normalizeTimestamp(row.createdAt),
    updatedAt: normalizeTimestamp(row.updatedAt),
  };
}

function toRecorderDetail(row: RecordingRow): RecorderDetail {
  return {
    ...toRecorderListItem(row),
    filePath: row.filePath ?? null,
    transcriptSegments: parseTranscriptSegments(row.transcriptJson),
  };
}

export async function ensureRecordingsDir(): Promise<string> {
  await mkdir(RECORDINGS_DIR, { recursive: true });
  return RECORDINGS_DIR;
}

export function resolveRecordingFilePath(fileName: string): string {
  return join(RECORDINGS_DIR, fileName.replace(/[\\/]/g, "_"));
}

function normalizeStoredFilePath(filePath: string): string {
  return isAbsolute(filePath) ? filePath : join(RECORDINGS_DIR, filePath);
}

export class RecorderService {
  async listRecordings(options?: { limit?: number; offset?: number }): Promise<{ items: RecorderListItem[]; total: number }> {
    const countResult = await db.select({ count: sql<number>`count(*)` }).from(recordings);
    const rows = await db
      .select()
      .from(recordings)
      .orderBy(desc(recordings.createdAt))
      .limit(options?.limit ?? 50)
      .offset(options?.offset ?? 0);

    return {
      items: rows.map(toRecorderListItem),
      total: Number(countResult[0]?.count) || 0,
    };
  }

  async getRecordingById(recordingId: string): Promise<RecorderDetail | null> {
    const [row] = await db.select().from(recordings).where(eq(recordings.id, recordingId)).limit(1);
    return row ? toRecorderDetail(row) : null;
  }

  async createRecording(data: {
    id?: string;
    status: RecorderStatus;
    filePath: string;
    durationMs?: number;
    fileSizeBytes?: number;
    language?: string | null;
    liveTranscriptText?: string | null;
    finalTranscriptText?: string | null;
    transcriptJson?: string | null;
    organisedText?: string | null;
    createdAt?: number;
    updatedAt?: number;
  }): Promise<RecorderDetail> {
    await ensureRecordingsDir();

    const now = Date.now();
    const [row] = await db.insert(recordings).values({
      id: data.id ?? `rec_${crypto.randomUUID()}`,
      status: data.status,
      filePath: normalizeStoredFilePath(data.filePath),
      durationMs: data.durationMs ?? 0,
      fileSizeBytes: data.fileSizeBytes ?? 0,
      language: data.language ?? null,
      liveTranscriptText: data.liveTranscriptText ?? null,
      finalTranscriptText: data.finalTranscriptText ?? null,
      transcriptJson: data.transcriptJson ?? null,
      organisedText: data.organisedText ?? null,
      createdAt: data.createdAt ?? now,
      updatedAt: data.updatedAt ?? now,
    }).returning();

    return toRecorderDetail(row);
  }

  async saveOrganisedText(recordingId: string, organisedText: string): Promise<RecorderDetail | null> {
    const [row] = await db
      .update(recordings)
      .set({ organisedText, updatedAt: Date.now() })
      .where(eq(recordings.id, recordingId))
      .returning();

    return row ? toRecorderDetail(row) : null;
  }

  async deleteRecording(recordingId: string): Promise<RecorderDetail | null> {
    const [row] = await db.delete(recordings).where(eq(recordings.id, recordingId)).returning();
    if (!row) {
      return null;
    }

    if (row.filePath) {
      await unlink(normalizeStoredFilePath(row.filePath)).catch(() => undefined);
    }

    return toRecorderDetail(row);
  }

  async getStorageUsage(): Promise<{
    totalBytes: number;
    recordingCount: number;
    maxBytes: number;
    availableBytes: number;
    overLimit: boolean;
  }> {
    const [result] = await db
      .select({
        totalBytes: sql<number>`coalesce(sum(${recordings.fileSizeBytes}), 0)`,
        recordingCount: sql<number>`count(*)`,
      })
      .from(recordings);

    const totalBytes = Number(result?.totalBytes) || 0;
    const recordingCount = Number(result?.recordingCount) || 0;

    return {
      totalBytes,
      recordingCount,
      maxBytes: MAX_RECORDER_STORAGE_BYTES,
      availableBytes: Math.max(MAX_RECORDER_STORAGE_BYTES - totalBytes, 0),
      overLimit: totalBytes > MAX_RECORDER_STORAGE_BYTES,
    };
  }
}

export const recorderService = new RecorderService();
