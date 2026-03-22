/**
 * Shared API types — the contract between server and web app.
 *
 * These types are derived from Local-API-Spec-v0.2.md.
 * Any change to the API contract must update this file first.
 */

import type {
  Candidate,
  Resume,
  Interview,
  Artifact,
  ArtifactVersion,
  CandidateWorkspace,
  ImportBatch,
  ImportFileTask,
  ShareRecord,
  Notification,
  Device,
  ParsedResume,
} from "./db-schema";

// ---------------------------------------------------------------------------
// Transport wrapper
// ---------------------------------------------------------------------------

export interface ApiMeta {
  requestId: string;
  timestamp: string; // ISO 8601
}

export interface ApiSuccess<T> {
  success: true;
  data: T;
  error: null;
  meta: ApiMeta;
}

export interface ApiError {
  success: false;
  data: null;
  error: {
    code: string;
    message: string;
  };
  meta: ApiMeta;
}

export type ApiResponse<T> = ApiSuccess<T> | ApiError;

// ---------------------------------------------------------------------------
// Error codes
// ---------------------------------------------------------------------------

export const ErrorCodes = {
  AUTH_REQUIRED: "AUTH_REQUIRED",
  AUTH_EXPIRED: "AUTH_EXPIRED",
  AUTH_INVALID: "AUTH_INVALID",
  NOT_FOUND: "NOT_FOUND",
  VALIDATION_ERROR: "VALIDATION_ERROR",
  REMOTE_SYNC_FAILED: "REMOTE_SYNC_FAILED",
  IMPORT_UNSUPPORTED_FILE: "IMPORT_UNSUPPORTED_FILE",
  IMPORT_PARSE_FAILED: "IMPORT_PARSE_FAILED",
  IMPORT_OCR_FAILED: "IMPORT_OCR_FAILED",
  IMPORT_ARCHIVE_TOO_DEEP: "IMPORT_ARCHIVE_TOO_DEEP",
  IMPORT_ARCHIVE_TOO_LARGE: "IMPORT_ARCHIVE_TOO_LARGE",
  IMPORT_TEXT_EXTRACT_FAILED: "IMPORT_TEXT_EXTRACT_FAILED",
  IMPORT_SAVE_FAILED: "IMPORT_SAVE_FAILED",
  IMPORT_INDEX_FAILED: "IMPORT_INDEX_FAILED",
  WORKSPACE_CREATE_FAILED: "WORKSPACE_CREATE_FAILED",
  SHARE_EXPORT_FAILED: "SHARE_EXPORT_FAILED",
  SHARE_DEVICE_OFFLINE: "SHARE_DEVICE_OFFLINE",
  SHARE_CONFLICT_DETECTED: "SHARE_CONFLICT_DETECTED",
  SHARE_IMPORT_FAILED: "SHARE_IMPORT_FAILED",
  SHARE_VALIDATION_FAILED: "SHARE_VALIDATION_FAILED",
  SYSTEM_OPENCODE_NOT_READY: "SYSTEM_OPENCODE_NOT_READY",
  SYSTEM_OPENCODE_CRASHED: "SYSTEM_OPENCODE_CRASHED",
  INTERNAL_ERROR: "INTERNAL_ERROR",
} as const;

export type ErrorCode = (typeof ErrorCodes)[keyof typeof ErrorCodes];

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

export interface AuthStatusData {
  status: "valid" | "expired" | "unauthenticated";
  user: { id: string; name: string; email: string | null } | null;
  lastValidatedAt: number | null;
}

export interface AuthStartData {
  loginUrl: string;
  requestId: string;
}

export interface AuthCompleteData {
  status: "valid";
  user: { id: string; name: string; email: string | null };
}

export interface AuthLogoutData {
  status: "logged_out";
}

// ---------------------------------------------------------------------------
// User / Me
// ---------------------------------------------------------------------------

export interface MeData {
  user: {
    id: string;
    name: string;
    email: string | null;
    tokenStatus: string;
    lastSyncAt: number | null;
    settings: Record<string, unknown>;
  } | null;
  syncEnabled: boolean;
  opencodeReady: boolean;
  opencodeVersion: string | null;
}

// ---------------------------------------------------------------------------
// Sync
// ---------------------------------------------------------------------------

export interface SyncStatusData {
  enabled: boolean;
  intervalMs: number;
  lastSyncAt: number | null;
  lastError: string | null;
}

export interface SyncToggleData {
  enabled: boolean;
  intervalMs: number;
}

export interface SyncRunData {
  syncedCandidates: number;
  syncedInterviews: number;
  syncAt: number;
}

// ---------------------------------------------------------------------------
// Candidates
// ---------------------------------------------------------------------------

