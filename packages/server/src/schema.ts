import { integer, real, sqliteTable, text } from "drizzle-orm/sqlite-core";

// ---------------------------------------------------------------------------
// User
// ---------------------------------------------------------------------------
export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email"),
  tokenStatus: text("token_status").notNull().default("unauthenticated"),
  lastSyncAt: integer("last_sync_at"),
  settingsJson: text("settings_json"),
});

// ---------------------------------------------------------------------------
// Candidate
// ---------------------------------------------------------------------------
export const candidates = sqliteTable("candidates", {
  id: text("id").primaryKey(),
  source: text("source").notNull().default("local"),
  remoteId: text("remote_id"),
  remoteResumeId: text("remote_resume_id"),
  name: text("name").notNull(),
  phone: text("phone"),
  email: text("email"),
  position: text("position"),
  organizationName: text("organization_name"),
  orgAllParentName: text("org_all_parent_name"),
  recruitmentSourceName: text("recruitment_source_name"),
  yearsOfExperience: integer("years_of_experience"),
  tagsJson: text("tags_json"),
  deletedAt: integer("deleted_at"),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
});

// ---------------------------------------------------------------------------
// Resume
// ---------------------------------------------------------------------------
export const resumes = sqliteTable("resumes", {
  id: text("id").primaryKey(),
  candidateId: text("candidate_id").notNull().references(() => candidates.id),
  fileName: text("file_name").notNull(),
  fileType: text("file_type").notNull(),
  fileSize: integer("file_size").notNull(),
  filePath: text("file_path").notNull(),
  extractedText: text("extracted_text"),
  parsedDataJson: text("parsed_data_json"),
  ocrConfidence: integer("ocr_confidence"),
  createdAt: integer("created_at").notNull(),
});

// ---------------------------------------------------------------------------
// Interview
// ---------------------------------------------------------------------------
export const interviews = sqliteTable("interviews", {
  id: text("id").primaryKey(),
  candidateId: text("candidate_id").notNull().references(() => candidates.id),
  remoteId: text("remote_id"),
  round: integer("round").notNull().default(1),
  status: text("status").notNull().default("scheduled"),
  statusRaw: text("status_raw"),
  interviewType: integer("interview_type"),
  interviewResult: integer("interview_result"),
  interviewResultString: text("interview_result_string"),
  scheduledAt: integer("scheduled_at"),
  interviewPlace: text("interview_place"),
  meetingLink: text("meeting_link"),
  dockingHrName: text("docking_hr_name"),
  dockingHrbpName: text("docking_hrbp_name"),
  checkInTime: integer("check_in_time"),
  arrivalDate: text("arrival_date"),
  eliminateReasonString: text("eliminate_reason_string"),
  remark: text("remark"),
  interviewerIdsJson: text("interviewer_ids_json"),
  manualEvaluationJson: text("manual_evaluation_json"),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
});

export const interviewAssessments = sqliteTable("interview_assessments", {
  id: text("id").primaryKey(),
  candidateId: text("candidate_id").notNull().references(() => candidates.id),
  interviewId: text("interview_id").notNull().references(() => interviews.id),
  interviewerId: text("interviewer_id").notNull(),
  technicalScore: integer("technical_score").notNull(),
  communicationScore: integer("communication_score").notNull(),
  cultureFitScore: integer("culture_fit_score").notNull(),
  overallScore: integer("overall_score").notNull(),
  technicalEvaluation: text("technical_evaluation").notNull(),
  communicationEvaluation: text("communication_evaluation").notNull(),
  cultureFitEvaluation: text("culture_fit_evaluation").notNull(),
  overallEvaluation: text("overall_evaluation").notNull(),
  recommendation: text("recommendation", { enum: ["pass", "hold", "reject"] }).notNull(),
  reportMarkdown: text("report_markdown"),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
});

// ---------------------------------------------------------------------------
// Artifact
// ---------------------------------------------------------------------------
export const artifacts = sqliteTable("artifacts", {
  id: text("id").primaryKey(),
  candidateId: text("candidate_id").notNull().references(() => candidates.id),
  interviewId: text("interview_id").references(() => interviews.id),
  type: text("type").notNull(),
  roundNumber: integer("round_number"),
  currentVersion: integer("current_version").notNull().default(1),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
});

// ---------------------------------------------------------------------------
// ArtifactVersion
// ---------------------------------------------------------------------------
export const artifactVersions = sqliteTable("artifact_versions", {
  id: text("id").primaryKey(),
  artifactId: text("artifact_id").notNull().references(() => artifacts.id),
  version: integer("version").notNull(),
  promptSnapshot: text("prompt_snapshot"),
  feedbackText: text("feedback_text"),
  structuredDataJson: text("structured_data_json"),
  markdownPath: text("markdown_path"),
  pdfPath: text("pdf_path"),
  createdAt: integer("created_at").notNull(),
});

