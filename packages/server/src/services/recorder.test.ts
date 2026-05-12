import { mkdir, rm, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { beforeEach, describe, expect, test, vi } from "vitest";

const state = vi.hoisted(() => ({
  recordings: [] as Array<Record<string, unknown>>,
}));

const schema = vi.hoisted(() => ({
  recordings: {
    id: "id",
    status: "status",
    filePath: "filePath",
    durationMs: "durationMs",
    fileSizeBytes: "fileSizeBytes",
    language: "language",
    liveTranscriptText: "liveTranscriptText",
    finalTranscriptText: "finalTranscriptText",
    transcriptJson: "transcriptJson",
    organisedText: "organisedText",
    createdAt: "createdAt",
    updatedAt: "updatedAt",
  },
}));

vi.mock("drizzle-orm", () => ({
  desc: (column: string) => ({ kind: "desc", column }),
  eq: (column: string, value: unknown) => ({ kind: "eq", column, value }),
  sql: (strings: TemplateStringsArray, ...values: unknown[]) => ({ strings, values }),
}));

vi.mock("../config", () => ({
  config: {
    runtimeDir: "/tmp/ims-recorder-test/runtime",
  },
}));

vi.mock("../schema", () => ({
  recordings: schema.recordings,
}));

function createSelectBuilder(selectedFields?: Record<string, unknown>) {
  let condition: { kind: string; column: string; value: unknown } | null = null;
  let order: { kind: string; column: string } | null = null;
  let limitCount: number | null = null;
  let offsetCount = 0;

  const builder = {
    from() {
      return builder;
    },
    where(nextCondition: { kind: string; column: string; value: unknown }) {
      condition = nextCondition;
      return builder;
    },
    orderBy(nextOrder: { kind: string; column: string }) {
      order = nextOrder;
      return builder;
    },
    limit(nextLimit: number) {
      limitCount = nextLimit;
      return builder;
    },
    offset(nextOffset: number) {
      offsetCount = nextOffset;
      return execute();
    },
    then(resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) {
      return execute().then(resolve, reject);
    },
  };

  async function execute() {
    let rows = state.recordings.slice();

    if (condition?.kind === "eq") {
      rows = rows.filter((row) => row[condition!.column] === condition!.value);
    }

    if (selectedFields && "count" in selectedFields) {
      return [{ count: rows.length }];
    }

    if (selectedFields && "totalBytes" in selectedFields) {
      const totalBytes = rows.reduce((sum, row) => sum + Number(row.fileSizeBytes ?? 0), 0);
      return [{ totalBytes, recordingCount: rows.length }];
    }

    if (order?.kind === "desc") {
      rows.sort((left, right) => Number(right[order!.column] ?? 0) - Number(left[order!.column] ?? 0));
    }

    if (offsetCount > 0) {
      rows = rows.slice(offsetCount);
    }

    if (limitCount !== null) {
      rows = rows.slice(0, limitCount);
    }

    return rows;
  }

  return builder;
}

vi.mock("../db", () => ({
  db: {
    select: vi.fn((fields?: Record<string, unknown>) => createSelectBuilder(fields)),
    insert: vi.fn(() => ({
      values: (values: Record<string, unknown>) => ({
        returning: async () => {
          state.recordings.push({ ...values });
          return [{ ...values }];
        },
      }),
    })),
    update: vi.fn(() => ({
      set: (updates: Record<string, unknown>) => ({
        where: (condition: { kind: string; column: string; value: unknown }) => ({
          returning: async () => {
            const row = state.recordings.find((item) => item[condition.column] === condition.value);
            if (!row) {
              return [];
            }

            Object.assign(row, updates);
            return [{ ...row }];
          },
        }),
      }),
    })),
    delete: vi.fn(() => ({
      where: (condition: { kind: string; column: string; value: unknown }) => ({
        returning: async () => {
          const index = state.recordings.findIndex((item) => item[condition.column] === condition.value);
          if (index < 0) {
            return [];
          }

          const [removed] = state.recordings.splice(index, 1);
          return [{ ...removed }];
        },
      }),
    })),
  },
}));

import { recorderService } from "./recorder";

const runtimeDir = "/tmp/ims-recorder-test/runtime";
const recordingsDir = join(runtimeDir, "recordings");

describe("recorderService", () => {
  beforeEach(async () => {
    state.recordings.splice(0, state.recordings.length);
    await rm("/tmp/ims-recorder-test", { recursive: true, force: true });
    await mkdir(recordingsDir, { recursive: true });
  });

  test("supports create/list/detail/update/delete and removes disk file", async () => {
    const filePath = join(recordingsDir, "rec_test.wav");
    await writeFile(filePath, Buffer.from("fake wav data"));

    const created = await recorderService.createRecording({
      id: "rec_test",
      status: "completed",
      filePath,
      durationMs: 3210,
      fileSizeBytes: 13,
      language: "zh",
      liveTranscriptText: "实时文本",
      finalTranscriptText: "最终文本",
      transcriptJson: JSON.stringify([
        { id: "seg_1", sequence: 0, startMs: 0, endMs: 1000, text: "第一段", isFinal: true },
      ]),
    });

    expect(created.id).toBe("rec_test");
    expect(created.filePath).toBe(filePath);
    expect(created.transcriptSegments).toHaveLength(1);

    const list = await recorderService.listRecordings();
    expect(list.total).toBe(1);
    expect(list.items[0]).toMatchObject({ id: "rec_test", fileSizeBytes: 13 });

    const detail = await recorderService.getRecordingById("rec_test");
    expect(detail?.finalTranscriptText).toBe("最终文本");

    const updated = await recorderService.saveOrganisedText("rec_test", "整理后的文本");
    expect(updated?.organisedText).toBe("整理后的文本");

    const usage = await recorderService.getStorageUsage();
    expect(usage.totalBytes).toBe(13);
    expect(usage.recordingCount).toBe(1);
    expect(usage.overLimit).toBe(false);

    const deleted = await recorderService.deleteRecording("rec_test");
    expect(deleted?.id).toBe("rec_test");
    expect(await stat(filePath).catch(() => null)).toBeNull();
    expect(await recorderService.getRecordingById("rec_test")).toBeNull();
  });
});
