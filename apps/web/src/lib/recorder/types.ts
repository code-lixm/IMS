import type {
  RecorderLevelUpdateEventPayload,
  RecorderLiveTranscriptSegmentUpdateEventPayload,
  RecorderStateSnapshot,
} from "@ims/shared";

/**
 * Unified recorder adapter interface.
 *
 * All Tauri-specific calls are encapsulated behind this boundary.
 * The store and components depend only on this interface, never on raw
 * `invoke` / `listen` calls.
 */
export interface IRecorderAdapter {
  /** Start a new recording session. Returns the assigned recording ID. */
  startRecording(): Promise<{ recordingId: string }>;

  /** Stop the active recording. */
  stopRecording(): Promise<void>;

  /** Poll the current full recorder state from the backend. */
  getStatus(): Promise<RecorderStateSnapshot>;

  /**
   * Subscribe to audio level updates.
   * Returns an unsubscribe function. Call it during teardown to avoid leaks.
   */
  subscribeLevel(
    callback: (payload: RecorderLevelUpdateEventPayload) => void,
  ): () => void;

  /**
   * Subscribe to live transcript segment updates.
   * Returns an unsubscribe function. Call it during teardown to avoid leaks.
   */
  subscribeLiveSegment(
    callback: (payload: RecorderLiveTranscriptSegmentUpdateEventPayload) => void,
  ): () => void;

  /**
   * Subscribe to full state snapshots pushed from the backend
   * (e.g. on transition to completed / error).
   * Returns an unsubscribe function.
   */
  subscribeStateUpdate(
    callback: (payload: RecorderStateSnapshot) => void,
  ): () => void;
}