// ---------------------------------------------------------------------------
// CandidateWorkspace
// ---------------------------------------------------------------------------
export const candidateWorkspaces = sqliteTable("candidate_workspaces", {
  id: text("id").primaryKey(),
  candidateId: text("candidate_id").notNull().references(() => candidates.id),
  workspaceStatus: text("workspace_status").notNull().default("active"),
  lastAccessedAt: integer("last_accessed_at").notNull(),
  createdAt: integer("created_at").notNull(),
});

// ---------------------------------------------------------------------------
// ImportBatch
// ---------------------------------------------------------------------------
export const importBatches = sqliteTable("import_batches", {
  id: text("id").primaryKey(),
  displayName: text("display_name"),
  status: text("status").notNull().default("queued"),
  sourceType: text("source_type"),
  currentStage: text("current_stage"),
  totalFiles: integer("total_files").notNull().default(0),
  processedFiles: integer("processed_files").notNull().default(0),
  successFiles: integer("success_files").notNull().default(0),
  failedFiles: integer("failed_files").notNull().default(0),
  autoScreen: integer("auto_screen", { mode: "boolean" }).default(false),
  createdAt: integer("created_at").notNull(),
  startedAt: integer("started_at"),
  completedAt: integer("completed_at"),
});

// ---------------------------------------------------------------------------
// ImportFileTask
// ---------------------------------------------------------------------------
export const importFileTasks = sqliteTable("import_file_tasks", {
  id: text("id").primaryKey(),
  batchId: text("batch_id").notNull().references(() => importBatches.id),
  originalPath: text("original_path").notNull(),
  normalizedPath: text("normalized_path"),
  fileType: text("file_type"),
  status: text("status").notNull().default("queued"),
  stage: text("stage"),
  errorCode: text("error_code"),
  errorMessage: text("error_message"),
  candidateId: text("candidate_id").references(() => candidates.id),
  resultJson: text("result_json"),
  retryCount: integer("retry_count").notNull().default(0),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
});

// ---------------------------------------------------------------------------
// ShareRecord
// ---------------------------------------------------------------------------
export const shareRecords = sqliteTable("share_records", {
  id: text("id").primaryKey(),
  type: text("type").notNull(),
  candidateId: text("candidate_id").notNull().references(() => candidates.id),
  targetDeviceJson: text("target_device_json"),
  exportFilePath: text("export_file_path"),
  status: text("status").notNull().default("pending"),
  resultJson: text("result_json"),
  createdAt: integer("created_at").notNull(),
  completedAt: integer("completed_at"),
});

// ---------------------------------------------------------------------------
// Notification
// ---------------------------------------------------------------------------
export const notifications = sqliteTable("notifications", {
  id: text("id").primaryKey(),
  userId: text("user_id"),
  type: text("type").notNull(),
  title: text("title").notNull(),
  body: text("body"),
  readAt: integer("read_at"),
  createdAt: integer("created_at").notNull(),
});

export const emailConfigs = sqliteTable("email_configs", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  smtpHost: text("smtp_host").notNull(),
  smtpPort: integer("smtp_port").notNull(),
  smtpUser: text("smtp_user").notNull(),
  smtpPass: text("smtp_pass").notNull(),
  fromName: text("from_name").notNull(),
  fromEmail: text("from_email").notNull(),
  isDefault: integer("is_default", { mode: "boolean" }).notNull().default(false),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
});

export const emailTemplates = sqliteTable("email_templates", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  name: text("name").notNull(),
  subject: text("subject").notNull(),
  body: text("body").notNull(),
  variables: text("variables").notNull(),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
});

export const screeningTemplates = sqliteTable("screening_templates", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  prompt: text("prompt").notNull(),
  isDefault: integer("is_default", { mode: "boolean" }).notNull().default(false),
  isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
  version: integer("version").notNull().default(1),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
});

// ---------------------------------------------------------------------------
// LUI - Conversation
// ---------------------------------------------------------------------------
export const conversations = sqliteTable("conversations", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  candidateId: text("candidate_id").references(() => candidates.id),
  agentId: text("agent_id"),
  modelProvider: text("model_provider"),
  modelId: text("model_id"),
  temperature: real("temperature"),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
});

// ---------------------------------------------------------------------------
// LUI - Message
// ---------------------------------------------------------------------------
export const messages = sqliteTable("messages", {
  id: text("id").primaryKey(),
  conversationId: text("conversation_id").notNull().references(() => conversations.id),
  role: text("role", { enum: ["user", "assistant", "system"] }).notNull(),
  content: text("content").notNull(),
  reasoning: text("reasoning"),
  toolsJson: text("tools_json"),
  status: text("status", { enum: ["streaming", "error", "complete"] }).notNull(),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
});

