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
  EmailConfig,
  EmailTemplate,
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
  user: { id: string; name: string; email: string | null; phone?: string | null } | null;
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

export interface BaobaoLoginQrData {
  provider: "baobao";
  imageSrc: string;
  source: "background-image" | "element-screenshot";
  fetchedAt: number;
  refreshed: boolean;
}

export interface BaobaoLoginSessionStatusData {
  provider: "baobao";
  status: "pending" | "authenticated" | "error";
  currentUrl: string;
  lastCheckedAt: number;
  error: string | null;
  authenticated: boolean;
  user: {
    id: string;
    name: string;
    username: string;
    email: string | null;
  } | null;
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

export interface EmailConfigListData {
  items: EmailConfig[];
}

export interface EmailTemplateListData {
  items: EmailTemplate[];
}

export interface CreateEmailConfigInput {
  userId?: string;
  smtpHost: string;
  smtpPort: number;
  smtpUser: string;
  smtpPass: string;
  fromName: string;
  fromEmail: string;
  isDefault?: boolean;
}

export interface UpdateEmailConfigInput {
  userId?: string;
  smtpHost?: string;
  smtpPort?: number;
  smtpUser?: string;
  smtpPass?: string;
  fromName?: string;
  fromEmail?: string;
  isDefault?: boolean;
}

export interface CreateEmailTemplateInput {
  userId?: string;
  name: string;
  subject: string;
  body: string;
}

export interface UpdateEmailTemplateInput {
  userId?: string;
  name?: string;
  subject?: string;
  body?: string;
}

export interface SendEmailInput {
  userId?: string;
  configId?: string;
  to: string;
  subject?: string;
  body?: string;
  templateId?: string;
  variables?: Record<string, string>;
}

export interface SendEmailData {
  messageId: string;
  configId: string;
  templateId: string | null;
  accepted: string[];
  rejected: string[];
  subject: string;
  body: string;
  sentAt: number;
}

// ---------------------------------------------------------------------------
// Candidates
// ---------------------------------------------------------------------------

export type CandidateResumeStatus = "missing" | "uploaded" | "parsed" | "failed";

export type CandidatePipelineStage = "new" | "screening" | "interview" | "offer" | "rejected";

export type CandidateInterviewState = "none" | "scheduled" | "completed" | "cancelled";

export interface CandidateListItemSummary extends Candidate {
  tags: string[];
  applyPositionName?: string | null;
  interviewTime?: number | null;
  interviewType?: number | null;
  interviewTypeLabel?: string | null;
  interviewResult?: number | null;
  interviewResultString?: string | null;
  interviewPlace?: string | null;
  interviewUrl?: string | null;
  dockingHrName?: string | null;
  dockingHrbpName?: string | null;
  interviewOwnerName?: string | null;
  applicationStatusText?: string | null;
  applicationStatus?: number | null;
  checkInTime?: number | null;
  resumeStatus?: CandidateResumeStatus;
  pipelineStage?: CandidatePipelineStage;
  interviewState?: CandidateInterviewState;
  lastActivityAt?: number | null;
}

export interface CandidateListData {
  items: CandidateListItemSummary[];
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

export type ImportScreeningVerdict = "pass" | "review" | "reject";

export type ImportScreeningStatus = "not_requested" | "running" | "completed";

export type ImportScreeningSource = "ai" | "heuristic";

export interface ImportScreeningConclusion {
  verdict: ImportScreeningVerdict;
  label: string;
  score: number;
  summary: string;
  strengths: string[];
  concerns: string[];
  recommendedAction: string;
}

export interface ImportTaskResultData {
  parsedResume: ParsedResume;
  screeningStatus?: ImportScreeningStatus;
  screeningSource?: ImportScreeningSource | null;
  screeningError?: string | null;
  screeningConclusion?: ImportScreeningConclusion | null;
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

export interface ConflictField {
  name: string;
  label: string;
  localValue: string | number | null;
  importValue: string | number | null;
}

export interface ShareImportResult {
  result: "created" | "merged" | "conflict" | "failed";
  candidateId?: string;
  mergedFields?: string[];
  candidateName?: string;
  phone?: string | null;
  email?: string | null;
  conflicts?: ConflictField[];
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
// LUI (Local AI Workbench)
// ---------------------------------------------------------------------------

export interface ConversationData {
  id: string;
  title: string;
  candidateId: string | null;
  agentId?: string | null;
  modelProvider?: string | null;
  modelId?: string | null;
  temperature?: number | null;
  createdAt: number;
  updatedAt: number;
}

export interface ConversationListData {
  items: ConversationData[];
}

export interface ConversationDetailData {
  conversation: ConversationData;
  messages: MessageData[];
  files: FileResourceData[];
}

export interface CreateConversationInput {
  title?: string;
  candidateId?: string;
  agentId?: string | null;
  modelProvider?: string | null;
  modelId?: string | null;
  temperature?: number | null;
}

export interface UpdateConversationInput {
  title?: string;
  candidateId?: string | null;
  agentId?: string | null;
  modelProvider?: string | null;
  modelId?: string | null;
  temperature?: number | null;
}

export interface MessageData {
  id: string;
  conversationId: string;
  role: "user" | "assistant" | "system";
  content: string;
  reasoning: string | null;
  tools: unknown[] | null;
  status: "streaming" | "error" | "complete";
  createdAt: number;
}

export interface SendMessageInput {
  content: string;
  fileIds?: string[];
  agentId?: string;
  modelProvider?: string;
  modelId?: string;
  endpointBaseURL?: string;
  endpointApiKey?: string;
  temperature?: number;
}

export interface FileResourceData {
  id: string;
  conversationId: string;
  name: string;
  type: "code" | "document" | "image";
  content: string;
  language: string | null;
  size: number;
  createdAt: number;
}

export interface FileResourceListData {
  items: FileResourceData[];
}

export interface UploadFileData {
  id: string;
  name: string;
  type: "code" | "document" | "image";
  size: number;
  content: string;
}

export interface LuiCredentialStatusData {
  provider: string;
  isAuthorized: boolean;
}

export interface SetLuiCredentialInput {
  apiKey: string;
}

export interface LuiGatewayEndpointData {
  id: string;
  name: string;
  baseURL: string;
  apiKey?: string;
  provider: string;
  /**
   * 预设提供商 ID。当提供此字段时，系统会自动从预设配置中填充
   * id、name、baseURL、provider 等字段，只需提供 apiKey 即可。
   */
  providerId?: string;
}

export interface LuiPresetProviderData {
  id: string;
  name: string;
  icon: string;
}

export interface LuiPresetProviderListData {
  providers: LuiPresetProviderData[];
}

export interface LuiSettingsData {
  customEndpoints: LuiGatewayEndpointData[];
  defaultEndpointId: string | null;
}

export interface UpdateLuiSettingsInput {
  customEndpoints: LuiGatewayEndpointData[];
  defaultEndpointId: string | null;
}

// ---------------------------------------------------------------------------
// LUI - Agent
// ---------------------------------------------------------------------------

export interface AgentData {
  id: string;
  name: string;
  description: string | null;
  engine: "builtin" | "deepagents";
  mode: "all" | "chat" | "ask" | "workflow";
  temperature: number;
  systemPrompt: string | null;
  tools: string[];
  isDefault: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface AgentListData {
  items: AgentData[];
}

export interface CreateAgentInput {
  name: string;
  description?: string;
  engine?: "builtin" | "deepagents";
  mode?: "all" | "chat" | "ask" | "workflow";
  temperature?: number;
  systemPrompt?: string;
  tools?: string[];
  isDefault?: boolean;
}

export interface UpdateAgentInput {
  description?: string;
  engine?: "builtin" | "deepagents";
  mode?: "all" | "chat" | "ask" | "workflow";
  temperature?: number;
  systemPrompt?: string;
  tools?: string[];
  isDefault?: boolean;
}
