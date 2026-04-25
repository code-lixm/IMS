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
  InterviewAssessment,
  EmailConfig,
  EmailTemplate,
  Device,
  ParsedResume,
  AgentSourceType,
  AgentSceneAffinity,
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
  IMPORT_EXPORT_EMPTY: "IMPORT_EXPORT_EMPTY",
  IMPORT_EXPORT_BATCH_NOT_READY: "IMPORT_EXPORT_BATCH_NOT_READY",
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
  qrText: string | null;
  source: "background-image" | "element-screenshot" | "qr-text" | null;
  qrStatus: "no_scanned" | "is_scanned" | "confirm_logined" | "invalid_uuid" | string | null;
  scannedAt: number | null;
  confirmedAt: number | null;
  fetchedAt: number;
  refreshed: boolean;
  authenticated?: boolean;
  user?: {
    id: string;
    name: string;
    username: string;
    email: string | null;
  } | null;
}

export interface BaobaoLoginSessionStatusData {
  provider: "baobao";
  status: "pending" | "authenticated" | "error";
  qrStatus: "no_scanned" | "is_scanned" | "confirm_logined" | "invalid_uuid" | string | null;
  scannedAt: number | null;
  confirmedAt: number | null;
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

export interface SyncResetRunData extends SyncRunData {
  clearedCandidates: number;
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

export interface MatchingTemplate {
  id: string;
  name: string;
  description: string | null;
  prompt: string;
  isDefault: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface MatchingTemplateListData {
  items: MatchingTemplate[];
}

export interface CreateMatchingTemplateInput {
  name: string;
  description?: string;
  content: string;
  isDefault?: boolean;
}

export interface UpdateMatchingTemplateInput {
  name?: string;
  description?: string;
  content?: string;
  isDefault?: boolean;
}

export interface CreateInterviewAssessmentInput {
  interviewId: string;
  interviewerId?: string;
  technicalScore: number;
  communicationScore: number;
  cultureFitScore: number;
  overallScore: number;
  technicalEvaluation: string;
  communicationEvaluation: string;
  cultureFitEvaluation: string;
  overallEvaluation: string;
  recommendation: "pass" | "hold" | "reject";
}

export interface UpdateInterviewAssessmentInput {
  interviewId?: string;
  interviewerId?: string;
  technicalScore?: number;
  communicationScore?: number;
  cultureFitScore?: number;
  overallScore?: number;
  technicalEvaluation?: string;
  communicationEvaluation?: string;
  cultureFitEvaluation?: string;
  overallEvaluation?: string;
  recommendation?: "pass" | "hold" | "reject";
}

export interface InterviewAssessmentListData {
  items: InterviewAssessment[];
}

export interface InterviewAssessmentReportData {
  assessment: InterviewAssessment;
  reportMarkdown: string;
  generatedAt: number;
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
  items: ImportBatchListItem[];
}

export interface ImportBatchListItem extends ImportBatch {
  analysisTotalFiles: number;
  analysisCompletedFiles: number;
  analysisPendingFiles: number;
  analysisRunningFiles: number;
}

export interface CreateImportBatchInput {
  paths: string[];
  autoScreen?: boolean;
}

export interface ImportBatchData extends ImportBatchListItem {}

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
  candidateName?: string | null;
  candidatePosition?: string | null;
  candidateYearsOfExperience?: number | null;
  screeningBaseUrl?: string | null;
  summary: string;
  strengths: string[];
  concerns: string[];
  recommendedAction: string;
  wechatConclusion?: string;
  wechatReason?: string;
  wechatAction?: string;
  wechatCopyText: string;
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

export type ImportScreeningExportMode = "custom_bundle" | "wechat_text";

export interface ImportScreeningExportRequest {
  mode: ImportScreeningExportMode;
  batchIds: string[];
  selectedTaskIds?: string[];
  scoreMin?: number | null;
  scoreMax?: number | null;
  includeReports?: boolean;
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
  result: "created" | "merged" | "failed";
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
// LUI (Local AI Workbench)
// ---------------------------------------------------------------------------

export interface ConversationData {
  id: string;
  title: string;
  candidateId: string | null;
  agentId?: string | null;
  agentResolution?: {
    requestedAgentId: string | null;
    resolvedAgentId: string | null;
    fallbackAgentId: string | null;
    fallbackAgentName: string | null;
    missing: boolean;
    message: string | null;
  };
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
  workflow: LuiWorkflowData | null;
}

export type LuiWorkflowStage = "S0" | "S1" | "S2" | "completed";

export interface LuiWorkflowArtifactData {
  id: string;
  stage: LuiWorkflowStage;
  title: string;
  type: "markdown";
  fileResourceId: string | null;
  fileName: string;
  filePath: string | null;
  language: "markdown";
  summary: string | null;
  createdAt: number;
}

export interface LuiAssessmentWechatSummaryItemData {
  scene: string;
  performance: string;
  evaluation: string;
}

export interface LuiAssessmentQuestionScoreData {
  topic: string;
  observation: string;
  score: string;
}

export interface LuiAssessmentBalanceHighlightData {
  dimension: string;
  strength: string;
  risk: string;
}

export interface LuiAssessmentFeedbackComparisonData {
  topic: string;
  systemJudgement: string;
  interviewerFeedback: string;
  conclusion: string;
}

export interface LuiStructuredInterviewAssessmentData {
  candidateName: string;
  roleAbbr: string;
  years: string;
  round: number;
  grade: "A+" | "A" | "B+" | "B" | "C";
  eliminateReasons: string[];
  recommendedLevel: string;
  normalizedRecommendedLevel: string;
  interviewEvaluationLabel: string;
  scoreSummary: string;
  evidenceCompleteness: string;
  overallJudgement: string;
  analysisConclusion: string;
  questionScores: LuiAssessmentQuestionScoreData[];
  balanceHighlights: LuiAssessmentBalanceHighlightData[];
  feedbackComparisons: LuiAssessmentFeedbackComparisonData[];
  wechatSummaryItems: LuiAssessmentWechatSummaryItemData[];
  nextRound: number | null;
  nextRoundSuggestions: string[];
  nextRoundFocus: string[];
  shouldContinue: boolean;
  wechatCopyText: string;
}

export interface LuiWorkflowData {
  id: string;
  candidateId: string;
  conversationId: string | null;
  currentStage: LuiWorkflowStage;
  confirmedRound: number | null;
  suggestedNextRound: number | null;
  requiresRoundConfirmation: boolean;
  recommendedNextStage: LuiWorkflowStage | null;
  availableNextStages: LuiWorkflowStage[];
  recommendedAction: string | null;
  status: "active" | "paused" | "completed" | "error";
  artifacts: LuiWorkflowArtifactData[];
  latestAssessment: LuiStructuredInterviewAssessmentData | null;
  updatedAt: number;
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
  workflowAction: "confirm-round" | "advance-stage" | "complete-workflow" | null;
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
  modelId?: string;
  modelDisplayName?: string;
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

export interface AgentLifecycleData {
  agentId: string;
  displayName: string;
  name: string;
  sourceType: AgentSourceType;
  isBuiltin: boolean;
  isMutable: boolean;
  isDefault: boolean;
  sceneAffinity: AgentSceneAffinity;
}

export interface AgentData {
  id: string;
  agentId: string;
  name: string;
  displayName: string;
  description: string | null;
  engine: "builtin" | "deepagents";
  mode: "all" | "chat" | "ask" | "workflow";
  temperature: number;
  systemPrompt: string | null;
  tools: string[];
  sourceType: AgentSourceType;
  isBuiltin: boolean;
  isMutable: boolean;
  isDefault: boolean;
  sceneAffinity: AgentSceneAffinity;
  createdAt: number;
  updatedAt: number;
}

export interface AgentListData {
  items: AgentData[];
}

export interface CreateAgentInput {
  name?: string;
  displayName?: string;
  description?: string;
  engine?: "builtin" | "deepagents";
  mode?: "all" | "chat" | "ask" | "workflow";
  temperature?: number;
  systemPrompt?: string;
  tools?: string[];
  isDefault?: boolean;
  sceneAffinity?: AgentSceneAffinity;
}

export interface UpdateAgentInput {
  name?: string;
  displayName?: string;
  description?: string;
  engine?: "builtin" | "deepagents";
  mode?: "all" | "chat" | "ask" | "workflow";
  temperature?: number;
  systemPrompt?: string;
  tools?: string[];
  isDefault?: boolean;
  sceneAffinity?: AgentSceneAffinity;
}