// ---------------------------------------------------------------------------
// LUI - FileResource
// ---------------------------------------------------------------------------
export const fileResources = sqliteTable("file_resources", {
  id: text("id").primaryKey(),
  conversationId: text("conversation_id").notNull().references(() => conversations.id),
  name: text("name").notNull(),
  type: text("type", { enum: ["code", "document", "image"] }).notNull(),
  content: text("content").notNull(),
  filePath: text("file_path"), // Local filesystem path
  language: text("language"),
  size: integer("size").notNull(),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
});

// ---------------------------------------------------------------------------
// LUI - Agent
// ---------------------------------------------------------------------------
export const agents = sqliteTable("agents", {
  id: text("id").primaryKey(),
  name: text("name").notNull().unique(),
  description: text("description"),
  sourceType: text("source_type", { enum: ["builtin", "custom", "imported"] }).notNull().default("custom"),
  isMutable: integer("is_mutable", { mode: "boolean" }).notNull().default(true),
  sceneAffinity: text("scene_affinity", { enum: ["general", "interview"] }).notNull().default("general"),
  engine: text("engine", { enum: ["builtin", "deepagents"] }).notNull().default("builtin"),
  mode: text("mode", { enum: ["all", "chat", "ask", "workflow"] }).notNull().default("chat"),
  temperature: integer("temperature").notNull().default(0),
  systemPrompt: text("system_prompt"),
  toolsJson: text("tools_json"),
  isDefault: integer("is_default", { mode: "boolean" }).notNull().default(false),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
});

// ---------------------------------------------------------------------------
// LUI - ProviderCredential
// ---------------------------------------------------------------------------
export const providerCredentials = sqliteTable("provider_credentials", {
  id: text("id").primaryKey(),
  provider: text("provider").notNull().unique(),
  apiKey: text("api_key").notNull(),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
});

// ---------------------------------------------------------------------------
// LUI - Memory (Phase 2.2)
// ---------------------------------------------------------------------------
export const memories = sqliteTable("memories", {
  id: text("id").primaryKey(),
  type: text("type", { enum: ["fact", "insight", "preference"] }).notNull(),
  scope: text("scope", { enum: ["global", "candidate"] }).notNull(),
  content: text("content").notNull(),
  embedding: text("embedding"),
  importance: integer("importance").notNull().default(5),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
});

// ---------------------------------------------------------------------------
// Remote User (Baobao)
// ---------------------------------------------------------------------------
export const remoteUsers = sqliteTable("remote_users", {
  id: text("id").primaryKey(),
  provider: text("provider").notNull().default("baobao"),
  name: text("name").notNull(),
  username: text("username").notNull(),
  email: text("email"),
  remoteId: text("remote_id"),
  token: text("token").notNull(),
  cookieJson: text("cookie_json"),
  tokenExpAt: integer("token_exp_at"),
  userDataJson: text("user_data_json"),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
});

// ---------------------------------------------------------------------------
// LUI - Workflow State (Agent Mode Stage Management)
// ---------------------------------------------------------------------------
export const luiWorkflows = sqliteTable("lui_workflows", {
  id: text("id").primaryKey(),
  candidateId: text("candidate_id").notNull().references(() => candidates.id),
  conversationId: text("conversation_id").references(() => conversations.id),
  currentStage: text("current_stage", { enum: ["S0", "S1", "S2", "completed"] }).notNull().default("S0"),
  stageDataJson: text("stage_data_json"), // stage-specific data
  documentsJson: text("documents_json"), // { S0: {...}, S1: {...}, S2: {...} }
  status: text("status", { enum: ["active", "paused", "completed", "error"] }).notNull().default("active"),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
});

// ---------------------------------------------------------------------------
// LUI - Session Memory (Phase 2.3)
// ---------------------------------------------------------------------------
export const sessionMemories = sqliteTable("session_memories", {
  id: text("id").primaryKey(),
  conversationId: text("conversation_id").notNull().references(() => conversations.id),
  type: text("type", { enum: ["context", "summary", "decision", "action_item"] }).notNull(),
  content: text("content").notNull(),
  metadata: text("metadata"),
  importance: integer("importance").notNull().default(5),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  expiresAt: integer("expires_at", { mode: "timestamp" }),
});

// ---------------------------------------------------------------------------
// University Cache
// ---------------------------------------------------------------------------
export const universityCache = sqliteTable("university_cache", {
  id: text("id").primaryKey(),
  schoolName: text("school_name").notNull().unique(),
  responseJson: text("response_json").notNull(),
  is985: integer("is985").notNull().default(0),
  is211: integer("is211").notNull().default(0),
  isDoubleFirstClass: integer("is_double_first_class").notNull().default(0),
  detail: text("detail"),
  found: integer("found").notNull().default(1),
  queriedAt: integer("queried_at").notNull(),
});
