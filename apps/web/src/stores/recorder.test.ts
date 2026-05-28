import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import type { RecorderDetailData, RecorderListItem, RecorderTranscriptSegment } from "@ims/shared";
import { recorderApi } from "@/api/recorder";
import { FakeRecorderAdapter } from "@/lib/recorder";
import { injectRecorderAdapter, useRecorderStore } from "./recorder";

vi.mock("@/composables/use-app-notifications", () => ({
  useAppNotifications: () => ({
    notifyError: vi.fn(),
  }),
}));

const originalList = recorderApi.list;
const originalGet = recorderApi.get;
const originalSaveOrganisedText = recorderApi.saveOrganisedText;
const originalRemove = recorderApi.remove;

function makeTranscriptSegments(): RecorderTranscriptSegment[] {
  return [
    { id: "seg-1", sequence: 0, startMs: 0, endMs: 500, text: "hello", isFinal: true },
  ];
}

function makeRecorderListItem(id: string, overrides: Partial<RecorderListItem> = {}): RecorderListItem {
  return {
    id,
    status: "completed",
    durationMs: 1200,
    fileSizeBytes: 2048,
    language: "zh-CN",
    liveTranscriptText: "实时文本",
    finalTranscriptText: `完整文本-${id}`,
    organisedText: null,
    createdAt: 1,
    updatedAt: 2,
    ...overrides,
  };
}

function makeRecorderDetailData(id: string, overrides: Partial<RecorderDetailData["recording"]> = {}): RecorderDetailData {
  const listItem = makeRecorderListItem(id, overrides);

  return {
    recording: {
      ...listItem,
      filePath: `/tmp/${id}.wav`,
      transcriptSegments: makeTranscriptSegments(),
      ...overrides,
    },
  };
}

describe("useRecorderStore", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    injectRecorderAdapter(new FakeRecorderAdapter());
  });

  afterEach(() => {
    recorderApi.list = originalList;
    recorderApi.get = originalGet;
    recorderApi.saveOrganisedText = originalSaveOrganisedText;
    recorderApi.remove = originalRemove;
  });

  test("loadRecordings stores fetched history and total", async () => {
    recorderApi.list = async () => ({
      items: [makeRecorderListItem("rec-1")],
      total: 1,
    });

    const store = useRecorderStore();
    await store.loadRecordings();

    expect(store.history).toHaveLength(1);
    expect(store.total).toBe(1);
    expect(store.history[0]?.id).toBe("rec-1");
  });

  test("saveOrganisedText updates current detail and history entry", async () => {
    recorderApi.saveOrganisedText = async () => makeRecorderDetailData("rec-1", {
      organisedText: "整理后的文本",
      updatedAt: 999,
    });

    const store = useRecorderStore();
    store.setCurrent(makeRecorderDetailData("rec-1"));
    store.setHistory([makeRecorderListItem("rec-1")], 1);

    await store.saveOrganisedText("rec-1", "整理后的文本");

    expect(store.current?.recording.organisedText).toBe("整理后的文本");
    expect(store.history[0]?.organisedText).toBe("整理后的文本");
    expect(store.history[0]?.updatedAt).toBe(999);
  });

  test("deleteRecording refreshes history and clears deleted current detail", async () => {
    recorderApi.remove = async () => ({ success: true, deletedId: "rec-1" });
    recorderApi.list = async () => ({
      items: [makeRecorderListItem("rec-2")],
      total: 1,
    });

    const store = useRecorderStore();
    store.setCurrent(makeRecorderDetailData("rec-1"));
    store.setHistory([makeRecorderListItem("rec-1"), makeRecorderListItem("rec-2")], 2);

    await store.deleteRecording("rec-1");

    expect(store.current).toBeNull();
    expect(store.history).toHaveLength(1);
    expect(store.history[0]?.id).toBe("rec-2");
    expect(store.total).toBe(1);
  });

  test("completed state refreshes history and loads the finished recording detail", async () => {
    const adapter = new FakeRecorderAdapter();
    injectRecorderAdapter(adapter);

    recorderApi.list = async () => ({
      items: [makeRecorderListItem("rec-1")],
      total: 1,
    });
    recorderApi.get = async () => makeRecorderDetailData("rec-1", {
      finalTranscriptText: "停止后生成的最终文本",
    });

    const store = useRecorderStore();
    await store.startRecording();
    await store.stopRecording();

    await Promise.resolve();
    await Promise.resolve();

    expect(store.history[0]?.id).toBe("rec-1");
    expect(store.current?.recording.id).toBe("rec-1");
    expect(store.current?.recording.finalTranscriptText).toBe("停止后生成的最终文本");
  });
});
