/**
 * Shared database schema types.
 *
 * These are plain TypeScript types mirroring the server DB schema.
 * They are the source of truth for both the server (direct use)
 * and the web app (API response shapes).
 *
 * NOTE: Drizzle schema definitions live in packages/server/src/schema.ts
 * and import from drizzle-orm/sqlite-core. Only plain types live here.
 */

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

export type TokenStatus = "valid" | "expired" | "unauthenticated";
export type CandidateSource = "local" | "remote" | "hybrid";
export type InterviewStatus = "scheduled" | "completed" | "cancelled" | "no_show";
export type InterviewAssessmentRecommendation = "pass" | "hold" | "reject";
export type ArtifactType = "screening" | "questions" | "evaluation" | "summary";
export type WorkspaceStatus = "active" | "degraded" | "closed";
export type BatchStatus =
  | "queued"
  | "preparing"
  | "extracting"
  | "classifying"
  | "processing"
  | "indexing"
  | "completed"
  | "partial_success"
  | "failed"
  | "cancelled";
export type FileTaskStatus =
  | "queued"
  | "extracting"
  | "text_extracting"
  | "ocr_running"
  | "parsing"
  | "matching_candidate"
  | "saving"
  | "ai_screening"
  | "done"
  | "failed"
  | "skipped";
export type ShareType = "send" | "receive";
export type ShareStatus = "pending" | "success" | "failed" | "conflict";
export type NotificationType =
  | "sync_error"
  | "import_complete"
  | "share_received"
  | "token_expired"
  | "system";

// ---------------------------------------------------------------------------
// Tables
// ---------------------------------------------------------------------------

export interface User {
  id: string;
  name: string;
  email: string | null;
  tokenStatus: TokenStatus;
  lastSyncAt: number | null;
  settingsJson: string | null;
}

export interface Candidate {
  id: string;
  source: CandidateSource;
  remoteId: string | null;
  remoteResumeId: string | null;
  name: string;
  phone: string | null;
  email: string | null;
  position: string | null;
  organizationName: string | null;
  orgAllParentName: string | null;
  recruitmentSourceName: string | null;
  yearsOfExperience: number | null;
  tagsJson: string; // JSON string array
  deletedAt: number | null; // soft delete unix ms
  createdAt: number;
  updatedAt: number;
}

export interface Resume {
  id: string;
  candidateId: string;
  fileName: string;
  fileType: string;
  fileSize: number;
  filePath: string;
  extractedText: string | null;
  parsedDataJson: string | null; // ParsedResume JSON
  ocrConfidence: number | null;
  createdAt: number;
}

export interface Interview {
  id: string;
  candidateId: string;
  remoteId: string | null;
  round: number;
  status: InterviewStatus;
  statusRaw: string | null;
  interviewType: number | null;
  interviewResult: number | null;
  interviewResultString: string | null;
  scheduledAt: number | null;
  interviewPlace: string | null;
  meetingLink: string | null;
  dockingHrName: string | null;
  dockingHrbpName: string | null;
  checkInTime: number | null;
  arrivalDate: string | null;
  eliminateReasonString: string | null;
  remark: string | null;
  interviewerIdsJson: string; // JSON string array
  manualEvaluationJson: string | null; // { rating, decision, comments }
  createdAt: number;
  updatedAt: number;
}

export interface InterviewAssessment {
  id: string;
  candidateId: string;
  interviewId: string;
  interviewerId: string;
  technicalScore: number;
  communicationScore: number;
  cultureFitScore: number;
  overallScore: number;
  technicalEvaluation: string;
  communicationEvaluation: string;
  cultureFitEvaluation: string;
  overallEvaluation: string;
  recommendation: InterviewAssessmentRecommendation;
  reportMarkdown: string | null;
  createdAt: number;
  updatedAt: number;
}

export interface Artifact {
  id: string;
  candidateId: string;
  interviewId: string | null;
  type: ArtifactType;
  roundNumber: number | null;
  currentVersion: number;
  createdAt: number;
  updatedAt: number;
}

export interface ArtifactVersion {
  id: string;
  artifactId: string;
  version: number;
  promptSnapshot: string | null;
  feedbackText: string | null;
  structuredDataJson: string | null;
  markdownPath: string | null;
  pdfPath: string | null;
  createdAt: number;
}

export interface CandidateWorkspace {
  id: string;
  candidateId: string;
  workspaceStatus: WorkspaceStatus;
  lastAccessedAt: number;
  createdAt: number;
}

export interface ImportBatch {
  id: string;
  status: BatchStatus;
  sourceType: string | null;
  currentStage: string | null;
  totalFiles: number;
  processedFiles: number;
  successFiles: number;
  failedFiles: number;
  autoScreen: boolean;
  createdAt: number;
  startedAt: number | null;
  completedAt: number | null;
}

