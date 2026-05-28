import type { RecorderLevelUpdateEventPayload, RecorderLiveTranscriptSegmentUpdateEventPayload, RecorderStateSnapshot, RecorderStatus } from "@ims/shared";
import type { IRecorderAdapter, RecorderDiagnosticsData } from "./types";

type Listener<T> = (payload: T) => void;

/**
 * FakeRecorderAdapter — a browser-safe, no-op adapter for dev / test.
 *
 * Exposes public `emit*` methods so tests can simulate real-time events
 * without a desktop runtime. The store never sees the fake vs. real
 * adapter — only the `IRecorderAdapter` surface.
 */
export class FakeRecorderAdapter implements IRecorderAdapter {
  private levelListeners = new Set<Listener<RecorderLevelUpdateEventPayload>>();
  private liveSegmentListeners = new Set<Listener<RecorderLiveTranscriptSegmentUpdateEventPayload>>();
  private stateListeners = new Set<Listener<RecorderStateSnapshot>>();

  private _status: RecorderStatus = "idle";
  private _activeRecordingId: string | null = null;
  private _durationMs = 0;
  private _level = 0;
  private _peakLevel = 0;
  private _muted = false;
  private _liveTranscriptText = "";
  private _finalTranscriptText = "";
  private _organisedText: string | null = null;
  private _liveTranscriptSegments: RecorderLiveTranscriptSegmentUpdateEventPayload["segment"][] = [];
  private _errorCode: string | null = null;
  private _errorMessage: string | null = null;
  private _updatedAt: number | null = null;

  // --- IRecorderAdapter implementation ---

