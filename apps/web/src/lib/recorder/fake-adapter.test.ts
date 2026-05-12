import { beforeEach, describe, expect, it } from "vitest";
import { FakeRecorderAdapter } from "./fake-adapter";

describe("FakeRecorderAdapter", () => {
  let adapter: FakeRecorderAdapter;

  beforeEach(() => {
    adapter = new FakeRecorderAdapter();
  });

  describe("startRecording", () => {
    it("returns a recordingId and sets internal status to recording", async () => {
      const { recordingId } = await adapter.startRecording();

      expect(recordingId).toBeTruthy();
      expect(recordingId).toContain("fake-rec-");
      const status = await adapter.getStatus();
      expect(status.status).toBe("recording");
      expect(status.activeRecordingId).toBe(recordingId);
    });

    it("resets transcript state on each start", async () => {
      const { recordingId: id2 } = await adapter.startRecording();
      adapter.emitLiveSegment({
        segment: { id: "seg-1", sequence: 0, startMs: 0, endMs: 1000, text: "hello", isFinal: false },
        liveTranscriptText: "hello",
      });

      // Start a new recording — transcripts should be reset
      const { recordingId } = await adapter.startRecording();
      expect(recordingId).not.toBe(id2);
      const status = await adapter.getStatus();
      expect(status.liveTranscriptText).toBe("");
      expect(status.liveTranscriptSegments).toHaveLength(0);
    });
  });

  describe("stopRecording", () => {
    it("transitions to completed status", async () => {
      await adapter.startRecording();
      await adapter.stopRecording();

      const status = await adapter.getStatus();
      expect(status.status).toBe("completed");
    });
  });

  describe("getStatus", () => {
    it("returns idle by default", async () => {
      const status = await adapter.getStatus();
      expect(status.status).toBe("idle");
      expect(status.activeRecordingId).toBeNull();
      expect(status.durationMs).toBe(0);
    });
  });

  describe("subscribeLevel / emitLevel", () => {
    it("calls registered callback with the event payload", async () => {
      await adapter.startRecording();
      const events: unknown[] = [];
      const unsub = adapter.subscribeLevel((payload) => {
        events.push(payload);
      });

      adapter.emitLevel({ level: 0.75, peakLevel: 0.9 });

      expect(events).toHaveLength(1);
      expect(events[0]).toMatchObject({ level: 0.75, peakLevel: 0.9 });

      unsub();
    });

    it("unsubscribes correctly", async () => {
      await adapter.startRecording();
      const events: unknown[] = [];
      const unsub = adapter.subscribeLevel((payload) => {
        events.push(payload);
      });

      unsub();
      adapter.emitLevel();

      expect(events).toHaveLength(0);
    });
  });

  describe("subscribeLiveSegment / emitLiveSegment", () => {
    it("calls registered callback with segment payload", async () => {
      await adapter.startRecording();
      const events: unknown[] = [];
      adapter.subscribeLiveSegment((payload) => {
        events.push(payload);
      });

      adapter.emitLiveSegment({
        segment: { id: "seg-1", sequence: 0, startMs: 0, endMs: 2000, text: "test", isFinal: false },
      });

      expect(events).toHaveLength(1);
      expect(events[0]).toMatchObject({
        segment: expect.objectContaining({ id: "seg-1", text: "test" }),
      });
    });

    it("accumulates segments in internal state", async () => {
      await adapter.startRecording();
      adapter.emitLiveSegment({
        segment: { id: "seg-1", sequence: 0, startMs: 0, endMs: 1000, text: "hello", isFinal: false },
        liveTranscriptText: "hello",
      });
      adapter.emitLiveSegment({
        segment: { id: "seg-2", sequence: 1, startMs: 1000, endMs: 2000, text: "world", isFinal: true },
        liveTranscriptText: "hello world",
      });

      const status = await adapter.getStatus();
      expect(status.liveTranscriptSegments).toHaveLength(2);
      expect(status.liveTranscriptText).toBe("hello world");
      expect(status.liveTranscriptSegments[0].text).toBe("hello");
      expect(status.liveTranscriptSegments[1].text).toBe("world");
    });
  });

  describe("subscribeStateUpdate / emitStateUpdate", () => {
    it("receives state snapshots", async () => {
      await adapter.startRecording();
      const events: unknown[] = [];
      adapter.subscribeStateUpdate((snapshot) => {
        events.push(snapshot);
      });

      adapter.emitStateUpdate({ status: "completed" });

      expect(events).toHaveLength(1);
      expect(events[0]).toMatchObject({ status: "completed" });
    });
  });

  describe("clearListeners", () => {
    it("removes all registered listeners", async () => {
      await adapter.startRecording();
      let levelCalls = 0;
      let segmentCalls = 0;

      adapter.subscribeLevel(() => { levelCalls++; });
      adapter.subscribeLiveSegment(() => { segmentCalls++; });

      adapter.clearListeners();

      adapter.emitLevel();
      adapter.emitLiveSegment();

      expect(levelCalls).toBe(0);
      expect(segmentCalls).toBe(0);
    });
  });
});