export interface ImportFileTask {
  id: string;
  batchId: string;
  originalPath: string;
  normalizedPath: string | null;
  fileType: string | null;
  status: FileTaskStatus;
  stage: string | null;
  errorCode: string | null;
  errorMessage: string | null;
  candidateId: string | null;
  resultJson: string | null;
  retryCount: number;
  createdAt: number;
  updatedAt: number;
}

export interface ShareRecord {
  id: string;
  type: ShareType;
  candidateId: string;
  targetDeviceJson: string | null;
  exportFilePath: string | null;
  status: ShareStatus;
  resultJson: string | null;
  createdAt: number;
  completedAt: number | null;
}

export interface Notification {
  id: string;
  userId: string | null;
  type: NotificationType;
  title: string;
  body: string | null;
  readAt: number | null;
  createdAt: number;
}

// ---------------------------------------------------------------------------
// LUI - Conversation
// ---------------------------------------------------------------------------

export interface Conversation {
  id: string;
  title: string;
  candidateId: string | null;
  agentId: string | null;
  modelProvider: string | null;
  modelId: string | null;
  temperature: number | null;
  createdAt: number;
  updatedAt: number;
}

// ---------------------------------------------------------------------------
// LUI - Message
// ---------------------------------------------------------------------------

export type MessageRole = "user" | "assistant" | "system";
export type MessageStatus = "streaming" | "error" | "complete";

export interface Message {
  id: string;
  conversationId: string;
  role: MessageRole;
  content: string;
  reasoning: string | null;
  toolsJson: string | null;
  status: MessageStatus;
  createdAt: number;
}

// ---------------------------------------------------------------------------
// LUI - FileResource
// ---------------------------------------------------------------------------

export type FileResourceType = "code" | "document" | "image";

export interface FileResource {
  id: string;
  conversationId: string;
  name: string;
  type: FileResourceType;
  content: string;
  filePath: string | null;
  language: string | null;
  size: number;
  createdAt: number;
}

// ---------------------------------------------------------------------------
// LUI - Agent
// ---------------------------------------------------------------------------

export type AgentMode = "all" | "chat" | "ask" | "workflow";

export interface Agent {
  id: string;
  name: string;
  description: string | null;
  mode: AgentMode;
  temperature: number;
  systemPrompt: string | null;
  tools: string[];
  isDefault: boolean;
  createdAt: number;
  updatedAt: number;
}

// ---------------------------------------------------------------------------
// LUI - Memory (Phase 2.2)
// ---------------------------------------------------------------------------

export type MemoryType = "fact" | "insight" | "preference";
export type MemoryScope = "global" | "candidate";

export interface AgentMemory {
  id: string;
  type: MemoryType;
  scope: MemoryScope;
  content: string;
  embedding: string | null;
  importance: number;
  createdAt: number;
}


// ---------------------------------------------------------------------------
// LUI - Session Memory (Phase 2.3)
// ---------------------------------------------------------------------------

export type SessionMemoryType = "context" | "summary" | "decision" | "action_item";

export interface SessionMemory {
  id: string;
  conversationId: string;
  type: SessionMemoryType;
  content: string;
  metadata: string | null;
  importance: number;
  createdAt: number;
  expiresAt: number | null;
}
// ---------------------------------------------------------------------------
// LUI - Provider Credential
// ---------------------------------------------------------------------------

export interface ProviderCredential {
  id: string;
  provider: string;
  apiKey: string;
  createdAt: number;
  updatedAt: number;
}

export interface EmailConfig {
  id: string;
  userId: string;
  smtpHost: string;
  smtpPort: number;
  smtpUser: string;
  smtpPass: string;
  fromName: string;
  fromEmail: string;
  isDefault: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface EmailTemplate {
  id: string;
  userId: string;
  name: string;
  subject: string;
  body: string;
  variables: string[];
  createdAt: number;
  updatedAt: number;
}

// ---------------------------------------------------------------------------
// Parsed resume shape (used in API responses)
// ---------------------------------------------------------------------------

export interface ParsedResume {
  name: string | null;
  phone: string | null;
  email: string | null;
  position: string | null;
  yearsOfExperience: number | null;
  skills: string[];
  education: string[];
  workHistory: string[];
  rawText: string;
}

// ---------------------------------------------------------------------------
// Device info (for LAN discovery)
// ---------------------------------------------------------------------------

export interface Device {
  deviceId: string;
  deviceName: string;
  ip: string;
  apiPort: number;
  version: string;
  lastSeen: number;
}
