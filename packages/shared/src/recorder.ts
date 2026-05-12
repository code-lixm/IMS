// ---------------------------------------------------------------------------
// Recorder domain
// ---------------------------------------------------------------------------

export const RecorderEventNames = {
  LEVEL_UPDATE: "recorder://level-update",
  LIVE_TRANSCRIPT_SEGMENT_UPDATE: "recorder://live-transcript-segment-update",
  STATE_UPDATE: "recorder://state-update",
} as const;

export type RecorderEventName = (typeof RecorderEventNames)[keyof typeof RecorderEventNames];

export type RecorderStatus =
  | "idle"
  | "recording"
  | "stopping"
  | "transcribing"
  | "finalizing"
  | "completed"
  | "error";

export interface RecorderTranscriptSegment {
  id: string;
  sequence: number;
  startMs: number;
  endMs: number;
  text: string;
  isFinal: boolean;
}

export interface RecorderLevelUpdateEventPayload {
  recordingId: string | null;
  level: number;
  peakLevel: number;
  muted: boolean;
  timestamp: number;
}

export interface RecorderLiveTranscriptSegmentUpdateEventPayload {
  recordingId: string;
  segment: RecorderTranscriptSegment;
  liveTranscriptText: string;
  updatedAt: number;
}

export interface RecorderStateSnapshot {
  status: RecorderStatus;
  activeRecordingId: string | null;
  durationMs: number;
  liveTranscriptText: string;
  finalTranscriptText: string;
  organisedText: string | null;
  liveTranscriptSegments: RecorderTranscriptSegment[];
  level: number;
  peakLevel: number;
  muted: boolean;
  errorCode: string | null;
  errorMessage: string | null;
  updatedAt: number | null;
}

export interface RecorderStateData {
  state: RecorderStateSnapshot;
}

export interface RecorderListItem {
  id: string;
  status: RecorderStatus;
  durationMs: number;
  fileSizeBytes: number;
  language: string | null;
  liveTranscriptText: string;
  finalTranscriptText: string;
  organisedText: string | null;
  createdAt: number;
  updatedAt: number;
}

export interface RecorderListData {
  items: RecorderListItem[];
  total: number;
}

export interface RecorderDetail extends RecorderListItem {
  filePath: string | null;
  transcriptSegments: RecorderTranscriptSegment[];
}

export interface RecorderDetailData {
  recording: RecorderDetail;
}

export interface UpdateRecorderOrganisedTextInput {
  organisedText: string;
}