export interface CandidateListData {
  items: (Candidate & { tags: string[] })[];
  total: number;
  page: number;
  pageSize: number;
}

export interface CandidateDetailData {
  candidate: Candidate & { tags: string[] };
  resumes: (Omit<Resume, "parsedDataJson"> & { parsedData: ParsedResume | null })[];
  interviews: (Omit<Interview, "interviewerIdsJson" | "manualEvaluationJson"> & {
    interviewerIds: string[];
    manualEvaluation: { rating: number; decision: string; comments: string } | null;
  })[];
  artifactsSummary: Artifact[];
  workspace: Pick<CandidateWorkspace, "id" | "workspaceStatus" | "lastAccessedAt"> | null;
}

export interface CreateCandidateInput {
  name: string;
  phone?: string;
  email?: string;
  position?: string;
  yearsOfExperience?: number;
  source?: "local" | "remote" | "hybrid";
  tags?: string[];
}

export interface UpdateCandidateInput {
  position?: string;
  yearsOfExperience?: number;
  tags?: string[];
  source?: "local" | "remote" | "hybrid";
}

// ---------------------------------------------------------------------------
// Resumes
// ---------------------------------------------------------------------------

export interface ResumeListData {
  items: (Omit<Resume, "parsedDataJson"> & { parsedData: ParsedResume | null })[];
}

// ---------------------------------------------------------------------------
// Interviews
// ---------------------------------------------------------------------------

export interface InterviewListData {
  items: (Omit<Interview, "interviewerIdsJson" | "manualEvaluationJson"> & {
    interviewerIds: string[];
    manualEvaluation: { rating: number; decision: string; comments: string } | null;
  })[];
}

export interface CreateInterviewInput {
  round?: number;
  scheduledAt?: number;
  meetingLink?: string;
  interviewerIds?: string[];
}

export interface UpdateInterviewInput {
  status?: string;
  scheduledAt?: number;
  meetingLink?: string;
  manualEvaluation?: { rating: number; decision: string; comments: string };
}

// ---------------------------------------------------------------------------
// Workspace
// ---------------------------------------------------------------------------

export interface WorkspaceData {
  candidateId: string;
  sessionId: string;
  url: string;
  status: string;
}

// ---------------------------------------------------------------------------
// Artifacts
// ---------------------------------------------------------------------------

export interface ArtifactListData {
  items: (Artifact & { latestVersion: Pick<ArtifactVersion, "version" | "feedbackText" | "createdAt"> | null })[];
}

export interface ArtifactDetailData {
  artifact: Artifact;
  versions: ArtifactVersion[];
}

export interface ArtifactFeedbackInput {
  feedback: string;
}

export interface ArtifactFeedbackData {
  artifactId: string;
  newVersion: number;
  status: "generating";
}

// ---------------------------------------------------------------------------
// Import
// ---------------------------------------------------------------------------

export interface ImportBatchListData {
  items: ImportBatch[];
}

export interface CreateImportBatchInput {
  paths: string[];
  autoScreen?: boolean;
}

export interface ImportBatchData extends ImportBatch {}

export interface ImportFileListData {
  items: ImportFileTask[];
}

export interface CreateImportBatchData {
  id: string;
  status: string;
  totalFiles: number;
  autoScreen: boolean;
  createdAt: number;
}

// ---------------------------------------------------------------------------
// Share
// ---------------------------------------------------------------------------

export interface ShareDevicesData {
  recentContacts: Pick<Device, "deviceId" | "deviceName" | "lastSeen">[];
  onlineDevices: Pick<Device, "deviceId" | "deviceName" | "ip" | "apiPort">[];
}

export interface ShareExportData {
  filePath: string;
  fileSize: number;
}

export interface ShareSendData {
  recordId: string;
  status: "success" | "failed";
  error?: string;
  transferredAt: number | null;
}

export interface ShareImportResult {
  result: "created" | "merged" | "conflict" | "failed";
  candidateId?: string;
  mergedFields?: string[];
  error?: string;
}

export interface ShareRecordListData {
  items: (ShareRecord & { targetDevice: Pick<Device, "deviceName" | "ip"> | null })[];
}

// ---------------------------------------------------------------------------
// Notifications
// ---------------------------------------------------------------------------

export interface NotificationListData {
  items: Notification[];
  unreadCount: number;
}

// ---------------------------------------------------------------------------
// Indicator
// ---------------------------------------------------------------------------

export type IndicatorStatus = "gray" | "green" | "yellow" | "red";

export interface IndicatorData {
  status: IndicatorStatus;
  reasons: string[];
}

// ---------------------------------------------------------------------------
// OpenCode System
// ---------------------------------------------------------------------------

export interface OpenCodeStatusData {
  running: boolean;
  baseUrl: string;
  host: string;
  port: number;
  crashed?: boolean;
}
