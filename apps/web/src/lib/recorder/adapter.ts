import type {
  RecorderLevelUpdateEventPayload,
  RecorderLiveTranscriptSegmentUpdateEventPayload,
  RecorderStateSnapshot,
} from "@ims/shared";
import type { IRecorderAdapter, RecorderDiagnosticsData } from "./types";

/**
 * TauriRecorderAdapter — bridges recorder operations to the native Rust side
 * via Tauri `invoke` and `listen`.
 *
 * In the browser (non-desktop) this file can still be safely imported;
 * the ctor throws on `invoke` / `listen` calls when Tauri internals are
 * absent, which is handled by the factory in index.ts.
 *
 * Event listeners are registered lazily when first subscribed and torn
 * down cleanly via the returned unsubscribe callback.
 */
export class TauriRecorderAdapter implements IRecorderAdapter {
  private unsubscribes: Array<() => void> = [];

  async startRecording(): Promise<{ recordingId: string }> {
    const { invoke } = await import("@tauri-apps/api/core");
    const recordingId = await invoke<string>("start_recording");
    return { recordingId };
  }

  async stopRecording(): Promise<void> {
    const { invoke } = await import("@tauri-apps/api/core");
    await invoke("stop_recording");
  }

  async getStatus(): Promise<RecorderStateSnapshot> {
    const { invoke } = await import("@tauri-apps/api/core");
    return invoke<RecorderStateSnapshot>("get_recorder_status");
  }

  async runDiagnostics(): Promise<RecorderDiagnosticsData> {
    const { invoke } = await import("@tauri-apps/api/core");
    return invoke<RecorderDiagnosticsData>("run_recorder_diagnostics");
  }

  subscribeLevel(
    callback: (payload: RecorderLevelUpdateEventPayload) => void,
  ): () => void {
    return this.subscribeTauriEvent("recorder://level-update", callback);
  }

  subscribeLiveSegment(
    callback: (payload: RecorderLiveTranscriptSegmentUpdateEventPayload) => void,
  ): () => void {
    return this.subscribeTauriEvent(
      "recorder://live-transcript-segment-update",
      callback,
    );
  }

  subscribeStateUpdate(
    callback: (payload: RecorderStateSnapshot) => void,
  ): () => void {
    return this.subscribeTauriEvent("recorder://state-update", callback);
  }

  /**
   * Stop all active event subscriptions at once.
   * Called automatically on store reset / component unmount.
   */
  teardown(): void {
    for (const unsub of this.unsubscribes) {
      unsub();
    }
    this.unsubscribes = [];
  }

  // --- Internal helpers ---

  private subscribeTauriEvent<T>(
    event: string,
    callback: (payload: T) => void,
  ): () => void {
    // Lazily listen — we want to be import-safe in browser mode.
    let unsub: (() => void) | null = null;

    // Using a micro-task so the caller gets the unsubscribe handle
    // synchronously. The actual listen registration happens asynchronously.
    queueMicrotask(async () => {
      try {
        const { listen } = await import("@tauri-apps/api/event");
        const unlisten = await listen<T>(event, (e) => {
          callback(e.payload);
        });
        unsub = unlisten;
        this.unsubscribes.push(unlisten);
      } catch {
        // Tauri runtime not available — silently no-op.
        // This mirrors the clipboard.ts pattern where Tauri calls are
        // wrapped in try/catch.
      }
    });

    return () => {
      if (unsub) {
        unsub();
        const idx = this.unsubscribes.indexOf(unsub);
        if (idx >= 0) {
          this.unsubscribes.splice(idx, 1);
        }
        unsub = null;
      }
    };
  }
}