  async startRecording(): Promise<{ recordingId: string }> {
    const recordingId = `fake-rec-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    this._status = "recording";
    this._activeRecordingId = recordingId;
    this._liveTranscriptText = "";
    this._liveTranscriptSegments = [];
    this._finalTranscriptText = "";
    this._organisedText = null;
    this._level = 0;
    this._peakLevel = 0;
    this._muted = false;
    this._errorCode = null;
    this._errorMessage = null;
    this._durationMs = 0;
    this._updatedAt = Date.now();
    return { recordingId };
  }

  async stopRecording(): Promise<void> {
    this._status = "stopping";
    this._updatedAt = Date.now();
    // Simulate a brief finish, then emit the final snapshot.
    this._status = "completed";
    this._updatedAt = Date.now();
    this.emitStateUpdateInternal();
  }

  async getStatus(): Promise<RecorderStateSnapshot> {
    return this.snapshot();
  }

  async runDiagnostics(): Promise<RecorderDiagnosticsData> {
    return {
      checkedAt: Date.now(),
      desktopRuntime: false,
      activeRecording: this._status === "recording",
      deviceAvailable: true,
      deviceName: "Fake Recorder Device",
      configAvailable: true,
      sampleRate: 48_000,
      channels: 1,
      permissionGranted: true,
      inputSignalDetected: this._peakLevel > 0.01,
      peakLevel: this._peakLevel,
      muted: this._muted,
      errorCode: null,
      errorMessage: null,
      notes: ["当前是浏览器 / 测试环境，诊断结果来自 fake adapter。"],
    };
  }

  subscribeLevel(callback: Listener<RecorderLevelUpdateEventPayload>): () => void {
    this.levelListeners.add(callback);
    return () => {
      this.levelListeners.delete(callback);
    };
  }

  subscribeLiveSegment(
    callback: Listener<RecorderLiveTranscriptSegmentUpdateEventPayload>,
  ): () => void {
    this.liveSegmentListeners.add(callback);
    return () => {
      this.liveSegmentListeners.delete(callback);
    };
  }

  subscribeStateUpdate(callback: Listener<RecorderStateSnapshot>): () => void {
    this.stateListeners.add(callback);
    return () => {
      this.stateListeners.delete(callback);
    };
  }

  // --- Test helpers ---

  /** Simulate an incoming level update event. */
  emitLevel(payload: Partial<RecorderLevelUpdateEventPayload> = {}): void {
    const full: RecorderLevelUpdateEventPayload = {
      recordingId: this._activeRecordingId ?? null,
      level: 0.5,
      peakLevel: 0.8,
      muted: false,
      timestamp: Date.now(),
      ...payload,
    };

    this._activeRecordingId = full.recordingId;
    this._level = full.level;
    this._peakLevel = full.peakLevel;
    this._muted = full.muted;
    this._updatedAt = full.timestamp;

    for (const cb of this.levelListeners) {
      cb(full);
    }
  }

  /** Simulate an incoming live-transcript-segment update event. */
  emitLiveSegment(
    payload: Partial<RecorderLiveTranscriptSegmentUpdateEventPayload> = {},
  ): void {
    const full: RecorderLiveTranscriptSegmentUpdateEventPayload = {
      recordingId: this._activeRecordingId ?? "fake-rec-unknown",
      segment: {
        id: `seg-${this._liveTranscriptSegments.length + 1}`,
        sequence: this._liveTranscriptSegments.length,
        startMs: this._durationMs,
        endMs: this._durationMs + 2000,
        text: "",
        isFinal: false,
      },
      liveTranscriptText: this._liveTranscriptText,
      updatedAt: Date.now(),
      ...payload,
    };

    this._activeRecordingId = full.recordingId;
    this._liveTranscriptText = full.liveTranscriptText;
    this._liveTranscriptSegments = [...this._liveTranscriptSegments, full.segment];
    this._updatedAt = full.updatedAt;
    this._durationMs = full.segment.endMs;

    for (const cb of this.liveSegmentListeners) {
      cb(full);
    }
  }

  /** Simulate a full state push from the backend. */
  emitStateUpdate(snapshot: Partial<RecorderStateSnapshot> = {}): void {
    const merged: RecorderStateSnapshot = { ...this.snapshot(), ...snapshot };
    this.applySnapshot(merged);
    for (const cb of this.stateListeners) {
      cb(merged);
    }
  }

  /** Remove all listeners (for test cleanup). */
  clearListeners(): void {
    this.levelListeners.clear();
    this.liveSegmentListeners.clear();
    this.stateListeners.clear();
  }

  // --- Internal helpers ---

  private snapshot(): RecorderStateSnapshot {
    return {
      status: this._status,
      activeRecordingId: this._activeRecordingId,
      durationMs: this._durationMs,
      liveTranscriptText: this._liveTranscriptText,
      finalTranscriptText: this._finalTranscriptText,
      organisedText: this._organisedText,
      liveTranscriptSegments: [...this._liveTranscriptSegments],
      level: this._level,
      peakLevel: this._peakLevel,
      muted: this._muted,
      errorCode: this._errorCode,
      errorMessage: this._errorMessage,
      updatedAt: this._updatedAt,
    };
  }

  private applySnapshot(snapshot: RecorderStateSnapshot): void {
    this._status = snapshot.status;
    this._activeRecordingId = snapshot.activeRecordingId;
    this._durationMs = snapshot.durationMs;
    this._liveTranscriptText = snapshot.liveTranscriptText;
    this._finalTranscriptText = snapshot.finalTranscriptText;
    this._organisedText = snapshot.organisedText;
    this._liveTranscriptSegments = [...snapshot.liveTranscriptSegments];
    this._level = snapshot.level;
    this._peakLevel = snapshot.peakLevel;
    this._muted = snapshot.muted;
    this._errorCode = snapshot.errorCode;
    this._errorMessage = snapshot.errorMessage;
    this._updatedAt = snapshot.updatedAt;
  }

  private emitStateUpdateInternal(): void {
    const snap = this.snapshot();
    for (const cb of this.stateListeners) {
      cb(snap);
    }
  }
}
